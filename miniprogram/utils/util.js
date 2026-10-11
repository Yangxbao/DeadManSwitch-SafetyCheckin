/**
 * utils/util.js —— 通用工具函数
 * 包含：时间格式化、邮箱格式校验、签到天数计算
 */

// 一天的毫秒数（24 小时）
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 格式化时间显示：YYYY-MM-DD HH:mm
 * @param {string|Date|number} input 时间（云数据库 Date 字段序列化后为 ISO 字符串）
 * @returns {string} 格式化结果，非法输入返回"暂无"
 */
function formatTime(input) {
  if (!input) return '暂无'
  const d = input instanceof Date ? input : new Date(input)
  if (isNaN(d.getTime())) return '暂无'
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  )
}

/**
 * 校验邮箱格式（前端基础校验，云函数端会再校验一次）
 * @param {string} email 待校验的邮箱字符串
 * @returns {boolean} 是否为合法邮箱格式
 */
function isValidEmail(email) {
  return /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(String(email || '').trim())
}

/**
 * 计算签到倒计时信息（与云端 dailyScan 的判定口径保持一致）
 * @param {string|Date} lastCheckinTime 最后签到时间
 * @param {number} thresholdDays 失联判定天数
 * @returns {{daysSince: number, daysRemaining: number}}
 *   daysSince：距最后签到已经过去多少天（向下取整）
 *   daysRemaining：距离触发预警还剩多少天（可能为负数，表示已超期）
 */
function calcDays(lastCheckinTime, thresholdDays) {
  if (!lastCheckinTime) {
    return { daysSince: 0, daysRemaining: thresholdDays }
  }
  const last = new Date(lastCheckinTime).getTime()
  const daysSince = Math.max(0, Math.floor((Date.now() - last) / DAY_MS))
  return { daysSince, daysRemaining: thresholdDays - daysSince }
}

module.exports = {
  formatTime,
  isValidEmail,
  calcDays
}
