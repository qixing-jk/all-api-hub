/* global chrome */
import path from "node:path"
import { chromium } from "@playwright/test"

import { assertDevBrowserProfile } from "./browser-runtime.mjs"
import { resolveCdpPort } from "./dev-profile.mjs"

/**
 * Resolve the CDP URL at call time so a `--isolate` flag parsed later in the
 * process (e.g. in a runner's argument loop) still picks the right port.
 */
export function defaultCdpUrl() {
  return `http://127.0.0.1:${resolveCdpPort()}`
}

/**
 * Wake a specific extension's service worker and wrap the connection.
 *
 * Several worktrees can have their extension loaded in the same debug browser
 * at once, so a suite that must exercise one exact build pins its id instead of
 * relying on title-based discovery.
 */
export async function connectExtensionById({
  cdpUrl = process.env.CDP_URL || defaultCdpUrl(),
  extensionId,
} = {}) {
  if (!extensionId) {
    throw new Error("connectExtensionById 需要一个扩展 ID。")
  }

  let browser
  try {
    browser = await chromium.connectOverCDP(cdpUrl)
    await assertDevBrowserProfile(browser)
  } catch (err) {
    await browser?.close().catch(() => {})
    throw new Error(
      `无法连接到 CDP (${cdpUrl})。请先确认调试浏览器已启动 (pnpm browser:cdp)。\n底层错误: ${err.message}`,
    )
  }

  const contexts = browser.contexts()
  if (contexts.length === 0) {
    await browser.close().catch(() => {})
    throw new Error("未找到任何浏览器 Context。")
  }
  const context = contexts[0]

  // A dormant MV3 worker is not listed until something addresses the extension.
  let sw = context.serviceWorkers().find((w) => w.url().includes(extensionId))
  if (!sw) {
    const dummy = await context.newPage()
    await dummy
      .goto(`chrome-extension://${extensionId}/options.html`)
      .catch(() => {})
    await dummy.waitForTimeout(600)
    await dummy.close().catch(() => {})
    sw = context.serviceWorkers().find((w) => w.url().includes(extensionId))
  }

  if (!sw) {
    await browser.close().catch(() => {})
    throw new Error(
      `扩展 ${extensionId} 未挂载或 Service Worker 未激活。请确认该 ID 的扩展已加载到调试浏览器。`,
    )
  }

  return {
    browser,
    context,
    extensionId,
    serviceWorker: sw,
    // For a CDP connection this detaches Playwright without closing the
    // operator's browser: `Browser.close` is only sent on the launch path.
    async close() {
      await browser.close().catch(() => {})
    },
  }
}

/**
 * Connect to running dev browser over CDP and locate the current worktree's extension.
 */
export async function connectDevExtension({
  cdpUrl = process.env.CDP_URL || defaultCdpUrl(),
} = {}) {
  let browser
  try {
    browser = await chromium.connectOverCDP(cdpUrl)
    await assertDevBrowserProfile(browser)
  } catch (err) {
    await browser?.close().catch(() => {})
    throw new Error(
      `无法连接到 CDP (${cdpUrl})。请先确认调试浏览器已启动 (pnpm browser:cdp)。\n底层错误: ${err.message}`,
    )
  }

  const contexts = browser.contexts()
  if (contexts.length === 0) {
    await browser.close().catch(() => {})
    throw new Error("未找到任何浏览器 Context。")
  }
  const context = contexts[0]

  let targetExtId = null
  const currentWorktree = path.basename(process.cwd()).toLowerCase()

  // 1. 通过 CDP Target 探测匹配当前 worktree 的扩展
  try {
    const session = await browser.newBrowserCDPSession()
    const { targetInfos } = await session.send("Target.getTargets")
    for (const t of targetInfos) {
      if (t.url && t.url.startsWith("chrome-extension://")) {
        const id = new URL(t.url).hostname
        const lowerTitle = (t.title || "").toLowerCase()
        const isAah =
          lowerTitle.includes("all api hub") ||
          lowerTitle.includes("all-api-hub")

        if (isAah) {
          const isDev = lowerTitle.includes("dev")
          if (isDev && !lowerTitle.includes(currentWorktree)) {
            continue
          }
          targetExtId = id
          break
        }
      }
    }
    await session.detach().catch(() => {})
  } catch {
    // 忽略异常并降级
  }

  // 2. 若未探测到，检查 Service Workers
  if (!targetExtId) {
    const workers = context.serviceWorkers()
    for (const sw of workers) {
      const swUrl = sw.url()
      if (swUrl.startsWith("chrome-extension://")) {
        try {
          const id = new URL(swUrl).hostname
          const manifestName = await sw.evaluate(() => {
            try {
              return chrome.runtime.getManifest()?.name || ""
            } catch {
              return ""
            }
          })
          const lowerName = manifestName.toLowerCase()
          const isAah =
            lowerName.includes("all api hub") ||
            lowerName.includes("all-api-hub")

          if (isAah) {
            const isDev = lowerName.includes("dev")
            if (isDev && !lowerName.includes(currentWorktree)) {
              continue
            }
            targetExtId = id
            break
          }
        } catch {
          // 忽略
        }
      }
    }
  }

  // 3. 唤醒并最后重试
  if (!targetExtId) {
    const dummy = await context.newPage()
    await dummy.goto("edge://extensions").catch(() => {})
    await dummy.waitForTimeout(600)
    await dummy.close().catch(() => {})

    try {
      const session = await browser.newBrowserCDPSession()
      const { targetInfos } = await session.send("Target.getTargets")
      for (const t of targetInfos) {
        if (t.url && t.url.startsWith("chrome-extension://")) {
          const lowerTitle = (t.title || "").toLowerCase()
          const isAah =
            lowerTitle.includes("all api hub") ||
            lowerTitle.includes("all-api-hub")
          if (!isAah) continue
          if (
            lowerTitle.includes("dev") &&
            !lowerTitle.includes(currentWorktree)
          ) {
            continue
          }
          targetExtId = new URL(t.url).hostname
          break
        }
      }
      await session.detach().catch(() => {})
    } catch {
      // 忽略
    }
  }

  if (!targetExtId) {
    await browser.close().catch(() => {})
    throw new Error(
      "未找到已挂载的 All API Hub 扩展实例！请确认扩展已在浏览器中加载。",
    )
  }

  // 确保 Service Worker 活跃
  let sw = context.serviceWorkers().find((w) => w.url().includes(targetExtId))
  if (!sw) {
    const dummy = await context.newPage()
    await dummy
      .goto(`chrome-extension://${targetExtId}/options.html`)
      .catch(() => {})
    await dummy.waitForTimeout(600)
    await dummy.close().catch(() => {})
    sw = context.serviceWorkers().find((w) => w.url().includes(targetExtId))
  }
  if (!sw) {
    await browser.close().catch(() => {})
    throw new Error(`扩展 ${targetExtId} 的 Service Worker 未激活。`)
  }

  return {
    browser,
    context,
    extensionId: targetExtId,
    serviceWorker: sw,
    async close() {
      await browser.close().catch(() => {})
    },
  }
}
