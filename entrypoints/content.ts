import { t } from "i18next"

import { fetchUserInfo } from "~/services/apiService"

import { getErrorMessage } from "../utils/error"

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    main()
  }
})

function main() {
  console.log("Hello content script!", { id: browser.runtime.id })
  // 监听来自 popup 和 background 的消息
  browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === "getLocalStorage") {
      try {
        const { key } = request

        if (key) {
          // 读取特定键
          const value = localStorage.getItem(key)
          sendResponse({ success: true, data: { [key]: value } })
        } else {
          // 读取所有 localStorage 数据
          const localStorage = window.localStorage
          const data: Record<string, any> = {}

          for (let i = 0; i < localStorage.length; i++) {
            const storageKey = localStorage.key(i)
            if (storageKey) {
              data[storageKey] = localStorage.getItem(storageKey)
            }
          }

          sendResponse({ success: true, data })
        }
      } catch (error) {
        sendResponse({ success: false, error: getErrorMessage(error) })
      }
      return true // 保持消息通道开放
    }

    if (request.action === "getUserFromLocalStorage") {
      ;(async () => {
        try {
          // 所有异步逻辑
          const userStr = localStorage.getItem("user")
          const user = userStr
            ? JSON.parse(userStr)
            : await fetchUserInfo(request.url)

          if (!user || !user.id) {
            sendResponse({
              success: false,
              error: t("messages:content.userInfoNotFound")
            })
            return
          }

          sendResponse({ success: true, data: { userId: user.id, user } })
        } catch (error) {
          sendResponse({ success: false, error: getErrorMessage(error) })
        }
      })()
      return true
    }

    if (request.action === "waitAndGetUserInfo") {
      // 新增：等待页面完全加载后获取用户信息
      waitForUserInfo()
        .then((userInfo) => {
          sendResponse({ success: true, data: userInfo })
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message })
        })
      return true
    }
  })
}

// 等待用户信息可用
async function waitForUserInfo(
  maxWaitTime = 5000
): Promise<{ userId: string; user: any }> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const userStr = localStorage.getItem("user")
      if (userStr) {
        const user = JSON.parse(userStr)
        if (user.id) {
          return { userId: user.id, user }
        }
      }
    } catch (error) {
      // 继续等待
      console.error(error)
    }

    // 等待 100ms 后重试
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(t("messages:content.waitUserInfoTimeout"))
}
