/**
 * 云函数：contact —— 紧急联系人增删改查统一入口
 *
 * 通过 event.action 区分操作：
 *   list   查询当前用户全部联系人（按创建时间倒序）
 *   add    新增联系人（校验邮箱格式 / 数量上限 / 邮箱去重）
 *   update 编辑联系人
 *   delete 删除联系人
 *
 * 安全性：所有读写都以 openid 为数据边界（userId 字段），
 * 用户只能操作自己的联系人，无法越权修改他人数据
 *
 * 前端调用：wx.cloud.callFunction({ name: 'contact', data: { action, ... } })
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 每个用户最多可添加的联系人数量（防止滥用）
const MAX_CONTACTS = 10

/** 校验邮箱格式（与前端 util.isValidEmail 保持同一规则） */
function isEmail(v) {
  return /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(v)
}

/**
 * 校验联系人姓名 / 邮箱
 * @returns {string|null} 校验失败返回错误文案，通过返回 null
 */
function validateContact(name, email) {
  if (!name) return '请填写联系人姓名'
  if (name.length > 20) return '姓名不能超过 20 个字'
  if (!isEmail(email)) return '邮箱格式不正确'
  return null
}

/**
 * 查询联系人并校验归属（update / delete 前置检查，防越权）
 * @returns {object|null} 属于当前用户时返回文档，否则返回 null
 */
async function getOwnedContact(id, OPENID) {
  if (!id) return null
  try {
    const doc = await db.collection('contacts').doc(id).get()
    if (doc.data && doc.data.userId === OPENID) return doc.data
    return null
  } catch (e) {
    return null // 文档不存在时 doc().get() 会抛错
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const action = event.action

  // ========== 查询列表 ==========
  if (action === 'list') {
    const res = await db.collection('contacts')
      .where({ userId: OPENID })
      .orderBy('createdAt', 'desc') // 后添加的排在前面
      .limit(MAX_CONTACTS)
      .get()
    return { success: true, list: res.data }
  }

  // ========== 新增 ==========
  if (action === 'add') {
    const name = String(event.name || '').trim()
    // 邮箱统一转小写存储，配合去重逻辑实现大小写不敏感
    const email = String(event.email || '').trim().toLowerCase()

    const err = validateContact(name, email)
    if (err) return { success: false, message: err }

    // 数量上限校验
    const { total } = await db.collection('contacts').where({ userId: OPENID }).count()
    if (total >= MAX_CONTACTS) {
      return { success: false, message: `最多只能添加 ${MAX_CONTACTS} 位联系人` }
    }

    // 同一用户下邮箱去重
    const dup = await db.collection('contacts').where({ userId: OPENID, email }).count()
    if (dup.total > 0) {
      return { success: false, message: '该邮箱已存在，请勿重复添加' }
    }

    const now = new Date()
    const added = await db.collection('contacts').add({
      data: {
        userId: OPENID, // 归属用户（关联 users.openid，定时扫描按此查询）
        name,
        email,
        createdAt: now,
        updatedAt: now
      }
    })
    return { success: true, id: added._id }
  }

  // ========== 编辑 ==========
  if (action === 'update') {
    const name = String(event.name || '').trim()
    const email = String(event.email || '').trim().toLowerCase()

    const err = validateContact(name, email)
    if (err) return { success: false, message: err }

    // 归属校验：只能编辑自己的联系人
    const contact = await getOwnedContact(event.id, OPENID)
    if (!contact) return { success: false, message: '联系人不存在或无权操作' }

    // 若修改了邮箱，需要重新去重
    if (email !== contact.email) {
      const dup = await db.collection('contacts').where({ userId: OPENID, email }).count()
      if (dup.total > 0) {
        return { success: false, message: '该邮箱已存在，请勿重复添加' }
      }
    }

    await db.collection('contacts').doc(contact._id).update({
      data: { name, email, updatedAt: new Date() }
    })
    return { success: true }
  }

  // ========== 删除 ==========
  if (action === 'delete') {
    // 归属校验：只能删除自己的联系人
    const contact = await getOwnedContact(event.id, OPENID)
    if (!contact) return { success: false, message: '联系人不存在或无权操作' }

    await db.collection('contacts').doc(contact._id).remove()
    return { success: true }
  }

  return { success: false, message: '未知操作类型' }
}
