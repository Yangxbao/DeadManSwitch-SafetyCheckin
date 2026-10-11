/**
 * ★★★ 邮箱 SMTP 配置（本文件含密钥，已被 .gitignore 忽略，严禁提交到 GitHub）★★★
 *
 * 使用步骤：
 *  1. 复制本文件为 config.js（本目录下需同时存在 config.js 供代码 require）
 *  2. 填入发件邮箱 auth.user 与 SMTP 授权码 auth.pass（授权码不是邮箱登录密码！）
 *  3. 重新上传部署 testEmail 云函数（右键 → 上传并部署：云端安装依赖）
 *
 * 常见邮箱 SMTP 参数：
 *  QQ 邮箱    host: smtp.qq.com    port: 465  secure: true
 *  163 邮箱   host: smtp.163.com   port: 465  secure: true
 *  Gmail      host: smtp.gmail.com port: 465  secure: true（国内网络环境不推荐）
 *
 * QQ 邮箱授权码获取：网页版 QQ 邮箱 → 设置 → 账号 →
 * POP3/IMAP/SMTP 服务 → 开启服务 → 生成授权码
 */
module.exports = {
  // SMTP 服务器地址
  host: 'smtp.qq.com',
  // SMTP 端口：465(SSL，secure=true) / 587(STARTTLS，secure=false)
  port: 465,
  // 是否使用 SSL 加密（465 端口固定为 true）
  secure: true,
  // 发件人显示名称（可自定义）
  fromName: '失联安全签到',
  // 发件账号与授权码 ★这里是你唯一需要修改的地方★
  auth: {
    user: 'your_email@qq.com',   // 发件邮箱
    pass: '请填入你的SMTP授权码'  // SMTP 授权码（不是邮箱登录密码）
  }
}
