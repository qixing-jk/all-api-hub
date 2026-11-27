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
import { SnapshotCadence } from "~/services/productAnalytics/runtime/snapshotCadence"
import { productAnalyticsState } from "~/services/productAnalytics/runtime/state"
import { createStorageSnapshotListener } from "~/services/productAnalytics/runtime/storageSnapshotListener"
import { isDevBuild } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ProductAnalyticsRuntime")
let productAnalyticsMessagingCleanup: (() => void)[] | null = null
const settingsCadence = new SnapshotCadence(
  PRODUCT_ANALYTICS_SESSION_STORAGE_KEYS.SETTINGS_SNAPSHOT_AT,
  shouldSendSettingsSnapshot,
)
const ecosystemCadence = new SnapshotCadence(
  PRODUCT_ANALYTICS_SESSION_STORAGE_KEYS.SITE_ECOSYSTEM_SNAPSHOT_AT,
  shouldSendSiteEcosystemSnapshot,
)
const checkinConfigCadence = new SnapshotCadence(
  PRODUCT_ANALYTICS_SESSION_STORAGE_KEYS.AUTO_CHECKIN_CONFIG_SNAPSHOT_AT,
  shouldSendSettingsSnapshot,
)

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

  return ecosystemCadence.capture(
    async () =>
      (await productAnalyticsState.getState()).lastSiteEcosystemSnapshotAt,
    async (now, markPartialCapture) => {
      const accounts = await accountQueries.getAllAccounts()
      for (const event of buildSiteEcosystemAnalyticsEvents(accounts)) {
        if (
          !(await productAnalyticsClient.capture(
            event.eventName,
            event.properties,
          ))
        )
          return false
        markPartialCapture()
      }
      await productAnalyticsState.setLastSiteEcosystemSnapshotAt(now)
      return true
    },
  )
}

/** Captures aggregate settings at the shared snapshot cadence. */
async function captureSettingsSnapshot(): Promise<boolean> {
  if (!(await productAnalyticsPreferences.isEnabled())) return false
  return settingsCadence.capture(
    async () => (await productAnalyticsState.getState()).lastSettingsSnapshotAt,
    async (now) => {
      const preferences = await userPreferences.getPreferences()
      const captured = await productAnalyticsClient.capture(
        PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
        buildAggregateSettingsSnapshotEvent(
          preferences,
          PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        ),
      )
      if (!captured) return false
      await productAnalyticsState.setLastSettingsSnapshotAt(now)
      return true
    },
  )
}

/** Captures the Auto Check-in strategy at the shared snapshot cadence. */
async function captureAutoCheckinConfigSnapshot(
  entrypoint: unknown,
): Promise<boolean> {
  if (!(await productAnalyticsPreferences.isEnabled())) return false
  if (!isKnownEntrypoint(entrypoint)) return false
  return checkinConfigCadence.capture(
    async () =>
      (await productAnalyticsState.getState()).lastAutoCheckinConfigSnapshotAt,
    async (now) => {
      const preferences = await userPreferences.getPreferences()
      const captured = await productAnalyticsClient.capture(
        PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
        buildAutoCheckinConfigSnapshotProperties(
          preferences.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!,
          entrypoint,
        ),
      )
      if (!captured) return false
      await productAnalyticsState.setLastAutoCheckinConfigSnapshotAt(now)
      return true
    },
  )
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
      return { success: await captureSiteEcosystemSnapshot() }
    case ProductAnalyticsMessageTypes.TrackSettingsSnapshot:
      return { success: await captureSettingsSnapshot() }
    case ProductAnalyticsMessageTypes.TrackAutoCheckinConfigSnapshot:
      return {
        success: await captureAutoCheckinConfigSnapshot(
          (request as Record<string, unknown>)?.entrypoint,
        ),
      }
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

/** Keeps optional analytics work from rejecting background lifecycle hooks. */
function runBestEffort(work: Promise<unknown>, message: string) {
  void work.catch((error) => {
    if (isDevBuild()) logger.debug(message, error)
  })
}

/** Watches account changes using an independent debounce and cleanup lifetime. */
export const setupProductAnalyticsAccountChangeListener =
  createStorageSnapshotListener(
    ACCOUNT_STORAGE_KEYS.ACCOUNTS,
    triggerStartupSiteEcosystemSnapshot,
  )

/** Watches preference changes using an independent debounce and cleanup lifetime. */
export const setupProductAnalyticsPreferencesChangeListener =
  createStorageSnapshotListener(
    USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    triggerStartupSettingsSnapshot,
  )

/**
 * Triggers the startup site ecosystem snapshot in the background worker.
 */
export function triggerStartupSiteEcosystemSnapshot() {
  runBestEffort(
    captureSiteEcosystemSnapshot(),
    "Product analytics snapshot failed",
  )
}

/**
 * Triggers the startup settings snapshot in the background worker.
 */
export function triggerStartupSettingsSnapshot() {
  runBestEffort(
    captureSettingsSnapshot(),
    "Product analytics settings snapshot failed",
  )
}

/**
 * Triggers the startup shield-bypass summary flush in the background worker.
 */
export function triggerStartupShieldBypassDailySummary() {
  runBestEffort(
    flushShieldBypassDailySummary(productAnalyticsClient.capture),
    "Product analytics shield bypass summary failed",
  )
}

/**
 * Triggers the startup sponsor recommendations summary flush in the background worker.
 */
export function triggerStartupSponsorRecommendationsDailySummary() {
  runBestEffort(
    flushSponsorRecommendationsDailySummary(productAnalyticsClient.capture),
    "Product analytics sponsor recommendations summary failed",
  )
}
