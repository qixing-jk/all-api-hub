import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import {
  ACCOUNT_STORAGE_KEYS,
  PRODUCT_ANALYTICS_SESSION_STORAGE_KEYS,
  USER_PREFERENCES_STORAGE_KEYS,
} from "~/services/core/storageKeys"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import { productAnalyticsPreferences } from "~/services/productAnalytics/configuration/preferences"
import { buildAggregateSettingsSnapshotEvent } from "~/services/productAnalytics/configuration/settings"
import { shouldSendSettingsSnapshot } from "~/services/productAnalytics/configuration/settingsSnapshot"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  type ProductAnalyticsEntrypoint,
  type ProductAnalyticsEventName,
} from "~/services/productAnalytics/contracts"
import { buildAutoCheckinConfigSnapshotProperties } from "~/services/productAnalytics/facts/autoCheckin"
import { flushShieldBypassDailySummary } from "~/services/productAnalytics/facts/shieldBypassSummary"
import {
  buildSiteEcosystemAnalyticsEvents,
  shouldSendSiteEcosystemSnapshot,
} from "~/services/productAnalytics/facts/siteEcosystem"
import { flushSponsorRecommendationsDailySummary } from "~/services/productAnalytics/facts/sponsorRecommendationsSummary"
import { productAnalyticsClient } from "~/services/productAnalytics/runtime/client"
import { registerProductAnalyticsBackgroundHandler } from "~/services/productAnalytics/runtime/dispatch"
import {
  onProductAnalyticsMessage,
  ProductAnalyticsMessageTypes,
  type ProductAnalyticsRuntimeResponse,
  type ProductAnalyticsTrackRequest,
} from "~/services/productAnalytics/runtime/messaging"
import { productAnalyticsState } from "~/services/productAnalytics/runtime/state"
import {
  getSessionStorageValues,
  hasStorageChangedListener,
  onStorageChanged,
  setSessionStorageValues,
} from "~/utils/browser/storage"
import { isDevBuild } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ProductAnalyticsRuntime")
const ACCOUNT_CHANGE_SNAPSHOT_DEBOUNCE_MS = 2_000
const PREFERENCES_CHANGE_SNAPSHOT_DEBOUNCE_MS = 2_000
let cleanupAccountChangeListener: (() => void) | null = null
let cleanupPreferencesChangeListener: (() => void) | null = null
let productAnalyticsMessagingCleanup: (() => void)[] | null = null
let autoCheckinConfigSnapshotInFlight = false
let lastAutoCheckinConfigSnapshotFallbackAt: number | undefined

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
 * Checks whether an incoming config snapshot entrypoint is one of the fixed analytics enums.
 */
function isKnownEntrypoint(
  value: unknown,
): value is ProductAnalyticsEntrypoint {
  return (
    typeof value === "string" &&
    Object.values(PRODUCT_ANALYTICS_ENTRYPOINTS).includes(
      value as ProductAnalyticsEntrypoint,
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

  const accounts = await accountQueries.getAllAccounts()
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
 * Captures the Auto Check-in strategy snapshot when analytics is enabled and cadence allows it.
 */
async function captureAutoCheckinConfigSnapshot(
  entrypoint: unknown,
): Promise<boolean> {
  if (!(await productAnalyticsPreferences.isEnabled())) return false
  if (!isKnownEntrypoint(entrypoint)) return false

  const state = await productAnalyticsState.getState()
  const now = Date.now()
  let sessionCapturedAt: number | undefined
  try {
    const values = await getSessionStorageValues(
      PRODUCT_ANALYTICS_SESSION_STORAGE_KEYS.AUTO_CHECKIN_CONFIG_SNAPSHOT_AT,
    )
    const timestamp =
      values[
        PRODUCT_ANALYTICS_SESSION_STORAGE_KEYS.AUTO_CHECKIN_CONFIG_SNAPSHOT_AT
      ]
    if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
      sessionCapturedAt = timestamp
    }
  } catch {
    // Persistent cadence and the current worker's fallback still apply.
  }
  if (
    !shouldSendSettingsSnapshot(state.lastAutoCheckinConfigSnapshotAt, now) ||
    !shouldSendSettingsSnapshot(sessionCapturedAt, now) ||
    !shouldSendSettingsSnapshot(lastAutoCheckinConfigSnapshotFallbackAt, now)
  ) {
    return false
  }

  const preferences = await userPreferences.getPreferences()
  const event = buildAutoCheckinConfigSnapshotProperties(
    preferences.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!,
    entrypoint,
  )

  const captured = await productAnalyticsClient.capture(
    PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
    event,
  )
  if (!captured) return false

  const persisted =
    await productAnalyticsState.setLastAutoCheckinConfigSnapshotAt(now)
  if (!persisted) {
    lastAutoCheckinConfigSnapshotFallbackAt = now
    // Capture already succeeded. Retain its cadence independently of local
    // storage so a write outage does not turn every UI open into another event.
    const savedToSession = await setSessionStorageValues({
      [PRODUCT_ANALYTICS_SESSION_STORAGE_KEYS.AUTO_CHECKIN_CONFIG_SNAPSHOT_AT]:
        now,
    })
    if (!savedToSession) {
      logger.warn(
        "Auto check-in snapshot cooldown could not be saved to session storage",
      )
    }
  }
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
 * Captures a cadence-limited Auto Check-in config snapshot request.
 */
async function handleAutoCheckinConfigSnapshotRequest(
  request: Record<string, unknown>,
) {
  if (autoCheckinConfigSnapshotInFlight) return { success: false }
  autoCheckinConfigSnapshotInFlight = true
  try {
    const success = await captureAutoCheckinConfigSnapshot(request?.entrypoint)
    return { success }
  } finally {
    autoCheckinConfigSnapshotInFlight = false
  }
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
    case ProductAnalyticsMessageTypes.TrackAutoCheckinConfigSnapshot:
      return await handleAutoCheckinConfigSnapshotRequest(
        request as Record<string, unknown>,
      )
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
    onProductAnalyticsMessage(
      ProductAnalyticsMessageTypes.TrackAutoCheckinConfigSnapshot,
      ({ data }) =>
        handleProductAnalyticsMessage(
          ProductAnalyticsMessageTypes.TrackAutoCheckinConfigSnapshot,
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
