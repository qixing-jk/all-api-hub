import { t } from "i18next"
import * as React from "react"
import { createRoot } from "react-dom/client"
import toast from "react-hot-toast"

import type { DisplaySiteData } from "~/types"
import { extractRedemptionCodesFromText } from "~/utils/redemptionAssist"

import { ContentReactRoot } from "./ContentReactRoot"
import { RedemptionAccountSelectToast } from "./RedemptionAccountSelectToast"
import {
  RedemptionPromptToast,
  type RedemptionPromptAction
} from "./RedemptionPromptToast"

let redemptionToastRoot: any | null = null

export function setupRedemptionAssistContent() {
  injectClipboardWriteHook()
  setupClipboardWriteListener()
  setupRedemptionAssistDetection()
}

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

function readClipboardLegacy() {
  const textarea = document.createElement("textarea")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.focus()

  try {
    document.execCommand("paste")
    const text = textarea.value
    document.body.removeChild(textarea)
    return text
  } catch (err) {
    console.error("Failed to read clipboard:", err)
    document.body.removeChild(textarea)
    return ""
  }
}

function setupRedemptionAssistDetection() {
  const CLICK_SCAN_INTERVAL_MS = 2000
  let lastClickScan = 0

  const handleClick = async (event: MouseEvent) => {
    const now = Date.now()
    if (now - lastClickScan < CLICK_SCAN_INTERVAL_MS) return
    lastClickScan = now

    const selection = window.getSelection()
    let text = selection?.toString().trim() || ""

    if (!text) {
      const target = event.target as HTMLElement | null
      if (target) {
        text = (target.innerText || target.textContent || "").slice(0, 2000)
      }
    }

    if (!text && navigator.clipboard && navigator.clipboard.readText) {
      try {
        const clipText = await navigator.clipboard.readText()
        if (clipText) {
          text = clipText.trim()
        }
      } catch (error) {
        console.warn(
          "[RedemptionAssist][Content] Clipboard read failed:",
          error
        )
        text = readClipboardLegacy()
      }
    }

    if (text) {
      void scanForRedemptionCodes(text)
    }
  }

  const handleClipboardEvent = (event: ClipboardEvent) => {
    const selection = window.getSelection()
    let text = selection?.toString().trim() || ""

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
    const text = (sourceText ?? "").trim()
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

      if (result?.success) {
        if (result.message) {
          showRedeemResultToast(true, result.message)
        }
        continue
      }

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
