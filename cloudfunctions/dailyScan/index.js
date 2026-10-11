/**
 * 云函数：dailyScan —— 核心定时任务（每日凌晨 2:00 由定时触发器自动调用）
 *
 * 触发器配置见本目录 config.json（"0 0 2 * * * *" = 每天 02:00:00，北京时间）
 * 调试方式：微信开发者工具 → 云开发控制台 → 云函数 → dailyScan → 云端测试（直接运行）
 *
 * 扫描判定规则（一天 = 24 小时，daysSince = 距最后签到的整天数）：
 *   ① daysSince < thresholdDays - 1（剩余 > 1 天）
 *        安全期，若状态异常则复位为 normal（兜底清理）
 *   ② 状态为 normal 且剩余 ≤ 1 天（含已超期）
 *        → 进入预警窗口：先给用户本人邮箱发"确认提醒"邮件，
 *          状态置为 pre_alert，开始 24 小时确认期
 *   ③ 状态为 pre_alert 且距提醒邮件已超过 24 小时
 *        → 用户未在确认期内签到：给全部紧急联系人发预警邮件（只发一次），
 *          状态置为 alerted
 *   ④ 状态为 alerted
 *        → 不再重复发送，等待用户签到后自动复位（checkin 云函数负责复位）
 *
 * 邮件发送基于 nodemailer，SMTP 配置见本目录 config.js（模板：config.example.js）
 */
const cloud = require('wx-server-sdk')
const mailer = require('./mailer')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 一天的毫秒数
const DAY_MS = 24 * 60 * 60 * 1000
// 预警确认期：本人收到提醒邮件后 24 小时内签到则取消对联系人的预警
const CONFIRM_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * 分页读取全部用户
 * 云数据库单次 get 返回条数有上限，必须循环翻页读完
 */
async function getAllUsers() {
  const users = []
  const BATCH = 100
  let skip = 0
  for (;;) {
    const res = await db.collection('users').skip(skip).limit(BATCH).get()
    users.push(...res.data)
    if (res.data.length < BATCH) break // 最后一批不足 BATCH 条，读取结束
    skip += BATCH
  }
  return users
}

/**
 * 将用户预警状态复位为 normal
 * 用于：用户中途签到后的兜底清理 / 异常状态纠正
 */
async function resetStatus(userId) {
  await db.collection('users').doc(userId).update({
    data: {
      alertStatus: 'normal',
      preAlertSentAt: null,
      alertedAt: null,
      updatedAt: new Date()
    }
  })
}

/**
 * 处理单个用户的预警判定（主流程规则 ①~④ 见文件头注释）
 * @param {object} user   users 集合文档
 * @param {object} report 汇总报告（累计各动作次数）
 * @param {number} now    本次扫描时间戳（毫秒）
 */
async function handleUser(user, report, now) {
  // 1. 计算距最后签到的天数（向下取整）
  const lastTs = user.lastCheckinTime ? new Date(user.lastCheckinTime).getTime() : 0
  if (!lastTs) return // 无签到记录（理论上注册即签到，此处兜底跳过）

  const daysSince = Math.floor((now - lastTs) / DAY_MS)
  const threshold = Number(user.thresholdDays) || 7 // 失联判定天数，缺省 7 天
  const status = user.alertStatus || 'normal'

  // 2. 读取该用户全部紧急联系人；没有联系人则无从预警，跳过
  const contacts = (await db.collection('contacts').where({ userId: user.openid }).get()).data
  if (contacts.length === 0) {
    report.skippedNoContacts++
    return
  }

  const daysRemaining = threshold - daysSince // 距触发预警的剩余天数

  // ── 规则①：安全期（剩余 > 1 天） ──
  if (daysRemaining > 1) {
    if (status !== 'normal') {
      await resetStatus(user._id)
      report.reset++
    }
    return
  }

  // ── 规则②：首次进入预警窗口 → 先邮件提醒本人，进入 24h 确认期 ──
  if (status === 'normal') {
    if (user.myEmail) {
      // 用户填了邮箱：发送确认提醒，给用户一次"取消预警"的机会
      await mailer.sendMail({
        to: user.myEmail,
        ...mailer.buildReminderMail(user, contacts.length)
      })
    }
    // 未填邮箱时跳过提醒邮件，但仍进入确认期：
    // 宁可保守延迟 24h，也不在没有提醒的情况下直接惊动联系人
    await db.collection('users').doc(user._id).update({
      data: {
        alertStatus: 'pre_alert',
        preAlertSentAt: new Date(now),
        updatedAt: new Date(now)
      }
    })
    report.reminded++
    console.log(
      `[提醒] ${user.openid} 已 ${daysSince} 天未签到，` +
      `确认邮件${user.myEmail ? '已发送至 ' + user.myEmail : '跳过（未绑定邮箱）'}`
    )
    return
  }

  // ── 规则③：确认期超过 24 小时仍未签到 → 通知全部紧急联系人 ──
  if (status === 'pre_alert') {
    const sentTs = user.preAlertSentAt ? new Date(user.preAlertSentAt).getTime() : 0
    if (now - sentTs < CONFIRM_WINDOW_MS) return // 仍在确认期内，继续等待

    let sent = 0
    for (const contact of contacts) {
      try {
        await mailer.sendMail({
          to: contact.email,
          ...mailer.buildAlertMail(user, contact, daysSince, threshold)
        })
        sent++
      } catch (e) {
        // 单个联系人发送失败不影响其余联系人，错误记入报告便于排查
        report.emailErrors.push(`${contact.email}: ${e.message}`)
        console.error(`[预警失败] ${contact.email}`, e.message)
      }
    }

    await db.collection('users').doc(user._id).update({
      data: {
        alertStatus: 'alerted',       // 标记已预警，避免重复发送
        alertedAt: new Date(now),
        updatedAt: new Date(now)
      }
    })
    report.alerted++
    console.log(`[预警] ${user.openid} 已 ${daysSince} 天未签到，已通知 ${sent}/${contacts.length} 位联系人`)
    return
  }

  // ── 规则④：status === 'alerted' → 预警已发过，等待用户签到复位 ──
}

exports.main = async () => {
  const now = Date.now()
  // 汇总报告：可在云开发控制台"云函数日志"中查看，方便排查问题
  const report = {
    runAt: new Date(now).toISOString(), // 本次扫描时间
    scanned: 0,           // 扫描用户总数
    reminded: 0,          // 本轮发送"本人确认提醒"数量
    alerted: 0,           // 本轮触发"联系人预警"用户数
    reset: 0,             // 状态复位数量
    skippedNoContacts: 0, // 因无联系人而跳过的用户数
    emailErrors: []       // 发送失败明细
  }

  try {
    const users = await getAllUsers()
    report.scanned = users.length

    // 逐个用户处理；单个用户异常（如邮箱配置错误）不影响整体扫描
    for (const user of users) {
      try {
        await handleUser(user, report, now)
      } catch (e) {
        report.emailErrors.push(`user ${user.openid}: ${e.message}`)
        console.error(`[异常] ${user.openid}`, e)
      }
    }
  } catch (e) {
    console.error('[扫描失败]', e)
    report.fatal = e.message
  }

  console.log('[扫描完成]', JSON.stringify(report, null, 2))
  return report
}
