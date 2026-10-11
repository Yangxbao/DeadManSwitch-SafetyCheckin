/**
 * app.js —— 小程序全局入口
 * 负责：初始化云开发能力、维护全局用户信息缓存
 */
App({
  /**
   * 全局数据（各页面可通过 getApp().globalData 访问）
   * userInfo：当前登录用户在 users 集合中的文档
   */
  globalData: {
    userInfo: null
  },

  onLaunch() {
    // 云开发初始化：必须在所有 wx.cloud.callFunction 之前调用
    if (!wx.cloud) {
      console.error('当前微信基础库版本过低，请升级微信客户端后再使用云开发能力')
      return
    }
    // ★ 云开发环境 ID 配置 ★
    // 已配置为你的云环境 ID（微信开发者工具 → 云开发控制台 → 设置 → 环境ID 可查看）
    const CLOUD_ENV = 'cloud1-d8g8blh3a68ed8b1f'
    wx.cloud.init(
      CLOUD_ENV
        ? { env: CLOUD_ENV, traceUser: true }
        : { traceUser: true }
    )
  }
})
