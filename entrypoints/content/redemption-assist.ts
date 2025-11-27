/**
 * Redemption Assist Content Script
 * Detects redemption codes on custom check-in pages and shows in-page toast prompts
 */

import { isPossibleRedemptionCode } from "~/services/redeemService"
import type {
  RedemptionAccountCandidate,
  RedemptionDecisionMessage,
  RedemptionResult
} from "~/types/messages"

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    initRedemptionAssist()
  }
})

// Queue of pending prompts (max 3)
const MAX_QUEUE_SIZE = 3
const promptQueue: Array<{
  code: string
  accountCandidates: RedemptionAccountCandidate[]
  promptId: string
}> = []
let isShowingPrompt = false

function initRedemptionAssist() {
  console.log("[RedemptionAssist] Content script initialized")

  // Check if feature is enabled before setting up listeners
  checkIfEnabled().then((enabled) => {
    if (!enabled) {
      console.log("[RedemptionAssist] Feature disabled, not initializing")
      return
    }

    setupDetection()
  })
}

/**
 * Check if redemption assist is enabled
 */
async function checkIfEnabled(): Promise<boolean> {
  try {
    const response = await browser.runtime.sendMessage({
      type: "REDEMPTION_CHECK_ENABLED"
    })
    return response?.enabled ?? false
  } catch (error) {
    console.error("[RedemptionAssist] Failed to check if enabled:", error)
    return false
  }
}

/**
 * Setup code detection mechanisms
 */
function setupDetection() {
  // Listen for paste events
  document.addEventListener("paste", handlePaste)

  // Scan page on load
  setTimeout(() => {
    scanPageForCodes()
  }, 1000)

  // Watch for DOM changes (debounced)
  let scanTimeout: ReturnType<typeof setTimeout> | null = null
  const observer = new MutationObserver(() => {
    if (scanTimeout) clearTimeout(scanTimeout)
    scanTimeout = setTimeout(() => {
      scanPageForCodes()
    }, 500)
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true
  })

  // Try to read clipboard on page focus (best-effort)
  window.addEventListener("focus", async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText()
        if (text && isPossibleRedemptionCode(text)) {
          await handleCodeDetected(text.trim())
        }
      }
    } catch (error) {
      // Clipboard access denied, that's okay
      console.log("[RedemptionAssist] Clipboard read not available")
    }
  })

  console.log("[RedemptionAssist] Detection setup complete")
}

/**
 * Handle paste events
 */
async function handlePaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData("text")
  if (text && isPossibleRedemptionCode(text)) {
    await handleCodeDetected(text.trim())
  }
}

/**
 * Scan visible page text for codes
 */
function scanPageForCodes() {
  const textNodes = getTextNodes(document.body)
  const codes = new Set<string>()

  for (const node of textNodes) {
    const text = node.textContent || ""
    // Look for 32-char hex codes
    const matches = text.match(/[a-f0-9]{32}/gi)
    if (matches) {
      matches.forEach((code) => {
        if (isPossibleRedemptionCode(code)) {
          codes.add(code.toLowerCase())
        }
      })
    }
  }

  // Handle detected codes
  codes.forEach(async (code) => {
    await handleCodeDetected(code)
  })
}

/**
 * Get all text nodes in an element
 */
function getTextNodes(element: Node): Node[] {
  const textNodes: Node[] = []
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null)

  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node.textContent && node.textContent.trim()) {
      textNodes.push(node)
    }
  }

  return textNodes
}

/**
 * Handle detected redemption code
 */
async function handleCodeDetected(code: string) {
  try {
    const response = await browser.runtime.sendMessage({
      type: "REDEMPTION_CODE_DETECTED",
      url: window.location.href,
      code
    })

    if (response?.success && response?.shouldPrompt && response?.prompt) {
      const { promptId, accountCandidates } = response.prompt

      // Add to queue if not full
      if (promptQueue.length < MAX_QUEUE_SIZE) {
        promptQueue.push({ code, accountCandidates, promptId })
        console.log(
          `[RedemptionAssist] Added to queue (${promptQueue.length}/${MAX_QUEUE_SIZE})`
        )

        // Process queue if not already showing
        if (!isShowingPrompt) {
          processQueue()
        }
      } else {
        console.log("[RedemptionAssist] Queue full, skipping prompt")
      }
    }
  } catch (error) {
    console.error("[RedemptionAssist] Error handling code detection:", error)
  }
}

/**
 * Process prompt queue
 */
async function processQueue() {
  if (promptQueue.length === 0 || isShowingPrompt) {
    return
  }

  isShowingPrompt = true
  const prompt = promptQueue.shift()

  if (!prompt) {
    isShowingPrompt = false
    return
  }

  await showPromptToast(prompt.code, prompt.accountCandidates, prompt.promptId)

  isShowingPrompt = false

  // Process next if available
  if (promptQueue.length > 0) {
    setTimeout(() => processQueue(), 500)
  }
}

/**
 * Show prompt toast to user
 */
async function showPromptToast(
  code: string,
  accountCandidates: RedemptionAccountCandidate[],
  promptId: string
) {
  return new Promise<void>((resolve) => {
    const toast = createToastElement(code, accountCandidates, promptId, () => {
      resolve()
    })
    document.body.appendChild(toast)
  })
}

/**
 * Create toast element
 */
function createToastElement(
  code: string,
  accountCandidates: RedemptionAccountCandidate[],
  promptId: string,
  onClose: () => void
): HTMLElement {
  const container = document.createElement("div")
  container.id = `redemption-toast-${promptId}`
  container.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 999999;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 16px;
    max-width: 400px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    animation: slideIn 0.3s ease-out;
  `

  // Add animation
  const style = document.createElement("style")
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  `
  document.head.appendChild(style)

  const codeMasked = code.slice(0, 8) + "..." + code.slice(-8)
  let isCodeVisible = false

  container.innerHTML = `
    <div style="margin-bottom: 12px;">
      <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #111;">
        检测到兑换码，是否兑换？
      </h3>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <span style="font-family: monospace; font-size: 13px; color: #666;" id="code-display-${promptId}">
          ${codeMasked}
        </span>
        <button id="toggle-code-${promptId}" style="
          background: none;
          border: none;
          color: #2563eb;
          cursor: pointer;
          font-size: 12px;
          padding: 2px 6px;
          text-decoration: underline;
        ">显示完整代码</button>
      </div>
      ${
        accountCandidates.length > 1
          ? `<div style="font-size: 13px; color: #666; margin-bottom: 8px;">
          检测到 ${accountCandidates.length} 个匹配账号
        </div>`
          : `<div style="font-size: 13px; color: #666; margin-bottom: 8px;">
          账号: ${accountCandidates[0]?.name || "未知"}
        </div>`
      }
    </div>
    <div style="display: flex; gap: 8px; margin-bottom: 8px;">
      <button id="auto-redeem-${promptId}" style="
        flex: 1;
        padding: 8px 12px;
        background: #2563eb;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
      " onmouseover="this.style.background='#1d4ed8'" onmouseout="this.style.background='#2563eb'">
        自动兑换
      </button>
      <button id="manual-redeem-${promptId}" style="
        flex: 1;
        padding: 8px 12px;
        background: #f3f4f6;
        color: #374151;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
      " onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f3f4f6'">
        手动兑换
      </button>
      <button id="cancel-${promptId}" style="
        padding: 8px 12px;
        background: #f3f4f6;
        color: #6b7280;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        transition: background 0.2s;
      " onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f3f4f6'">
        取消
      </button>
    </div>
    <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #6b7280; cursor: pointer;">
      <input type="checkbox" id="suppress-${promptId}" style="cursor: pointer;">
      本代码10分钟内不再提示
    </label>
  `

  // Add event listeners
  const toggleBtn = container.querySelector(
    `#toggle-code-${promptId}`
  ) as HTMLButtonElement
  const codeDisplay = container.querySelector(
    `#code-display-${promptId}`
  ) as HTMLElement

  toggleBtn?.addEventListener("click", () => {
    isCodeVisible = !isCodeVisible
    if (codeDisplay) {
      codeDisplay.textContent = isCodeVisible ? code : codeMasked
    }
    if (toggleBtn) {
      toggleBtn.textContent = isCodeVisible ? "隐藏代码" : "显示完整代码"
    }
  })

  const autoBtn = container.querySelector(
    `#auto-redeem-${promptId}`
  ) as HTMLButtonElement
  const manualBtn = container.querySelector(
    `#manual-redeem-${promptId}`
  ) as HTMLButtonElement
  const cancelBtn = container.querySelector(
    `#cancel-${promptId}`
  ) as HTMLButtonElement
  const suppressCheckbox = container.querySelector(
    `#suppress-${promptId}`
  ) as HTMLInputElement

  const closeToast = (animate = true) => {
    if (animate) {
      container.style.animation = "slideOut 0.3s ease-out"
      setTimeout(() => {
        container.remove()
        onClose()
      }, 300)
    } else {
      container.remove()
      onClose()
    }
  }

  autoBtn?.addEventListener("click", async () => {
    autoBtn.disabled = true
    autoBtn.textContent = "兑换中..."

    let selectedAccountId: string | undefined
    if (accountCandidates.length === 1) {
      selectedAccountId = accountCandidates[0].accountId
    } else {
      // TODO: Show account selection UI
      // For now, use first account
      selectedAccountId = accountCandidates[0]?.accountId
    }

    if (!selectedAccountId) {
      showResultToast("error", "未选择账号")
      closeToast()
      return
    }

    const decision: RedemptionDecisionMessage = {
      type: "REDEMPTION_DECISION",
      payload: {
        promptId,
        action: "auto",
        accountId: selectedAccountId
      }
    }

    try {
      const response = await browser.runtime.sendMessage(decision)
      if (response?.success && response?.result) {
        const result = response.result as RedemptionResult
        showResultToast(
          result.status,
          result.message,
          result.siteError,
          selectedAccountId
        )
      } else {
        showResultToast("error", "兑换失败")
      }
    } catch (error) {
      console.error("[RedemptionAssist] Auto redeem error:", error)
      showResultToast("error", "兑换请求失败")
    }

    closeToast()
  })

  manualBtn?.addEventListener("click", async () => {
    let selectedAccountId: string | undefined
    if (accountCandidates.length === 1) {
      selectedAccountId = accountCandidates[0].accountId
    } else {
      // TODO: Show account selection UI
      // For now, use first account
      selectedAccountId = accountCandidates[0]?.accountId
    }

    if (!selectedAccountId) {
      showResultToast("error", "未选择账号")
      closeToast()
      return
    }

    const decision: RedemptionDecisionMessage = {
      type: "REDEMPTION_DECISION",
      payload: {
        promptId,
        action: "manual",
        accountId: selectedAccountId
      }
    }

    try {
      await browser.runtime.sendMessage(decision)
      showResultToast("success", "已打开兑换页面，代码已复制到剪贴板")
    } catch (error) {
      console.error("[RedemptionAssist] Manual redeem error:", error)
      showResultToast("error", "打开兑换页面失败")
    }

    closeToast()
  })

  cancelBtn?.addEventListener("click", () => {
    if (suppressCheckbox?.checked) {
      // TODO: Send suppress message to background
      console.log("[RedemptionAssist] User suppressed code")
    }
    closeToast()
  })

  return container
}

/**
 * Show result toast
 */
function showResultToast(
  status: "success" | "error",
  message: string,
  siteError?: string,
  accountId?: string
) {
  const container = document.createElement("div")
  container.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 999999;
    background: ${status === "success" ? "#10b981" : "#ef4444"};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 16px;
    max-width: 400px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    animation: slideIn 0.3s ease-out;
  `

  container.innerHTML = `
    <div style="font-size: 14px; font-weight: 500; margin-bottom: ${siteError ? "8px" : "0"};">
      ${status === "success" ? "✓" : "✗"} ${message}
    </div>
    ${siteError ? `<div style="font-size: 12px; opacity: 0.9;">${siteError}</div>` : ""}
    ${
      status === "error" && accountId
        ? `<button id="retry-manual" style="
        margin-top: 8px;
        padding: 6px 12px;
        background: rgba(255, 255, 255, 0.2);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        font-size: 13px;
        cursor: pointer;
        transition: background 0.2s;
      " onmouseover="this.style.background='rgba(255, 255, 255, 0.3)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.2)'">
        改为手动兑换
      </button>`
        : ""
    }
  `

  document.body.appendChild(container)

  // Auto-remove after 5 seconds
  setTimeout(() => {
    container.style.animation = "slideOut 0.3s ease-out"
    setTimeout(() => container.remove(), 300)
  }, 5000)
}
