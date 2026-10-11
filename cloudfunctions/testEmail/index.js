/**
 * 云函数：testEmail —— 发送测试邮件（验证 SMTP 配置是否正确）
 *
 * 前端入口：设置页「发送测试邮件」按钮
 *
 * 安全设计：
 *  收件人固定为当前用户在 users 集合中登记的 myEmail，
 *  不接受前端传入的任意收件地址，避免云函数被当作开放邮件接口滥用
 *
 * 前端调用：wx.cloud.callFunction({ name: 'testEmail' })
 */
const cloud = require('wx-server-sdk')
const mailer = require('./mailer')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  // 1. 定位当前用户
  const { OPENID } = cloud.getWXContext()
  const found = await db.collection('users').where({ openid: OPENID }).limit(1).get()
  if (found.data.length === 0) {
    return { success: false, message: '用户不存在，请先登录' }
  }
  const user = found.data[0]

  // 2. 必须已绑定本人邮箱
  if (!user.myEmail) {
    return { success: false, message: '请先在设置页填写并保存你的邮箱' }
  }

  // 3. 发送测试邮件
  try {
    await mailer.sendMail({
      to: user.myEmail,
      subject: '【失联安全签到】测试邮件',
      html: [
        '<!DOCTYPE html>',
        '<html><body style="margin:0;padding:24px;background:#f5f6fa;',
        'font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',Helvetica,Arial,sans-serif;">',
        '<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;',
        'padding:32px;color:#1f2329;line-height:1.8;font-size:15px;">',
        '<h2 style="margin:0 0 20px;font-size:20px;color:#2f54eb;">测试邮件</h2>',
        `<p><strong>${user.selfName || '用户'}</strong>，你好：</p>`,
        '<p>这是一封测试邮件。如果你收到了它，说明小程序的 SMTP 邮箱配置正确，',
        '预警确认提醒与紧急预警邮件都可以正常送达此邮箱。</p>',
        '<p style="color:#9ca3af;font-size:13px;">若未在收件箱看到，请检查"垃圾邮件"文件夹。</p>',
        '<hr style="border:none;border-top:1px solid #e5e6eb;margin:24px 0;">',
        '<p style="margin:0;font-size:12px;color:#9ca3af;">',
        '本邮件由「失联安全签到」小程序自动发送（个人学习开源项目，仅供学习演示）。</p>',
        '</div></body></html>'
      ].join('')
    })
    return { success: true, message: `测试邮件已发送至 ${user.myEmail}，请查收（注意垃圾箱）` }
  } catch (e) {
    // 常见失败原因：授权码未配置 / 授权码错误 / SMTP 服务未开启
    console.error('[测试邮件失败]', e)
    return { success: false, message: '发送失败：' + e.message }
  }
}
