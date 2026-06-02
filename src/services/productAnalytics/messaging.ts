import { defineExtensionMessaging, type Logger } from "@webext-core/messaging"

import { createLogger } from "~/utils/core/logger"

import type {
  ProductAnalyticsEventName,
  ProductAnalyticsEventPayload,
} from "./events"

export const ProductAnalyticsMessageTypes = {
  TrackEvent: "productAnalytics:trackEvent",
  TrackSiteEcosystemSnapshot: "productAnalytics:trackSiteEcosystemSnapshot",
  TrackSettingsSnapshot: "productAnalytics:trackSettingsSnapshot",
} as const

export type ProductAnalyticsTrackRequest<
  TEventName extends ProductAnalyticsEventName = ProductAnalyticsEventName,
> = {
  eventName: TEventName
  properties: ProductAnalyticsEventPayload<TEventName>
}

export type ProductAnalyticsTrackRequestDiscriminated = {
  [TEventName in ProductAnalyticsEventName]: ProductAnalyticsTrackRequest<TEventName>
}[ProductAnalyticsEventName]

type ProductAnalyticsTrackSiteEcosystemRequest = {
  reason: "startup" | "account_changed" | "manual"
}

type ProductAnalyticsTrackSettingsSnapshotRequest = {
  reason: "startup" | "preferences_changed" | "manual"
}

export type ProductAnalyticsRuntimeResponse = {
  success: boolean
  error?: string
}

interface ProductAnalyticsProtocolMap {
  [ProductAnalyticsMessageTypes.TrackEvent](
    data: ProductAnalyticsTrackRequestDiscriminated,
  ): ProductAnalyticsRuntimeResponse
  [ProductAnalyticsMessageTypes.TrackSiteEcosystemSnapshot](
    data: ProductAnalyticsTrackSiteEcosystemRequest,
  ): ProductAnalyticsRuntimeResponse
  [ProductAnalyticsMessageTypes.TrackSettingsSnapshot](
    data: ProductAnalyticsTrackSettingsSnapshotRequest,
  ): ProductAnalyticsRuntimeResponse
}

/**
 * Creates a messaging logger that avoids forwarding analytics payload details.
 */
function createProductAnalyticsMessagingLogger(): Logger {
  const logger = createLogger("ProductAnalyticsMessaging")
  const toMessage = (message: unknown) =>
    typeof message === "string" ? message : String(message)

  return {
    debug: (message: unknown) => {
      logger.debug(toMessage(message))
    },
    log: (message: unknown) => {
      logger.info(toMessage(message))
    },
    warn: (message: unknown) => {
      logger.warn(toMessage(message))
    },
    error: (message: unknown) => {
      logger.error(toMessage(message))
    },
  }
}

export const {
  sendMessage: sendProductAnalyticsMessage,
  onMessage: onProductAnalyticsMessage,
} = defineExtensionMessaging<ProductAnalyticsProtocolMap>({
  logger: createProductAnalyticsMessagingLogger(),
})
