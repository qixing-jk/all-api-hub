/* global chrome */
import fs from "node:fs"
import path from "node:path"

import { isIsolatedDevProfile, resolveDevProfileDir } from "./dev-profile.mjs"

const canonicalPath = (value) => {
  const absolute = path.resolve(value)
  const canonical = fs.existsSync(absolute)
    ? fs.realpathSync.native(absolute)
    : absolute
  return process.platform === "win32" ? canonical.toLowerCase() : canonical
}

/** Fail before using an isolated CDP listener belonging to another profile. */
export async function assertDevBrowserProfile(browser) {
  if (!isIsolatedDevProfile() && !process.env.AAH_DEV_PROFILE_DIR) return
  const session = await browser.newBrowserCDPSession()
  try {
    const { arguments: args } = await session.send(
      "Browser.getBrowserCommandLine",
    )
    const inline = args.find((arg) => arg.startsWith("--user-data-dir="))
    const flagIndex = args.indexOf("--user-data-dir")
    const actual = inline
      ? inline.slice("--user-data-dir=".length)
      : flagIndex >= 0
        ? args[flagIndex + 1]
        : undefined
    if (
      !actual ||
      canonicalPath(actual) !== canonicalPath(resolveDevProfileDir())
    ) {
      throw new Error(
        "CDP profile mismatch; select a free CDP_PORT for this worktree and relaunch its browser",
      )
    }
  } finally {
    await session.detach().catch(() => {})
  }
}

/** Load using the browser-supported installer, then require an enabled extension. */
export async function ensureDevExtensionReady(browser, extensionDir) {
  const session = await browser.newBrowserCDPSession()
  try {
    const { id } = await session.send("Extensions.loadUnpacked", {
      path: path.resolve(extensionDir),
    })
    let { extensions } = await session.send("Extensions.getExtensions")
    let extension = extensions.find(
      (entry) =>
        entry.id === id &&
        canonicalPath(entry.path) === canonicalPath(extensionDir),
    )
    if (extension && !extension.enabled) {
      const page = await browser.contexts()[0].newPage()
      try {
        await page.goto("chrome://extensions")
        await page.evaluate(async (extensionId) => {
          await new Promise((resolve, reject) =>
            chrome.developerPrivate.updateProfileConfiguration(
              { inDeveloperMode: true },
              () => {
                if (chrome.runtime.lastError)
                  reject(new Error(chrome.runtime.lastError.message))
                else resolve()
              },
            ),
          )
          await new Promise((resolve, reject) =>
            chrome.management.setEnabled(extensionId, true, () => {
              if (chrome.runtime.lastError)
                reject(new Error(chrome.runtime.lastError.message))
              else resolve()
            }),
          )
        }, id)
      } finally {
        await page.close().catch(() => {})
      }
      ;({ extensions } = await session.send("Extensions.getExtensions"))
      extension = extensions.find(
        (entry) =>
          entry.id === id &&
          canonicalPath(entry.path) === canonicalPath(extensionDir),
      )
    }
    if (!extension?.enabled) {
      throw new Error(
        "The requested extension is not enabled; open the browser extension manager, enable it and retry",
      )
    }
    return id
  } finally {
    await session.detach().catch(() => {})
  }
}
