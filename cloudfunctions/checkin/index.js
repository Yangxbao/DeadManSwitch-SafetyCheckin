/**
 * 云函数：checkin —— 用户点击"立即签到"时调用
 *
 * 职责：
 *  1. 将 users.lastCheckinTime 更新为服务器当前时间（核心字段）
 *  2. 复位预警状态：若用户已处于 pre_alert / alerted 状态，
 *     签到即代表"我安全"——清空 24h 确认期计时，取消尚未发出的预警
 *  3. 返回更新后的最新用户文档（前端直接渲染，无需二次请求）
 *
 * 前端调用：wx.cloud.callFunction({ name: 'checkin' })
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  // 1. 定位当前用户
  const { OPENID } = cloud.getWXContext()
  const found = await db.collection('users').where({ openid: OPENID }).limit(1).get()
  if (found.data.length === 0) {
    return { success: false, message: '用户不存在，请先登录' }
  }
  const userId = found.data[0]._id
  const now = new Date()

  // 2. 更新最后签到时间并复位预警状态
  await db.collection('users').doc(userId).update({
    data: {
      lastCheckinTime: now,   // ★ 核心：刷新最后签到时间（定时扫描依据此字段判定）
      alertStatus: 'normal',  // 复位为正常状态
      preAlertSentAt: null,   // 清空 24h 确认期计时 → 取消预警
      alertedAt: null,
      updatedAt: now
    }
  })

  // 3. 回读最新文档返回给前端展示
  const user = (await db.collection('users').doc(userId).get()).data
  return { success: true, user }
}
