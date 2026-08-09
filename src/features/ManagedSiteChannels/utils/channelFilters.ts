import {
  ChannelConfigMessageTypes,
  sendChannelConfigMessage,
} from "~/services/managedSites/channelConfigMessaging"
import { channelConfigStorage } from "~/services/managedSites/channelConfigStorage"
import { getRuntimeMessageFailureMessage } from "~/services/runtimeMessaging/result"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import type { ManagedUpstreamResourceRef } from "~/types/managedUpstreamResource"
import { isMessageReceiverUnavailableError } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to channel filter load/save helpers in the options UI.
 */
const logger = createLogger("ChannelFilters")

export type ChannelFilterStorageIdentity = {
  channelId?: number
  resourceRef: ManagedUpstreamResourceRef
}

/**
 * Load channel filter rules for the given channel.
 *
 * 1. Prefer the background runtime handler (`channelConfig:get`) so the
 *    authoritative storage inside the extension context is used.
 * 2. When the options page is running outside the extension (e.g. dev server)
 *    the runtime call fails—fall back to reading `channelConfigStorage`
 *    locally so editing is still possible.
 */
export async function fetchChannelFilters(
  identity: ChannelFilterStorageIdentity,
): Promise<ChannelModelFilterRule[]> {
  let response: Awaited<ReturnType<typeof sendChannelConfigMessage>>
  const request = identity

  try {
    response = await sendChannelConfigMessage(ChannelConfigMessageTypes.Get, {
      ...request,
    })
  } catch (runtimeError) {
    if (!isMessageReceiverUnavailableError(runtimeError)) {
      throw runtimeError
    }

    logger.warn("Runtime fetch failed for channel, using fallback storage", {
      channelId: request.channelId,
      resourceRef: request.resourceRef,
      error: runtimeError,
    })
    const config = await channelConfigStorage.getConfig(request.resourceRef)
    return config.modelFilterSettings?.rules ?? []
  }

  if (response.success) {
    return response.data?.modelFilterSettings?.rules ?? []
  }

  throw new Error(
    getRuntimeMessageFailureMessage(response, "Failed to load channel filters"),
  )
}

/**
 * Persist channel filter rules for the given channel.
 *
 * Tries to update via runtime messaging first so the background copy stays in
 * sync. If messaging is unavailable, we optimistically persist through the
 * local `channelConfigStorage` as a best-effort fallback.
 */
export async function saveChannelFilters(
  identity: ChannelFilterStorageIdentity,
  filters: ChannelModelFilterRule[],
): Promise<void> {
  let response: Awaited<ReturnType<typeof sendChannelConfigMessage>>
  const request = identity

  try {
    response = await sendChannelConfigMessage(
      ChannelConfigMessageTypes.UpsertFilters,
      { ...request, filters },
    )
  } catch (runtimeError) {
    if (!isMessageReceiverUnavailableError(runtimeError)) {
      throw runtimeError
    }

    logger.warn("Runtime save failed for channel, persisting locally", {
      channelId: request.channelId,
      resourceRef: request.resourceRef,
      error: runtimeError,
    })
    await channelConfigStorage.upsertFilters(
      request.resourceRef,
      filters,
      request.channelId,
    )
    return
  }

  if (!response.success) {
    throw new Error(
      getRuntimeMessageFailureMessage(
        response,
        "Failed to save channel filters",
      ),
    )
  }
}
