/**
 * pages/settings/settings.js —— 设置页
 *
 * 页面职责：
 *  1. 维护个人预警参数：我的姓名、接收提醒的邮箱、失联判定天数（默认 7 天）
 *  2. 提供紧急联系人管理入口
 *  3. 提供"发送测试邮件"按钮，用于验证云函数 SMTP 配置是否正确
 *
 * 表单校验：前端做基础校验（必填 / 长度 / 邮箱格式 / 天数范围），
 * 云函数 updateUser 会再做一次服务端校验（永不信任前端传参）
 */
const { callCloud, toastError } = require('../../utils/cloud')
const util = require('../../utils/util')

Page({
  data: {
    loading: true,
    saving: false,       // 防止保存按钮重复点击
    selfName: '',        // 我的姓名（预警邮件中向联系人说明身份）
    myEmail: '',         // 我的邮箱（接收预警确认提醒）
    thresholdDays: 7,    // 失联判定天数（1~365，默认 7）
    contactCount: 0      // 联系人数量（入口展示用）
  },

  /** 每次进入页面刷新最新配置 */
  onShow() {
    this.refresh()
  },

  /** 拉取用户信息并回填表单 */
  async refresh() {
    try {
      const res = await callCloud('login')
      this.setData({
        selfName: res.user.selfName || '',
        myEmail: res.user.myEmail || '',
        thresholdDays: res.user.thresholdDays || 7,
        contactCount: res.contactCount || 0,
        loading: false
      })
    } catch (e) {
      toastError(e)
      this.setData({ loading: false })
    }
  },

  /**
   * 输入框统一处理（通过 data-field 区分字段）
   * 失联天数只允许输入数字
   */
  onInput(e) {
    const field = e.currentTarget.dataset.field
    let value = e.detail.value
    if (field === 'thresholdDays') {
      value = value.replace(/[^\d]/g, '') // 过滤非数字字符
    }
    this.setData({ [field]: value })
  },

  /**
   * 前端表单校验
   * @returns {string|null} 校验失败返回错误文案，通过返回 null
   */
  validate() {
    const { selfName, myEmail, thresholdDays } = this.data
    if (!selfName.trim()) return '请填写你的姓名'
    if (selfName.trim().length > 20) return '姓名不能超过 20 个字'
    if (!util.isValidEmail(myEmail)) return '请填写正确格式的邮箱'
    const days = Number(thresholdDays)
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return '失联判定天数需为 1~365 的整数'
    }
    return null
  },

  /** 保存设置：调用 updateUser 云函数写入 users 集合 */
  async onSave() {
    const errMsg = this.validate()
    if (errMsg) {
      wx.showToast({ title: errMsg, icon: 'none' })
      return
    }
    if (this.data.saving) return
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...', mask: true })
    try {
      await callCloud('updateUser', {
        selfName: this.data.selfName.trim(),
        myEmail: this.data.myEmail.trim(),
        thresholdDays: Number(this.data.thresholdDays)
      })
      wx.hideLoading() // 先收起 loading 再弹提示，避免 showLoading/hideLoading 配对警告
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      toastError(e)
    }
    this.setData({ saving: false })
  },

  /**
   * 发送测试邮件：调用 testEmail 云函数
   * 收件人固定为当前用户已保存的邮箱（云端控制，防止接口被滥用）
   */
  async onTestEmail() {
    if (!util.isValidEmail(this.data.myEmail)) {
      wx.showToast({ title: '请先填写正确格式的邮箱并保存', icon: 'none' })
      return
    }
    wx.showLoading({ title: '发送中...', mask: true })
    try {
      const res = await callCloud('testEmail', {})
      wx.hideLoading()
      wx.showToast({ title: res.message, icon: 'none', duration: 3000 })
    } catch (e) {
      wx.hideLoading()
      toastError(e)
    }
  },

  /** 跳转紧急联系人列表页 */
  goContacts() {
    wx.navigateTo({ url: '/pages/contacts/contacts' })
  }
})
