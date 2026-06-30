import { isExtensionBackground } from "~/utils/browser"
import { createLogger } from "~/utils/core/logger"

import type {
  ProductAnalyticsEventName,
  ProductAnalyticsEventPayload,
} from "./contracts"
import {
  ProductAnalyticsMessageTypes,
  sendProductAnalyticsMessage,
  type ProductAnalyticsRuntimeResponse,
  type ProductAnalyticsTrackRequest,
  type ProductAnalyticsTrackRequestDiscriminated,
} from "./messaging"

const logger = createLogger("ProductAnalyticsEvents")

type ProductAnalyticsBackgroundTrackHandler = (
  type: typeof ProductAnalyticsMessageTypes.TrackEvent,
  request: ProductAnalyticsTrackRequestDiscriminated,
) => Promise<ProductAnalyticsRuntimeResponse> | ProductAnalyticsRuntimeResponse

let backgroundTrackHandler: ProductAnalyticsBackgroundTrackHandler | null = null

/**
 * Registers the background runtime handler used when analytics is emitted from the background context.
 */
export function registerProductAnalyticsBackgroundHandler(
  handler: ProductAnalyticsBackgroundTrackHandler,
): () => void {
  backgroundTrackHandler = handler

  return () => {
    if (backgroundTrackHandler === handler) {
      backgroundTrackHandler = null
    }
  }
}

/**
 * Logs rejected best-effort analytics dispatches without surfacing failures to product flows.
 */
function handleDispatchResponse(
  response: ProductAnalyticsRuntimeResponse | undefined | null,
): void {
  if (response?.success === false) {
    logger.warn("Product analytics event dispatch was rejected")
  }
}

/**
 * Dispatches directly to the registered runtime handler when the background module is already loaded.
 */
function dispatchWithRegisteredBackgroundHandler(
  request: ProductAnalyticsTrackRequestDiscriminated,
): boolean {
  if (!backgroundTrackHandler) {
    return false
  }

  void Promise.resolve(
    backgroundTrackHandler(ProductAnalyticsMessageTypes.TrackEvent, request),
  )
    .then(handleDispatchResponse)
    .catch((error) => {
      logger.warn("Product analytics event dispatch failed", error)
    })

  return true
}

/**
 * Sends analytics through extension messaging for UI and fallback background contexts.
 */
function dispatchWithRuntimeMessage(
  request: ProductAnalyticsTrackRequestDiscriminated,
): void {
  void Promise.resolve(
    sendProductAnalyticsMessage(
      ProductAnalyticsMessageTypes.TrackEvent,
      request,
    ),
  )
    .then(handleDispatchResponse)
    .catch((error) => {
      logger.warn("Product analytics event dispatch failed", error)
    })
}

/**
 * Sends a typed product analytics event to the background runtime handler.
 * Telemetry dispatch is best-effort and must not block product flows.
 */
export async function trackProductAnalyticsEvent<
  TEventName extends ProductAnalyticsEventName,
>(
  eventName: TEventName,
  properties: ProductAnalyticsEventPayload<TEventName>,
): Promise<boolean> {
  try {
    const request = {
      eventName,
      properties,
    } satisfies ProductAnalyticsTrackRequest<TEventName>

    const discriminatedRequest =
      request as ProductAnalyticsTrackRequestDiscriminated

    if (
      isExtensionBackground() &&
      dispatchWithRegisteredBackgroundHandler(discriminatedRequest)
    ) {
      return true
    }

    dispatchWithRuntimeMessage(discriminatedRequest)
    return true
  } catch (error) {
    logger.warn("Product analytics event dispatch failed", error)
    return false
  }
}
