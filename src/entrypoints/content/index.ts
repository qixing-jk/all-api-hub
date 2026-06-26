import { defineContentScript } from "wxt/utils/define-content-script"

import { Storage } from "@plasmohq/storage"

import { setupRedemptionAssistContent } from "~/entrypoints/content/redemptionAssist"
import { setupWebAiApiCheckContent } from "~/entrypoints/content/webAiApiCheck"
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  DEFAULT_CONTENT_FEATURE_PREFERENCES,
  resolveContentFeaturePreferences,
  type ContentFeaturePreferences,
  type ContentFeaturePreferenceSource,
} from "~/services/preferences/contentScriptFeatureDefaults"
import { getRuntimeId, onStorageChanged } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"
import { ensureContentI18nReady } from "~/utils/i18n/content"

import { setupContentMessageHandlers } from "./messageHandlers"
import { setContentScriptContext } from "./shared/uiRoot"

/**
 * Unified logger scoped to the content-script entrypoint.
 */
const logger = createLogger("ContentEntrypoint")
const contentPreferencesStorage = new Storage({ area: "local" })

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
    left.webAiApiCheckEnhancedDetectionEnabled ===
      right.webAiApiCheckEnhancedDetectionEnabled &&
    left.webAiApiCheckContextMenuEnabled ===
      right.webAiApiCheckContextMenuEnabled
  )
}

/**
 * Read the subset of user preferences that control content-side listener registration.
 */
async function readContentFeaturePreferences(): Promise<ContentFeaturePreferences> {
  try {
    const preferences =
      await contentPreferencesStorage.get<ContentFeaturePreferenceSource>(
        USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      )

    return resolveContentFeaturePreferences(preferences)
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
  logger.debug("Hello content script", { id: getRuntimeId() })

  void ensureContentI18nReady().catch((error) => {
    logger.warn("Content i18n initialization failed", error)
  })

  const cleanupMessageHandlers = setupContentMessageHandlers()
  const cleanupFeatureControllers = setupContentFeatureControllers()

  return () => {
    cleanupMessageHandlers()
    cleanupFeatureControllers()
  }
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
      apiKeyCleanupPatterns: nextPreferences.webAiApiCheckKeyCleanupPatterns,
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

  const cleanupStorageChanged = onStorageChanged(handleStorageChanged)
  void applyPreferences()

  return () => {
    disposed = true
    cleanupStorageChanged()
    cleanupRedemptionAssist()
    cleanupWebAiApiCheck()
  }
}
