/* global chrome */
import { chromium } from "@playwright/test"

import {
  assertDevBrowserProfile,
  findInstalledDevExtension,
} from "./browser-runtime.mjs"

/** Reload an installed build by its exact path, preserving other extensions. */
export async function reloadRunningExtension(cdpPort, extensionDir) {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
  try {
    await assertDevBrowserProfile(browser)
    const extensionId = await findInstalledDevExtension(browser, extensionDir)
    const origin = `chrome-extension://${extensionId}/`
    const context = browser.contexts()[0]
    const pages = context
      .pages()
      .filter((page) => page.url().startsWith(origin))
      .map((page) => ({ page, url: page.url() }))
    let wakePage
    let readyPage
    let probePage
    try {
      let worker = context
        .serviceWorkers()
        .find((entry) => entry.url().startsWith(origin))
      if (!worker) {
        wakePage = await context.newPage()
        await wakePage.goto(`${origin}options.html`, {
          waitUntil: "domcontentloaded",
        })
        worker = context
          .serviceWorkers()
          .find((entry) => entry.url().startsWith(origin))
      }
      const replacementReady = context.waitForEvent("serviceworker", {
        predicate: (entry) =>
          entry !== worker && entry.url().startsWith(origin),
        timeout: 10000,
      })
      // Observe early startup failures immediately, then finish owned page work
      // before propagating them so cleanup cannot race page creation.
      replacementReady.catch(() => {})
      const closed = worker
        ? worker.waitForEvent("close", { timeout: 10000 })
        : Promise.resolve()
      await Promise.all([
        closed,
        (worker ?? wakePage)
          .evaluate(() => chrome.runtime.reload())
          .catch((error) => {
            if (
              /Execution context was destroyed|Target.*closed/i.test(
                error.message,
              )
            )
              return closed
            throw error
          }),
      ])
      for (const { page, url } of pages) {
        if (!page.isClosed()) {
          try {
            await page.reload({ waitUntil: "domcontentloaded" })
            probePage ??= page
            continue
          } catch (error) {
            if (!page.isClosed()) throw error
          }
        }
        const replacement = await context.newPage()
        await replacement.goto(url, { waitUntil: "domcontentloaded" })
        probePage ??= replacement
      }
      if (pages.length === 0) {
        readyPage = await context.newPage()
        await readyPage.goto(`${origin}options.html`, {
          waitUntil: "domcontentloaded",
        })
        probePage = readyPage
      }
      const replacementWorker = await replacementReady
      const runtimeId = await replacementWorker.evaluate(
        () => chrome.runtime.id,
      )
      if (runtimeId !== extensionId) {
        throw new Error(
          `Replacement worker identity mismatch for extension ${extensionId}`,
        )
      }
      // This existing read-only action verifies the background root listener,
      // which can be absent even while a failed worker still exposes runtime.id.
      const response = await probePage.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error("Background readiness probe timed out")),
              10000,
            )
            chrome.runtime.sendMessage(
              { action: "getInternalTabIds", tabIds: [] },
              (result) => {
                clearTimeout(timer)
                const error = chrome.runtime.lastError
                if (error) reject(new Error(error.message))
                else resolve(result)
              },
            )
          }),
      )
      if (
        response?.success !== true ||
        !Array.isArray(response.tabIds) ||
        response.tabIds.length !== 0
      ) {
        throw new Error(
          `Background readiness probe failed for extension ${extensionId}`,
        )
      }
    } finally {
      await readyPage?.close().catch(() => {})
      await wakePage?.close().catch(() => {})
    }
    console.log(
      `🔄 扩展 [${extensionId}] 已成功在运行中的调试浏览器中触发重载！`,
    )
    return extensionId
  } finally {
    await browser.close()
  }
}
