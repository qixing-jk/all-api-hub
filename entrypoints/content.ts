import { t } from "i18next"

import { fetchUserInfo } from "~/services/apiService"
import { extractRedemptionCodesFromText } from "~/utils/redemptionAssist"

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

    if (request.action === "checkCloudflareGuard") {
      try {
        const passed =
          !document.title.includes("Just a moment") &&
          !document.querySelector("#cf-content")

        sendResponse({ success: true, passed })
      } catch (error) {
        sendResponse({ success: false, error: getErrorMessage(error) })
      }
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

    if (request.action === "performTempWindowFetch") {
      ;(async () => {
        try {
          const { fetchUrl, fetchOptions = {}, responseType = "json" } = request

          if (!fetchUrl) {
            throw new Error("Invalid fetch request")
          }

          const normalizedOptions = normalizeFetchOptions(fetchOptions)
          // 确保携带 cookie
          normalizedOptions.credentials = "include"
          const response = await fetch(fetchUrl, normalizedOptions)

          const headers: Record<string, string> = {}
          response.headers.forEach((value, key) => {
            headers[key] = value
          })

          let data: any = null
          try {
            data = await parseResponseData(response, responseType)
          } catch (parseError) {
            console.warn("[Content] Failed to parse response:", parseError)
          }

          const errorMessage = response.ok
            ? undefined
            : typeof data === "string"
              ? data
              : data?.message
                ? data.message
                : JSON.stringify(data ?? {})

          sendResponse({
            success: response.ok,
            status: response.status,
            headers,
            data,
            error: errorMessage
          })
        } catch (error) {
          sendResponse({ success: false, error: getErrorMessage(error) })
        }
      })()
      return true
    }
  })

  // 启用兑换助手检测
  setupRedemptionAssistDetection()
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

type TempWindowResponseType = "json" | "text" | "arrayBuffer" | "blob"

function normalizeFetchOptions(options: RequestInit = {}): RequestInit {
  const normalized: RequestInit = { ...options }

  if (options.headers) {
    normalized.headers = sanitizeHeaders(options.headers)
  }

  return normalized
}

function sanitizeHeaders(headers: HeadersInit): Record<string, string> {
  if (headers instanceof Headers) {
    const result: Record<string, string> = {}
    headers.forEach((value, key) => {
      result[key] = value
    })
    return result
  }

  if (Array.isArray(headers)) {
    return headers.reduce(
      (acc, [key, value]) => {
        acc[key] = value
        return acc
      },
      {} as Record<string, string>
    )
  }

  return Object.entries(headers).reduce(
    (acc, [key, value]) => {
      if (value != null) {
        acc[key] = String(value)
      }
      return acc
    },
    {} as Record<string, string>
  )
}

async function parseResponseData(
  response: Response,
  responseType: TempWindowResponseType
) {
  switch (responseType) {
    case "text":
      return await response.text()
    case "arrayBuffer":
      return await response.arrayBuffer()
    case "blob":
      return await response.blob()
    case "json":
    default: {
      const text = await response.text()
      try {
        return JSON.parse(text)
      } catch (error) {
        console.warn(
          "[Content] Failed to parse JSON response, fallback to text",
          error
        )
        return text
      }
    }
  }
}

// Redemption Assist helpers

function setupRedemptionAssistDetection() {
  let lastScan = 0
  const SCAN_INTERVAL_MS = 2000

  const triggerScan = () => {
    const now = Date.now()
    if (now - lastScan < SCAN_INTERVAL_MS) return
    lastScan = now
    void scanForRedemptionCodes()
  }

  window.addEventListener("load", triggerScan)
  document.addEventListener("click", triggerScan, true)
}

async function scanForRedemptionCodes() {
  try {
    const body = document.body
    if (!body) return

    const text = body.innerText || ""
    if (!text) return

    const codes = extractRedemptionCodesFromText(text).slice(0, 3)
    if (codes.length === 0) return

    const url = window.location.href

    for (const code of codes) {
      const shouldResp: any = await browser.runtime.sendMessage({
        action: "redemptionAssist:shouldPrompt",
        url,
        code
      })

      if (!shouldResp?.success || !shouldResp.shouldPrompt) {
        continue
      }

      const codePreview = maskCode(code)
      const confirmMessage = t("redemptionAssist:messages.promptConfirm", {
        code: codePreview,
        defaultValue:
          "检测到疑似兑换码：" + codePreview + "\n是否为当前站点尝试自动兑换？"
      })

      const ok = window.confirm(confirmMessage)
      if (!ok) continue

      const redeemResp: any = await browser.runtime.sendMessage({
        action: "redemptionAssist:autoRedeemByUrl",
        url,
        code
      })

      if (!redeemResp?.success) {
        const fallbackMessage = t("redemptionAssist:messages.redeemFailed", {
          defaultValue: "兑换失败，请稍后重试。"
        })
        alert(redeemResp?.error || fallbackMessage)
        continue
      }

      const result = redeemResp.data
      if (result?.message) {
        alert(result.message)
      }
    }
  } catch (error) {
    console.error("[RedemptionAssist][Content] scan failed:", error)
  }
}

function maskCode(code: string): string {
  const trimmed = code.trim()
  if (trimmed.length <= 8) return trimmed
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`
}
