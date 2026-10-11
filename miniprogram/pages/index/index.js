/**
 * pages/index/index.js —— 首页：一键签到 + 预警倒计时
 *
 * 页面职责：
 *  1. 未登录：展示登录引导，点击按钮调用 login 云函数完成"微信一键登录"
 *     （通过云函数上下文静默获取 openid，无需用户弹窗授权）
 *  2. 已登录：展示预警倒计时、签到按钮、预警状态与关键信息
 *  3. 点击签到 → 调用 checkin 云函数 → 刷新"最后签到时间"并复位预警状态
 */
const { callCloud, toastError } = require('../../utils/cloud')
const util = require('../../utils/util')

// 预警状态 → 页面展示文案的映射
const STATUS_TEXT = {
  normal: '安全监测中',
  pre_alert: '预警待确认',
  alerted: '已通知联系人'
}
const HERO_TIP = {
  normal: '距离向紧急联系人发送预警邮件',
  pre_alert: '预警确认期进行中，签到即可取消预警',
  alerted: '预警邮件已发送给你的紧急联系人'
}

Page({
  data: {
    loading: true,      // 是否正在加载用户信息
    isLogin: false,     // 是否已完成登录（users 集合中存在记录）
    userInfo: null,     // 用户文档（users 集合）
    contactCount: 0,    // 紧急联系人数量
    lastCheckinText: '暂无', // 最后签到时间（格式化后）
    daysSince: 0,       // 已连续多少天未签到
    daysRemaining: 0,   // 距离触发预警剩余天数
    alertStatus: 'normal', // 预警状态：normal / pre_alert / alerted
    statusText: '安全监测中',
    heroTip: HERO_TIP.normal,
    confirmHours: 24,   // 预警确认期剩余小时数（仅 pre_alert 状态使用）
    checkinLoading: false // 防止签到按钮重复点击
  },

  /** 每次进入页面（含从设置页返回）都刷新用户数据 */
  onShow() {
    this.refresh()
  },

  /** 下拉刷新 */
  async onPullDownRefresh() {
    await this.refresh()
    wx.stopPullDownRefresh()
  },

  /**
   * 刷新用户信息：login 云函数是幂等的，
   * 首次调用自动注册用户，后续调用返回最新用户数据
   */
  async refresh() {
    try {
      const res = await callCloud('login')
      this.applyUser(res.user, res.contactCount)
    } catch (e) {
      toastError(e)
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 登录按钮：微信一键登录
   * login 云函数内部通过 getWXContext() 获取 openid 并自动建档，
   * 因此这里只需展示 loading 并触发一次 refresh 即可
   */
  async onLogin() {
    wx.showLoading({ title: '登录中...', mask: true })
    await this.refresh()
    wx.hideLoading()
  },

  /**
   * 签到按钮：调用 checkin 云函数
   * 云端会更新 lastCheckinTime 并复位预警状态（若在确认期内签到即取消预警）
   */
  async onCheckin() {
    if (this.data.checkinLoading) return // 防重复提交
    this.setData({ checkinLoading: true })
    try {
      const res = await callCloud('checkin')
      this.applyUser(res.user, this.data.contactCount)
      wx.showToast({ title: '签到成功', icon: 'success' })
    } catch (e) {
      toastError(e)
    } finally {
      this.setData({ checkinLoading: false })
    }
  },

  /**
   * 将用户文档应用到页面数据（统一入口，签到/刷新/登录共用）
   * @param {object} user users 集合文档
   * @param {number} contactCount 紧急联系人数量
   */
  applyUser(user, contactCount) {
    const { daysSince, daysRemaining } = util.calcDays(user.lastCheckinTime, user.thresholdDays)
    const status = user.alertStatus || 'normal'

    // pre_alert 状态下，计算 24 小时确认期剩余小时数（向用户展示紧迫感）
    let confirmHours = 24
    if (status === 'pre_alert' && user.preAlertSentAt) {
      const sent = new Date(user.preAlertSentAt).getTime()
      confirmHours = Math.max(0, 24 - Math.floor((Date.now() - sent) / 3600000))
    }

    this.setData({
      isLogin: true,
      userInfo: user,
      contactCount: contactCount || 0,
      lastCheckinText: util.formatTime(user.lastCheckinTime),
      daysSince,
      daysRemaining: Math.max(0, daysRemaining), // 页面展示不允许负数
      alertStatus: status,
      statusText: STATUS_TEXT[status] || STATUS_TEXT.normal,
      heroTip: HERO_TIP[status] || HERO_TIP.normal,
      confirmHours
    })
  },

  /** 跳转设置页 */
  goSettings() {
    wx.switchTab({ url: '/pages/settings/settings' })
  },

  /** 跳转联系人列表页 */
  goContacts() {
    wx.navigateTo({ url: '/pages/contacts/contacts' })
  }
})
