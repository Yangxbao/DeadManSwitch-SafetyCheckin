/**
 * utils/cloud.js —— 云函数调用统一封装
 *
 * 统一封装的好处：
 *  1. 云函数返回值约定统一为 { success: boolean, message?: string, ...数据 }
 *  2. success === false 时统一转为 reject，页面端只需写一个 catch
 *  3. 网络层错误（fail）统一转成中文提示，避免用户看到原始 errMsg
 */

/**
 * 调用云函数并返回业务结果
 * @param {string} name 云函数名（cloudfunctions 下的文件夹名）
 * @param {object} data 传给云函数的参数
 * @returns {Promise<object>} 云函数返回的 result（success === true 时）
 */
function callCloud(name, data = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success(res) {
        const result = res.result || {}
        if (result.success === false) {
          // 云函数内部主动返回的业务失败
          reject(new Error(result.message || '操作失败，请稍后重试'))
        } else {
          resolve(result)
        }
      },
      fail(err) {
        // 网络 / 云函数不存在 / 云函数本身抛异常等底层失败
        console.error(`[云函数 ${name} 调用失败]`, err)
        reject(new Error(err.errMsg || '网络请求失败，请检查网络后重试'))
      }
    })
  })
}

/**
 * 统一的错误提示（配合页面 catch 使用）
 * @param {Error} err callCloud reject 出来的错误对象
 */
function toastError(err) {
  wx.showToast({
    title: (err && err.message) || '操作失败，请稍后重试',
    icon: 'none',
    duration: 2500
  })
}

module.exports = {
  callCloud,
  toastError
}
