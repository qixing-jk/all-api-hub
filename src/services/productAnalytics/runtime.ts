import { RuntimeActionIds } from "~/constants/runtimeActions"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  ACCOUNT_STORAGE_KEYS,
  USER_PREFERENCES_STORAGE_KEYS,
} from "~/services/core/storageKeys"
import { userPreferences } from "~/services/preferences/userPreferences"
import { isDevelopmentMode } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { productAnalyticsClient } from "./client"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  type ProductAnalyticsEventName,
  type ProductAnalyticsRuntimeRequest,
} from "./events"
import { productAnalyticsPreferences } from "./preferences"
import { buildSettingsSnapshotEvents } from "./settings"
import { shouldSendSettingsSnapshot } from "./settingsSnapshot"
import {
  buildSiteEcosystemAnalyticsEvents,
  shouldSendSiteEcosystemSnapshot,
} from "./siteEcosystem"

const logger = createLogger("ProductAnalyticsRuntime")
const ACCOUNT_CHANGE_SNAPSHOT_DEBOUNCE_MS = 2_000
const PREFERENCES_CHANGE_SNAPSHOT_DEBOUNCE_MS = 2_000
let cleanupAccountChangeListener: (() => void) | null = null
let cleanupPreferencesChangeListener: (() => void) | null = null

/**
 * Checks whether an incoming runtime event name is one of the fixed analytics enums.
 */
function isKnownEventName(value: unknown): value is ProductAnalyticsEventName {
  return (
    typeof value === "string" &&
    Object.values(PRODUCT_ANALYTICS_EVENTS).includes(
      value as ProductAnalyticsEventName,
    )
  )
}

/**
 * Captures the coarse site ecosystem snapshot when analytics is enabled and cadence allows it.
 */
async function captureSiteEcosystemSnapshot(): Promise<boolean> {
  if (!(await productAnalyticsPreferences.isEnabled())) return false

  const state = await productAnalyticsPreferences.getState()
  const now = Date.now()
  if (
    !shouldSendSiteEcosystemSnapshot(state.lastSiteEcosystemSnapshotAt, now)
  ) {
    return false
  }

  const accounts = await accountStorage.getAllAccounts()
  const events = buildSiteEcosystemAnalyticsEvents(accounts)

  for (const event of events) {
    const captured = await productAnalyticsClient.capture(
      event.eventName,
      event.properties,
    )
    if (!captured) return false
  }

  await productAnalyticsPreferences.setLastSiteEcosystemSnapshotAt(now)
  return true
}

/**
 * Captures the coarse settings snapshots when analytics is enabled and cadence allows it.
 */
async function captureSettingsSnapshot(): Promise<boolean> {
  if (!(await productAnalyticsPreferences.isEnabled())) return false

  const state = await productAnalyticsPreferences.getState()
  const now = Date.now()
  if (!shouldSendSettingsSnapshot(state.lastSettingsSnapshotAt, now)) {
    return false
  }

  const preferences = await userPreferences.getPreferences()
  const events = buildSettingsSnapshotEvents(
    preferences,
    PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
  )

  for (const properties of events) {
    const captured = await productAnalyticsClient.capture(
      PRODUCT_ANALYTICS_EVENTS.SettingChanged,
      properties,
    )
    if (!captured) return false
  }

  await productAnalyticsPreferences.setLastSettingsSnapshotAt(now)
  return true
}

/**
 * Validates and forwards a single typed analytics event request.
 */
async function handleTrackEventRequest(
  eventName: unknown,
  properties: unknown,
) {
  if (!isKnownEventName(eventName)) {
    return { success: false }
  }

  const success = await productAnalyticsClient.capture(eventName, properties)
  return { success }
}

/**
 * Captures a cadence-limited site ecosystem snapshot request.
 */
async function handleSiteEcosystemSnapshotRequest() {
  const success = await captureSiteEcosystemSnapshot()
  return { success }
}

/**
 * Captures a cadence-limited settings snapshot request.
 */
async function handleSettingsSnapshotRequest() {
  const success = await captureSettingsSnapshot()
  return { success }
}

/**
 * Routes product analytics runtime actions to their focused handlers.
 */
async function resolveProductAnalyticsResponse(
  request: ProductAnalyticsRuntimeRequest | Record<string, unknown>,
) {
  switch (request.action) {
    case RuntimeActionIds.ProductAnalyticsTrackEvent:
      return await handleTrackEventRequest(
        request.eventName,
        request.properties,
      )
    case RuntimeActionIds.ProductAnalyticsTrackSiteEcosystemSnapshot:
      return await handleSiteEcosystemSnapshotRequest()
    case RuntimeActionIds.ProductAnalyticsTrackSettingsSnapshot:
      return await handleSettingsSnapshotRequest()
    default:
      return { success: false }
  }
}

/**
 * Handles product analytics runtime messages from extension UI contexts.
 */
export async function handleProductAnalyticsMessage(
  request: ProductAnalyticsRuntimeRequest | Record<string, unknown>,
  sendResponse: (response?: unknown) => void,
) {
  try {
    sendResponse(await resolveProductAnalyticsResponse(request))
  } catch (error) {
    if (isDevelopmentMode()) {
      logger.debug("Product analytics runtime request failed", error)
    }
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}

/**
 * Starts snapshot capture without letting background lifecycle hooks fail on analytics errors.
 */
function captureSiteEcosystemSnapshotBestEffort() {
  void captureSiteEcosystemSnapshot().catch((error) => {
    if (isDevelopmentMode()) {
      logger.debug("Product analytics snapshot failed", error)
    }
  })
}

/**
 * Starts settings snapshot capture without letting background lifecycle hooks fail on analytics errors.
 */
function captureSettingsSnapshotBestEffort() {
  void captureSettingsSnapshot().catch((error) => {
    if (isDevelopmentMode()) {
      logger.debug("Product analytics settings snapshot failed", error)
    }
  })
}

/**
 * Watches local account storage changes and debounces site ecosystem snapshot capture.
 */
export function setupProductAnalyticsAccountChangeListener() {
  if (cleanupAccountChangeListener) {
    return cleanupAccountChangeListener
  }

  if (!browser.storage?.onChanged) {
    return () => {}
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  let isListening = true

  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      captureSiteEcosystemSnapshotBestEffort()
    }, ACCOUNT_CHANGE_SNAPSHOT_DEBOUNCE_MS)
  }

  const handleStorageChanged = (
    changes: Record<string, browser.storage.StorageChange>,
    areaName: string,
  ) => {
    if (!isListening) return
    if (areaName !== "local") return
    if (!(ACCOUNT_STORAGE_KEYS.ACCOUNTS in changes)) return
    schedule()
  }

  browser.storage.onChanged.addListener(handleStorageChanged)

  cleanupAccountChangeListener = () => {
    if (!cleanupAccountChangeListener) {
      return
    }

    isListening = false
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    browser.storage.onChanged.removeListener(handleStorageChanged)
    cleanupAccountChangeListener = null
  }

  return cleanupAccountChangeListener
}

/**
 * Watches local preference storage changes and debounces settings snapshot capture.
 */
export function setupProductAnalyticsPreferencesChangeListener() {
  if (cleanupPreferencesChangeListener) {
    return cleanupPreferencesChangeListener
  }

  if (!browser.storage?.onChanged) {
    return () => {}
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  let isListening = true

  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      captureSettingsSnapshotBestEffort()
    }, PREFERENCES_CHANGE_SNAPSHOT_DEBOUNCE_MS)
  }

  const handleStorageChanged = (
    changes: Record<string, browser.storage.StorageChange>,
    areaName: string,
  ) => {
    if (!isListening) return
    if (areaName !== "local") return
    if (!(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES in changes)) return
    schedule()
  }

  browser.storage.onChanged.addListener(handleStorageChanged)

  cleanupPreferencesChangeListener = () => {
    if (!cleanupPreferencesChangeListener) {
      return
    }

    isListening = false
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    browser.storage.onChanged.removeListener(handleStorageChanged)
    cleanupPreferencesChangeListener = null
  }

  return cleanupPreferencesChangeListener
}

/**
 * Triggers the startup site ecosystem snapshot in the background worker.
 */
export function triggerStartupSiteEcosystemSnapshot() {
  captureSiteEcosystemSnapshotBestEffort()
}

/**
 * Triggers the startup settings snapshot in the background worker.
 */
export function triggerStartupSettingsSnapshot() {
  captureSettingsSnapshotBestEffort()
}
