/**
 * mailer.js —— 邮件发送封装（nodemailer）
 *
 * 说明：云函数之间无法共享 node_modules，
 *       因此本文件在 dailyScan / testEmail 两个云函数目录下各持有一份（内容相同）。
 *
 * ★★★ 首次使用前必须配置：本目录下的 config.js（复制 config.example.js 修改）★★★
 * 配置完成后需重新上传部署对应的云函数才能生效。
 */
const nodemailer = require('nodemailer')
const config = require('./config')

// 缓存 transporter，避免同一函数实例内每次发信都重建 SMTP 连接
let transporter = null

/**
 * 懒加载 SMTP transporter
 * 若 config.js 未填写授权码，直接抛出带指引的异常，
 * 错误信息会出现在云函数日志 / 前端错误提示中，方便定位问题
 */
function getTransporter() {
  if (transporter) return transporter

  const user = config.auth && config.auth.user
  const pass = config.auth && config.auth.pass
  // /请填入|your_email/i 用于识别"仍是模板占位符"的情况
  if (!config.host || !user || !pass || /请填入|your_email/i.test(String(user) + String(pass))) {
    throw new Error(
      'SMTP 尚未配置：请复制云函数目录下的 config.example.js 为 config.js，' +
      '填入发件邮箱与 SMTP 授权码后重新上传部署该云函数'
    )
  }

  transporter = nodemailer.createTransport({
    host: config.host,     // SMTP 服务器地址，如 smtp.qq.com
    port: config.port,     // 端口：465(SSL) / 587(STARTTLS)
    secure: config.secure, // true = SSL 加密（对应 465 端口）
    auth: config.auth      // { user: 发件邮箱, pass: SMTP 授权码（非登录密码） }
  })
  return transporter
}

/**
 * 发送邮件统一入口
 * @param {object} opts { to, subject, html }
 * @returns {Promise} nodemailer 发送结果
 */
async function sendMail({ to, subject, html }) {
  const tp = getTransporter()
  return tp.sendMail({
    from: `"${config.fromName || '失联安全签到'}" <${config.auth.user}>`,
    to,
    subject,
    html
  })
}

/** 邮件公共外壳：统一的简洁样式 + 页脚声明 */
function wrapHTML(title, bodyHtml) {
  return [
    '<!DOCTYPE html>',
    '<html><body style="margin:0;padding:24px;background:#f5f6fa;',
    'font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',Helvetica,Arial,sans-serif;">',
    '<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;',
    'padding:32px;color:#1f2329;line-height:1.8;font-size:15px;">',
    `<h2 style="margin:0 0 20px;font-size:20px;color:#2f54eb;">${title}</h2>`,
    bodyHtml,
    '<hr style="border:none;border-top:1px solid #e5e6eb;margin:24px 0;">',
    '<p style="margin:0;font-size:12px;color:#9ca3af;">',
    '本邮件由「失联安全签到」小程序自动发送（个人学习开源项目，仅供学习演示）。',
    '</p>',
    '</div></body></html>'
  ].join('')
}

/**
 * 构建预警确认提醒邮件（发给用户本人）
 * @param {object} user users 集合文档
 * @param {number} contactCount 紧急联系人数量
 * @returns {{subject: string, html: string}}
 */
function buildReminderMail(user, contactCount) {
  const name = user.selfName || '用户'
  const lastText = user.lastCheckinTime
    ? new Date(user.lastCheckinTime).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    : '暂无'
  const subject = '【失联安全签到】预警确认提醒：请尽快签到确认安全'
  const html = wrapHTML(
    '预警确认提醒',
    [
      `<p><strong>${name}</strong>，你好：</p>`,
      '<p>你已连续多日未在「失联安全签到」小程序签到，即将达到你设定的失联判定线。</p>',
      '<div style="background:#f0f3ff;border-radius:8px;padding:16px;margin:16px 0;">',
      `<p style="margin:0;">最后签到时间：<strong>${lastText}</strong><br>`,
      `失联判定天数：<strong>${user.thresholdDays || 7}</strong> 天<br>`,
      `紧急联系人：<strong>${contactCount}</strong> 位</p>`,
      '</div>',
      '<p style="color:#d46b08;"><strong>如果你安全无恙，请立即打开小程序完成一次签到，',
      '本次预警将自动取消；若 24 小时内仍未签到，系统将向你的全部紧急联系人发送预警邮件。</strong></p>',
      '<p>如确非本人操作或遇到紧急情况，请及时与家人朋友沟通。</p>'
    ].join('')
  )
  return { subject, html }
}

/**
 * 构建紧急预警邮件（发给紧急联系人）
 * @param {object} user 失联用户的 users 集合文档
 * @param {object} contact 接收预警的联系人文档
 * @param {number} daysSince 已连续未签到天数
 * @param {number} threshold 用户设定的失联判定天数
 * @returns {{subject: string, html: string}}
 */
function buildAlertMail(user, contact, daysSince, threshold) {
  const name = user.selfName || '你的好友'
  const lastText = user.lastCheckinTime
    ? new Date(user.lastCheckinTime).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    : '未知'
  const subject = `【紧急预警】${name} 已超过 ${threshold} 天未签到，请尽快联系确认安全`
  const html = wrapHTML(
    '紧急预警通知',
    [
      `<p><strong>${contact.name}</strong>，你好：</p>`,
      `<p>你的联系人 <strong>${name}</strong>${user.myEmail ? `（邮箱：${user.myEmail}）` : ''}`,
      ' 使用「失联安全签到」小程序报平安，但系统检测到其已连续多日未签到：</p>',
      '<div style="background:#fff1f0;border-radius:8px;padding:16px;margin:16px 0;">',
      `<p style="margin:0;">最后签到时间：<strong>${lastText}</strong><br>`,
      `已连续未签到：<strong>${daysSince}</strong> 天<br>`,
      `其设定的失联判定天数：<strong>${threshold}</strong> 天</p>`,
      '</div>',
      '<p style="color:#e5484d;"><strong>系统已提前 24 小时向本人发送提醒邮件，',
      '但未得到签到确认。</strong>请尽快通过电话、短信等方式联系本人，确认其人身安全。</p>',
      '<p>若已确认安全，可忽略本邮件；若长时间无法取得联系，请根据实际情况采取进一步措施。</p>'
    ].join('')
  )
  return { subject, html }
}

module.exports = { sendMail, buildReminderMail, buildAlertMail }
