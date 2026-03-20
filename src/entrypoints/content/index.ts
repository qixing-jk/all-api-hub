import { defineContentScript } from "wxt/utils/define-content-script"

import { setupRedemptionAssistContent } from "~/entrypoints/content/redemptionAssist"
import { setupWebAiApiCheckContent } from "~/entrypoints/content/webAiApiCheck"
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { createLogger } from "~/utils/core/logger"

import { setupContentMessageHandlers } from "./messageHandlers"
import { setContentScriptContext } from "./shared/uiRoot"

/**
 * Unified logger scoped to the content-script entrypoint.
 */
const logger = createLogger("ContentEntrypoint")

type ContentFeaturePreferences = {
  redemptionAssistDetectionEnabled: boolean
  redemptionAssistContextMenuEnabled: boolean
  webAiApiCheckDetectionEnabled: boolean
  webAiApiCheckContextMenuEnabled: boolean
}

type RawUserPreferences = {
  redemptionAssist?: {
    enabled?: boolean
    contextMenu?: {
      enabled?: boolean
    }
  }
  webAiApiCheck?: {
    enabled?: boolean
    contextMenu?: {
      enabled?: boolean
    }
    autoDetect?: {
      enabled?: boolean
    }
  }
}

const DEFAULT_CONTENT_FEATURE_PREFERENCES: ContentFeaturePreferences = {
  redemptionAssistDetectionEnabled: true,
  redemptionAssistContextMenuEnabled: true,
  webAiApiCheckDetectionEnabled: false,
  webAiApiCheckContextMenuEnabled: true,
}

/**
 * Shallow compare the listener-toggle preferences that matter to content scripts.
 */
function areContentFeaturePreferencesEqual(
  left: ContentFeaturePreferences | null,
  right: ContentFeaturePreferences,
) {
  return (
    !!left &&
    left.redemptionAssistDetectionEnabled ===
      right.redemptionAssistDetectionEnabled &&
    left.redemptionAssistContextMenuEnabled ===
      right.redemptionAssistContextMenuEnabled &&
    left.webAiApiCheckDetectionEnabled ===
      right.webAiApiCheckDetectionEnabled &&
    left.webAiApiCheckContextMenuEnabled ===
      right.webAiApiCheckContextMenuEnabled
  )
}

/**
 * Read the subset of user preferences that control content-side listener registration.
 */
async function readContentFeaturePreferences(): Promise<ContentFeaturePreferences> {
  try {
    const stored = (await browser.storage.local.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as Record<string, RawUserPreferences | undefined>

    const preferences =
      stored[USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES] ?? {}

    const redemptionEnabled = preferences.redemptionAssist?.enabled ?? true
    const webAiApiCheckEnabled = preferences.webAiApiCheck?.enabled ?? true

    return {
      redemptionAssistDetectionEnabled: redemptionEnabled,
      redemptionAssistContextMenuEnabled:
        redemptionEnabled &&
        (preferences.redemptionAssist?.contextMenu?.enabled ?? true),
      webAiApiCheckDetectionEnabled:
        webAiApiCheckEnabled &&
        (preferences.webAiApiCheck?.autoDetect?.enabled ?? false),
      webAiApiCheckContextMenuEnabled:
        webAiApiCheckEnabled &&
        (preferences.webAiApiCheck?.contextMenu?.enabled ?? true),
    }
  } catch (error) {
    logger.warn("Failed to read content feature preferences", error)
    return DEFAULT_CONTENT_FEATURE_PREFERENCES
  }
}

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",
  async main(ctx) {
    setContentScriptContext(ctx)
    const cleanup = mainLogic()
    ctx.onInvalidated(cleanup)
  },
})

/**
 * Bootstraps content-script side features: sanitizeUrlForLog, message handlers, and redemption assist UI.
 */
function mainLogic() {
  logger.debug("Hello content script", { id: browser.runtime.id })

  setupContentMessageHandlers()
  return setupContentFeatureControllers()
}

/**
 * Keep content-side feature listeners aligned with stored user preferences.
 */
function setupContentFeatureControllers() {
  let currentPreferences: ContentFeaturePreferences | null = null
  let cleanupRedemptionAssist = () => {}
  let cleanupWebAiApiCheck = () => {}
  let disposed = false
  let applyRun = 0

  const applyPreferences = async () => {
    const runId = ++applyRun
    const nextPreferences = await readContentFeaturePreferences()

    if (disposed || runId !== applyRun) {
      return
    }

    if (
      areContentFeaturePreferencesEqual(currentPreferences, nextPreferences)
    ) {
      return
    }

    cleanupRedemptionAssist()
    cleanupWebAiApiCheck()

    cleanupRedemptionAssist = setupRedemptionAssistContent({
      enableDetection: nextPreferences.redemptionAssistDetectionEnabled,
      enableContextMenu: nextPreferences.redemptionAssistContextMenuEnabled,
    })
    cleanupWebAiApiCheck = setupWebAiApiCheckContent({
      enableDetection: nextPreferences.webAiApiCheckDetectionEnabled,
      enableContextMenu: nextPreferences.webAiApiCheckContextMenuEnabled,
    })
    currentPreferences = nextPreferences
  }

  const handleStorageChanged = (
    changes: Record<string, browser.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") {
      return
    }

    if (!(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES in changes)) {
      return
    }

    void applyPreferences()
  }

  browser.storage.onChanged.addListener(handleStorageChanged)
  void applyPreferences()

  return () => {
    disposed = true
    browser.storage.onChanged.removeListener(handleStorageChanged)
    cleanupRedemptionAssist()
    cleanupWebAiApiCheck()
  }
}
