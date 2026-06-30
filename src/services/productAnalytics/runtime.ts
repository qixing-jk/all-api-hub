import { accountStorage } from "~/services/accounts/accountStorage"
import {
  ACCOUNT_STORAGE_KEYS,
  USER_PREFERENCES_STORAGE_KEYS,
} from "~/services/core/storageKeys"
import { userPreferences } from "~/services/preferences/userPreferences"
import { flushSponsorRecommendationsDailySummary } from "~/services/productAnalytics/sponsorRecommendationsSummary"
import {
  hasStorageChangedListener,
  onStorageChanged,
} from "~/utils/browser/browserApi"
import { isDevBuild } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { productAnalyticsClient } from "./client"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  type ProductAnalyticsEventName,
} from "./contracts"
import { registerProductAnalyticsBackgroundHandler } from "./dispatch"
import {
  onProductAnalyticsMessage,
  ProductAnalyticsMessageTypes,
  type ProductAnalyticsRuntimeResponse,
  type ProductAnalyticsTrackRequest,
} from "./messaging"
import { productAnalyticsPreferences } from "./preferences"
import { buildAggregateSettingsSnapshotEvent } from "./settings"
import { shouldSendSettingsSnapshot } from "./settingsSnapshot"
import { flushShieldBypassDailySummary } from "./shieldBypassSummary"
import {
  buildSiteEcosystemAnalyticsEvents,
  shouldSendSiteEcosystemSnapshot,
} from "./siteEcosystem"
import { productAnalyticsState } from "./state"

const logger = createLogger("ProductAnalyticsRuntime")
const ACCOUNT_CHANGE_SNAPSHOT_DEBOUNCE_MS = 2_000
const PREFERENCES_CHANGE_SNAPSHOT_DEBOUNCE_MS = 2_000
let cleanupAccountChangeListener: (() => void) | null = null
let cleanupPreferencesChangeListener: (() => void) | null = null
let productAnalyticsMessagingCleanup: (() => void)[] | null = null

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

  const state = await productAnalyticsState.getState()
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

  await productAnalyticsState.setLastSiteEcosystemSnapshotAt(now)
  return true
}

/**
 * Captures the coarse settings snapshots when analytics is enabled and cadence allows it.
 */
async function captureSettingsSnapshot(): Promise<boolean> {
  if (!(await productAnalyticsPreferences.isEnabled())) return false

  const state = await productAnalyticsState.getState()
  const now = Date.now()
  if (!shouldSendSettingsSnapshot(state.lastSettingsSnapshotAt, now)) {
    return false
  }

  const preferences = await userPreferences.getPreferences()
  const event = buildAggregateSettingsSnapshotEvent(
    preferences,
    PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
  )

  const captured = await productAnalyticsClient.capture(
    PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
    event,
  )
  if (!captured) return false

  await productAnalyticsState.setLastSettingsSnapshotAt(now)
  return true
}

/**
 * Validates and forwards a single typed analytics event request.
 */
async function handleTrackEventRequest(
  eventName: unknown,
  properties: unknown,
): Promise<ProductAnalyticsRuntimeResponse> {
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
 * Routes typed product analytics runtime requests to their focused handlers.
 */
async function resolveProductAnalyticsResponse(
  type: ProductAnalyticsMessageType,
  request: ProductAnalyticsTrackRequest | Record<string, unknown>,
): Promise<ProductAnalyticsRuntimeResponse> {
  switch (type) {
    case ProductAnalyticsMessageTypes.TrackEvent:
      return await handleTrackEventRequest(
        request.eventName,
        request.properties,
      )
    case ProductAnalyticsMessageTypes.TrackSiteEcosystemSnapshot:
      return await handleSiteEcosystemSnapshotRequest()
    case ProductAnalyticsMessageTypes.TrackSettingsSnapshot:
      return await handleSettingsSnapshotRequest()
    default:
      return { success: false }
  }
}

type ProductAnalyticsMessageType =
  (typeof ProductAnalyticsMessageTypes)[keyof typeof ProductAnalyticsMessageTypes]

/**
 * Handles typed product analytics runtime messages from extension UI contexts.
 */
export async function handleProductAnalyticsMessage(
  type: ProductAnalyticsMessageType,
  request: ProductAnalyticsTrackRequest | Record<string, unknown>,
): Promise<ProductAnalyticsRuntimeResponse> {
  try {
    return await resolveProductAnalyticsResponse(type, request)
  } catch (error) {
    if (isDevBuild()) {
      logger.debug("Product analytics runtime request failed", error)
    }
    return { success: false, error: getErrorMessage(error) }
  }
}

registerProductAnalyticsBackgroundHandler(handleProductAnalyticsMessage)

/**
 * Background listeners for typed product analytics messaging.
 */
export function setupProductAnalyticsMessagingListeners() {
  if (productAnalyticsMessagingCleanup) {
    return
  }

  productAnalyticsMessagingCleanup = [
    onProductAnalyticsMessage(
      ProductAnalyticsMessageTypes.TrackEvent,
      ({ data }) =>
        handleProductAnalyticsMessage(
          ProductAnalyticsMessageTypes.TrackEvent,
          data,
        ),
    ),
    onProductAnalyticsMessage(
      ProductAnalyticsMessageTypes.TrackSiteEcosystemSnapshot,
      ({ data }) =>
        handleProductAnalyticsMessage(
          ProductAnalyticsMessageTypes.TrackSiteEcosystemSnapshot,
          data,
        ),
    ),
    onProductAnalyticsMessage(
      ProductAnalyticsMessageTypes.TrackSettingsSnapshot,
      ({ data }) =>
        handleProductAnalyticsMessage(
          ProductAnalyticsMessageTypes.TrackSettingsSnapshot,
          data,
        ),
    ),
  ]
}

/**
 * Starts snapshot capture without letting background lifecycle hooks fail on analytics errors.
 */
function captureSiteEcosystemSnapshotBestEffort() {
  void captureSiteEcosystemSnapshot().catch((error) => {
    if (isDevBuild()) {
      logger.debug("Product analytics snapshot failed", error)
    }
  })
}

/**
 * Starts settings snapshot capture without letting background lifecycle hooks fail on analytics errors.
 */
function captureSettingsSnapshotBestEffort() {
  void captureSettingsSnapshot().catch((error) => {
    if (isDevBuild()) {
      logger.debug("Product analytics settings snapshot failed", error)
    }
  })
}

/**
 * Starts shield-bypass summary capture without failing background startup.
 */
function flushShieldBypassDailySummaryBestEffort() {
  void flushShieldBypassDailySummary().catch((error) => {
    if (isDevBuild()) {
      logger.debug("Product analytics shield bypass summary failed", error)
    }
  })
}

/**
 * Starts sponsor recommendations summary capture without failing background startup.
 */
function flushSponsorRecommendationsDailySummaryBestEffort() {
  void flushSponsorRecommendationsDailySummary().catch((error) => {
    if (isDevBuild()) {
      logger.debug(
        "Product analytics sponsor recommendations summary failed",
        error,
      )
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

  if (!hasStorageChangedListener()) {
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

  const cleanupStorageChanged = onStorageChanged(handleStorageChanged)

  cleanupAccountChangeListener = () => {
    if (!cleanupAccountChangeListener) {
      return
    }

    isListening = false
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    cleanupStorageChanged()
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

  if (!hasStorageChangedListener()) {
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

  const cleanupStorageChanged = onStorageChanged(handleStorageChanged)

  cleanupPreferencesChangeListener = () => {
    if (!cleanupPreferencesChangeListener) {
      return
    }

    isListening = false
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    cleanupStorageChanged()
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

/**
 * Triggers the startup shield-bypass summary flush in the background worker.
 */
export function triggerStartupShieldBypassDailySummary() {
  flushShieldBypassDailySummaryBestEffort()
}

/**
 * Triggers the startup sponsor recommendations summary flush in the background worker.
 */
export function triggerStartupSponsorRecommendationsDailySummary() {
  flushSponsorRecommendationsDailySummaryBestEffort()
}
