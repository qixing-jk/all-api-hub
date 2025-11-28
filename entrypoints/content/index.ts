import { t } from "i18next"
import * as React from "react"
import { createRoot } from "react-dom/client"
import toast from "react-hot-toast"

import { fetchUserInfo } from "~/services/apiService"
import type { DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/error"
import { extractRedemptionCodesFromText } from "~/utils/redemptionAssist"

import { ContentReactRoot } from "./ContentReactRoot"
import { RedemptionAccountSelectToast } from "./RedemptionAccountSelectToast"
import {
  RedemptionPromptToast,
  type RedemptionPromptAction
} from "./RedemptionPromptToast"

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

  // Hook clipboard writeText in page context and listen for events
  injectClipboardWriteHook()
  setupClipboardWriteListener()

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

function showAccountSelectToast(
  accounts: DisplaySiteData[],
  options?: { title?: string; message?: string }
): Promise<DisplaySiteData | null> {
  ensureRedemptionToastRoot()

  return new Promise((resolve) => {
    let resolved = false

    const handleResolve = (
      account: DisplaySiteData | null,
      toastId: string
    ) => {
      if (resolved) return
      resolved = true
      toast.dismiss(toastId)
      resolve(account)
    }

    toast.custom((toastInstance) => {
      const toastId = toastInstance.id
      return React.createElement(RedemptionAccountSelectToast, {
        title: options?.title,
        message: options?.message,
        accounts,
        onSelect: (account: DisplaySiteData | null) =>
          handleResolve(account, toastId)
      })
    })
  })
}

// Redemption Assist toast UI

let redemptionToastRoot: any | null = null

function ensureRedemptionToastRoot() {
  if (redemptionToastRoot) {
    return
  }

  const existing = document.getElementById("all-api-hub-redemption-toast-root")
  const container = existing || document.createElement("div")

  if (!existing) {
    container.id = "all-api-hub-redemption-toast-root"
    container.style.position = "fixed"
    container.style.zIndex = "2147483647"
    container.style.top = "0"
    container.style.left = "0"
    container.style.width = "100%"
    container.style.height = "0"
    container.style.pointerEvents = "none"
    document.documentElement.appendChild(container)
  }

  redemptionToastRoot = createRoot(container)
  redemptionToastRoot.render(React.createElement(ContentReactRoot))
}

function showRedemptionPromptToast(
  message: string = "test"
): Promise<RedemptionPromptAction> {
  ensureRedemptionToastRoot()

  return new Promise((resolve) => {
    let resolved = false

    const handleResolve = (action: RedemptionPromptAction, toastId: string) => {
      if (resolved) return
      resolved = true
      toast.dismiss(toastId)
      resolve(action)
    }

    toast.custom((toastInstance) => {
      const toastId = toastInstance.id
      return React.createElement(RedemptionPromptToast, {
        message,
        onAction: (action: RedemptionPromptAction) =>
          handleResolve(action, toastId)
      })
    })
  })
}

function showRedeemResultToast(success: boolean, message: string) {
  ensureRedemptionToastRoot()
  if (!message) return

  if (success) {
    toast.success(message)
  } else {
    toast.error(message)
  }
}

function injectClipboardWriteHook() {
  try {
    const script = document.createElement("script")
    script.textContent = `;(function() {
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return;
    const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);

    navigator.clipboard.writeText = function(text) {
      try {
        window.postMessage({ type: "__ALL_API_HUB_CLIPBOARD_WRITE__", text: String(text) }, "*");
      } catch (e) {
        // ignore
      }
      return originalWriteText(text);
    };
  } catch (e) {
    // ignore
  }
})();`
    ;(document.documentElement || document.head || document.body)?.appendChild(
      script
    )
    script.remove()
  } catch (error) {
    console.warn(
      "[RedemptionAssist][Content] Failed to inject clipboard hook:",
      error
    )
  }
}

function setupClipboardWriteListener() {
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return
    const data = event.data as any
    if (!data || data.type !== "__ALL_API_HUB_CLIPBOARD_WRITE__") return
    const text = typeof data.text === "string" ? data.text : ""
    if (text) {
      void scanForRedemptionCodes(text)
    }
  })
}

// Redemption Assist helpers

function setupRedemptionAssistDetection() {
  const CLICK_SCAN_INTERVAL_MS = 2000
  let lastClickScan = 0

  const handleClick = (event: MouseEvent) => {
    const now = Date.now()
    if (now - lastClickScan < CLICK_SCAN_INTERVAL_MS) return
    lastClickScan = now

    // Prefer current selection text if any
    const selection = window.getSelection()
    let text = selection?.toString().trim() || ""

    // Fallback to clicked element text (truncate to avoid huge payloads)
    if (!text) {
      const target = event.target as HTMLElement | null
      if (target) {
        text = (target.innerText || target.textContent || "").slice(0, 2000)
      }
    }

    if (text) {
      void scanForRedemptionCodes(text)
    }
  }

  const handleClipboardEvent = (event: ClipboardEvent) => {
    // Try selection text first
    const selection = window.getSelection()
    let text = selection?.toString().trim() || ""

    // Then clipboard data from the event if available (primarily for paste)
    if (!text && event.clipboardData) {
      const clipText = event.clipboardData.getData("text")
      if (clipText) {
        text = clipText
      }
    }

    if (text) {
      void scanForRedemptionCodes(text)
    }
  }

  document.addEventListener("click", handleClick, true)
  document.addEventListener("copy", handleClipboardEvent, true)
  document.addEventListener("cut", handleClipboardEvent, true)
}

async function scanForRedemptionCodes(sourceText?: string) {
  try {
    let text = (sourceText ?? "").trim()

    if (!text) {
      const { body } = document
      if (!body) return

      text = (body.innerText || "").trim()
    }

    if (!text) return

    const codes = extractRedemptionCodesFromText(text).slice(0, 3)
    if (codes.length === 0) return

    const url = window.location.href

    for (const code of codes) {
      console.log("[RedemptionAssist][Content] Detected code:", code, url)
      const shouldResp: any = await browser.runtime.sendMessage({
        action: "redemptionAssist:shouldPrompt",
        url,
        code
      })

      if (!shouldResp?.success || !shouldResp.shouldPrompt) {
        continue
      }

      console.log("[RedemptionAssist][Content] Prompting for code:", code)

      const codePreview = maskCode(code)
      const confirmMessage = t("redemptionAssist:messages.promptConfirm", {
        code: codePreview,
        defaultValue:
          "检测到疑似兑换码：" + codePreview + "\n是否为当前站点尝试自动兑换？"
      })
      const action = await showRedemptionPromptToast(confirmMessage)
      if (action !== "auto") continue

      const redeemResp: any = await browser.runtime.sendMessage({
        action: "redemptionAssist:autoRedeemByUrl",
        url,
        code
      })

      const result = redeemResp?.data

      // Direct success from background auto redeem
      if (result?.success) {
        if (result.message) {
          showRedeemResultToast(true, result.message)
        }
        continue
      }

      // Multiple matching accounts on the same domain – let user choose
      if (result?.code === "MULTIPLE_ACCOUNTS" && result.candidates?.length) {
        const selected = await showAccountSelectToast(result.candidates, {
          title: t("redemptionAssist:accountSelect.titleMultiple", {
            defaultValue: "检测到多个可用账号，请选择一个用于兑换"
          })
        })

        if (!selected) {
          continue
        }

        const manualResp: any = await browser.runtime.sendMessage({
          action: "redemptionAssist:autoRedeem",
          accountId: selected.id,
          code
        })

        const manualResult = manualResp?.data
        if (manualResult?.message) {
          showRedeemResultToast(!!manualResult.success, manualResult.message)
        }
        continue
      }

      // No clear match – show a search/select across all accounts
      if (result?.code === "NO_ACCOUNTS" && result.allAccounts?.length) {
        const selected = await showAccountSelectToast(result.allAccounts, {
          title: t("redemptionAssist:accountSelect.titleFallback", {
            defaultValue: "未找到与当前站点匹配的账号，请手动选择"
          })
        })

        if (!selected) {
          continue
        }

        const manualResp: any = await browser.runtime.sendMessage({
          action: "redemptionAssist:autoRedeem",
          accountId: selected.id,
          code
        })

        const manualResult = manualResp?.data
        if (manualResult?.message) {
          showRedeemResultToast(!!manualResult.success, manualResult.message)
        }
        continue
      }

      // Generic failure fallback
      const fallbackMessage = t("redemptionAssist:messages.redeemFailed", {
        defaultValue: "兑换失败，请稍后重试。"
      })
      const msg = redeemResp?.error || result?.message || fallbackMessage
      showRedeemResultToast(false, msg)
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
