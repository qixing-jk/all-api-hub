import { RuntimeActionIds } from "~/constants/runtimeActions"
import { getAllTabs, sendRuntimeMessage } from "~/utils/browserApi"
import { createLogger } from "~/utils/logger"

import { getSafeErrorMessage } from "./redaction"

/**
 * Unified logger scoped to Sub2API token re-sync.
 *
 * Sub2API moved to an access-token + refresh-token model. We rely on the
 * Sub2API dashboard localStorage (and our content-script handler) to perform a
 * best-effort refresh when the stored access token is close to expiry.
 *
 * IMPORTANT: Never log JWT values.
 */
const logger = createLogger("Sub2ApiTokenResync")

const tryParseOrigin = (value: string): string | null => {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export type Sub2ApiResyncedToken = {
  accessToken: string
  source: "existing_tab" | "temp_window"
}

/**
 * Helper: send a message to a tab to read the Sub2API auth state from localStorage.
 *
 * The content script will attempt to read the `auth_token` and respond with the
 * value (if exists) or an error (if any issue occurs, e.g. CORS, missing keys).
 *
 * IMPORTANT: Never log JWT values.
 */
async function readUserFromTab(tabId: number, baseUrl: string) {
  try {
    return await browser.tabs.sendMessage(tabId, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: baseUrl,
    })
  } catch (error) {
    logger.debug("Failed to read Sub2API auth state from tab", {
      tabId,
      error: getSafeErrorMessage(error),
    })
    return null
  }
}

/**
 * Best-effort: read `auth_token` from an already-open tab with the same origin.
 */
export async function readSub2ApiAuthTokenFromExistingTab(
  baseUrl: string,
): Promise<string | null> {
  const origin = tryParseOrigin(baseUrl)
  if (!origin) return null

  if (!browser?.tabs?.query) return null

  const tabs = await getAllTabs().catch(() => [])
  const candidates = tabs
    .filter((tab) => {
      if (!tab?.id || !tab.url) return false
      const tabOrigin = tryParseOrigin(tab.url)
      return tabOrigin === origin
    })
    .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)))

  for (const tab of candidates) {
    const tabId = tab.id
    if (typeof tabId !== "number") continue

    const response = await readUserFromTab(tabId, baseUrl)
    if (!response?.success) {
      continue
    }

    const token = response.data?.accessToken
    if (typeof token === "string" && token.trim()) {
      return token.trim()
    }
  }

  return null
}

/**
 * Best-effort: read `auth_token` by opening a temp window context.
 *
 * Reuses the existing auto-detect runtime flow, which already knows how to
 * acquire a temp context and read localStorage in a site page environment.
 */
export async function readSub2ApiAuthTokenFromTempWindow(
  baseUrl: string,
): Promise<string | null> {
  try {
    const response = await sendRuntimeMessage({
      action: RuntimeActionIds.AutoDetectSite,
      url: baseUrl,
      requestId: `sub2api-token-resync-${Date.now()}`,
    })

    const token = response?.data?.accessToken
    if (typeof token === "string" && token.trim()) {
      return token.trim()
    }

    return null
  } catch (error) {
    logger.warn("Failed to read auth_token via temp window", {
      baseUrl,
      error: getSafeErrorMessage(error),
    })
    return null
  }
}

/**
 * Re-sync Sub2API JWT from localStorage.
 *
 * Strategy:
 * 1) Prefer an already-open tab (least intrusive)
 * 2) Fall back to a temp-window context
 */
export async function resyncSub2ApiAuthToken(
  baseUrl: string,
): Promise<Sub2ApiResyncedToken | null> {
  const fromTab = await readSub2ApiAuthTokenFromExistingTab(baseUrl)
  if (fromTab) {
    return { accessToken: fromTab, source: "existing_tab" }
  }

  const fromTempWindow = await readSub2ApiAuthTokenFromTempWindow(baseUrl)
  if (fromTempWindow) {
    return { accessToken: fromTempWindow, source: "temp_window" }
  }

  return null
}
