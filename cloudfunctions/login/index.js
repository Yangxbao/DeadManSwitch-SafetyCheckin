/**
 * 云函数：login —— 微信一键登录 + 用户信息刷新（幂等接口）
 *
 * 职责：
 *  1. 通过云函数上下文静默获取用户唯一标识 openid（无需用户弹窗授权）
 *  2. 兜底确保 users / contacts 两个集合存在（首次部署免手动建表）
 *  3. 首次登录自动创建用户记录（注册成功视为完成首次签到，避免新用户立即触发预警）
 *  4. 返回最新用户文档 + 紧急联系人数量（首页 / 设置页刷新数据共用此接口）
 *
 * 前端调用：wx.cloud.callFunction({ name: 'login' })
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 新用户默认失联判定天数（需求约定：默认 7 天）
const DEFAULT_THRESHOLD_DAYS = 7

/**
 * 确保云数据库集合存在
 * 说明：db.createCollection 在集合已存在时会抛错，直接捕获忽略即可
 */
async function ensureCollection(name) {
  try {
    await db.createCollection(name)
    console.log(`[初始化] 集合 ${name} 创建成功`)
  } catch (e) {
    /* 集合已存在，忽略异常 */
  }
}

exports.main = async () => {
  // 1. 获取当前微信用户身份（由微信平台注入调用上下文，客户端无法伪造）
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) {
    return { success: false, message: '获取用户身份失败，请重启小程序重试' }
  }

  // 2. 兜底确保业务集合存在
  await ensureCollection('users')
  await ensureCollection('contacts')

  // 3. 查询用户是否已注册
  const found = await db.collection('users').where({ openid: OPENID }).limit(1).get()
  let user

  if (found.data.length > 0) {
    // 3.1 已注册用户：直接使用现有文档
    user = found.data[0]
  } else {
    // 3.2 首次登录：创建用户记录
    //     使用 openid 作为文档 _id，天然防止并发重复注册（重复添加会因 _id 冲突抛错）
    const now = new Date()
    try {
      await db.collection('users').add({
        data: {
          _id: OPENID,                            // _id = openid，保证一人一条记录
          openid: OPENID,                         // 微信用户唯一标识（业务关联字段）
          selfName: '',                           // 用户姓名（预警邮件中向联系人说明身份）
          myEmail: '',                            // 用户本人邮箱（接收预警确认提醒）
          thresholdDays: DEFAULT_THRESHOLD_DAYS,  // 失联判定天数，默认 7 天
          lastCheckinTime: now,                   // 最后签到时间（注册即为首次签到）
          alertStatus: 'normal',                  // 预警状态：normal / pre_alert / alerted
          preAlertSentAt: null,                   // 本人提醒邮件发送时间（计算 24h 确认期用）
          alertedAt: null,                        // 预警邮件发送时间
          createdAt: now,
          updatedAt: now
        }
      })
    } catch (e) {
      /* 并发场景下 _id 已存在会抛错（如快速双击登录按钮），忽略后直接查询即可 */
    }
    user = (await db.collection('users').doc(OPENID).get()).data
  }

  // 4. 统计紧急联系人数量（首页用于提示"尚未添加联系人"）
  const contactCount = (await db.collection('contacts').where({ userId: OPENID }).count()).total || 0

  return { success: true, user, contactCount }
}
