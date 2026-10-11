/**
 * pages/contact-edit/contact-edit.js —— 联系人添加 / 编辑页
 *
 * 页面职责：
 *  1. 无参数进入 = 添加模式；携带 id/name/email 参数进入 = 编辑模式
 *  2. 表单校验：姓名必填（≤20字）、邮箱格式校验
 *  3. 保存 → 调用 contact 云函数（action: add / update）
 *  4. 编辑模式下提供删除入口（action: delete）
 */
const { callCloud, toastError } = require('../../utils/cloud')
const util = require('../../utils/util')

Page({
  data: {
    id: '',        // 联系人 _id（编辑模式下有值）
    name: '',      // 联系人姓名
    email: '',     // 联系人邮箱
    isEdit: false, // 是否为编辑模式
    saving: false  // 防止重复提交
  },

  /** 解析页面参数：有 id 即为编辑模式，解码回填表单并修改导航栏标题 */
  onLoad(options) {
    if (options && options.id) {
      this.setData({
        id: options.id,
        name: decodeURIComponent(options.name || ''),
        email: decodeURIComponent(options.email || ''),
        isEdit: true
      })
      wx.setNavigationBarTitle({ title: '编辑联系人' })
    }
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onEmailInput(e) {
    this.setData({ email: e.detail.value })
  },

  /**
   * 保存联系人（添加 / 编辑共用）
   * 校验通过后按 isEdit 选择 add 或 update 动作
   */
  async onSave() {
    const name = this.data.name.trim()
    const email = this.data.email.trim()

    // ---- 前端基础校验（云端 contact 函数会再做一次） ----
    if (!name) {
      wx.showToast({ title: '请填写联系人姓名', icon: 'none' })
      return
    }
    if (name.length > 20) {
      wx.showToast({ title: '姓名不能超过 20 个字', icon: 'none' })
      return
    }
    if (!util.isValidEmail(email)) {
      wx.showToast({ title: '请填写正确格式的邮箱', icon: 'none' })
      return
    }

    if (this.data.saving) return
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...', mask: true })
    try {
      await callCloud('contact', {
        action: this.data.isEdit ? 'update' : 'add',
        id: this.data.id,
        name,
        email
      })
      wx.hideLoading() // 先收起 loading 再弹提示，避免 showLoading/hideLoading 配对警告
      wx.showToast({ title: this.data.isEdit ? '已保存' : '已添加', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600) // 稍作停留让用户看到成功提示
    } catch (e) {
      wx.hideLoading()
      toastError(e)
    }
    this.setData({ saving: false })
  },

  /** 删除联系人（仅编辑模式展示），删除后返回列表页 */
  onDelete() {
    wx.showModal({
      title: '删除联系人',
      content: `确定删除「${this.data.name}」吗？`,
      confirmText: '删除',
      confirmColor: '#E5484D',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...', mask: true })
        try {
          await callCloud('contact', { action: 'delete', id: this.data.id })
          wx.hideLoading()
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 600)
        } catch (e) {
          wx.hideLoading()
          toastError(e)
        }
      }
    })
  }
})
