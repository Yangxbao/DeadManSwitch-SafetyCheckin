/**
 * 云函数：updateUser —— 保存设置页表单
 *
 * 职责：更新 users 集合中当前用户的
 *   selfName（我的姓名）/ myEmail（接收提醒的邮箱）/ thresholdDays（失联判定天数）
 *
 * 安全要点：服务端对每个字段做二次校验——永远不要信任前端传参
 *
 * 前端调用：wx.cloud.callFunction({
 *   name: 'updateUser',
 *   data: { selfName, myEmail, thresholdDays }
 * })
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

/** 校验邮箱格式（与前端 util.isValidEmail 保持同一规则） */
function isEmail(v) {
  return /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(v)
}

exports.main = async (event) => {
  // 1. 参数规范化
  const selfName = String(event.selfName || '').trim()
  const myEmail = String(event.myEmail || '').trim()
  const thresholdDays = Number(event.thresholdDays)

  // 2. 服务端二次校验
  if (!selfName) {
    return { success: false, message: '姓名不能为空' }
  }
  if (selfName.length > 20) {
    return { success: false, message: '姓名不能超过 20 个字' }
  }
  if (!isEmail(myEmail)) {
    return { success: false, message: '邮箱格式不正确' }
  }
  if (!Number.isInteger(thresholdDays) || thresholdDays < 1 || thresholdDays > 365) {
    return { success: false, message: '失联判定天数需为 1~365 的整数' }
  }

  // 3. 定位用户并更新
  const { OPENID } = cloud.getWXContext()
  const found = await db.collection('users').where({ openid: OPENID }).limit(1).get()
  if (found.data.length === 0) {
    return { success: false, message: '用户不存在，请先登录' }
  }

  await db.collection('users').doc(found.data[0]._id).update({
    data: {
      selfName,        // 我的姓名（预警邮件中向联系人说明身份）
      myEmail,         // 我的邮箱（接收预警确认提醒，强烈建议填写）
      thresholdDays,   // 失联判定天数（1~365）
      updatedAt: new Date()
    }
  })

  return { success: true }
}
