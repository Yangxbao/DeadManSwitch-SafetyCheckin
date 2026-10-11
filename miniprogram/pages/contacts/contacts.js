/**
 * pages/contacts/contacts.js —— 紧急联系人列表页
 *
 * 页面职责：
 *  1. 展示当前用户全部紧急联系人（姓名 + 邮箱）
 *  2. 点击条目进入编辑页；单独提供删除按钮（带确认弹窗）
 *  3. 底部"添加联系人"入口（带数量上限提示，上限 10 位）
 */
const { callCloud, toastError } = require('../../utils/cloud')

Page({
  data: {
    list: [],            // 联系人列表（contacts 集合文档）
    loading: true,
    maxContacts: 10      // 与云函数 contact/index.js 中 MAX_CONTACTS 保持一致
  },

  /** 每次进入页面（含从编辑页返回）重新拉取列表 */
  onShow() {
    this.refresh()
  },

  /** 拉取联系人列表；avatar 取姓名首字用于圆形头像占位 */
  async refresh() {
    try {
      const res = await callCloud('contact', { action: 'list' })
      const list = (res.list || []).map((item) => ({
        ...item,
        avatar: (item.name || '？').charAt(0)
      }))
      this.setData({ list, loading: false })
    } catch (e) {
      toastError(e)
      this.setData({ loading: false })
    }
  },

  /** 添加联系人（超出上限时拦截） */
  onAdd() {
    if (this.data.list.length >= this.data.maxContacts) {
      wx.showToast({ title: `最多可添加 ${this.data.maxContacts} 位联系人`, icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/contact-edit/contact-edit' })
  },

  /**
   * 点击条目 → 编辑页
   * 通过 URL 参数传递联系人数据（编辑页 onLoad 中解码回填）
   */
  onEdit(e) {
    const { id, name, email } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/contact-edit/contact-edit?id=${id}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`
    })
  },

  /**
   * 删除联系人（catchtap 阻止冒泡，避免同时触发条目的 onEdit）
   * 删除前弹窗二次确认
   */
  onDelete(e) {
    const { id, name } = e.currentTarget.dataset
    wx.showModal({
      title: '删除联系人',
      content: `确定删除「${name}」吗？删除后触发预警时将不再通知该联系人。`,
      confirmText: '删除',
      confirmColor: '#E5484D',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...', mask: true })
        try {
          await callCloud('contact', { action: 'delete', id })
          wx.hideLoading()
          wx.showToast({ title: '已删除', icon: 'success' })
          this.refresh()
        } catch (err) {
          wx.hideLoading()
          toastError(err)
        }
      }
    })
  }
})
