import {
  ChannelConfigMessageTypes,
  sendChannelConfigMessage,
} from "~/services/managedSites/configuration/channelConfigMessaging"
import { channelConfigStorage } from "~/services/managedSites/configuration/channelConfigStorage"
import { getRuntimeMessageFailureMessage } from "~/services/runtimeMessaging/result"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import type { ManagedUpstreamResourceRef } from "~/types/managedUpstreamResource"
import { isMessageReceiverUnavailableError } from "~/utils/browser/runtimeMessages"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to channel filter load/save helpers in the options UI.
 */
const logger = createLogger("ChannelFilters")

export type ChannelFilterStorageIdentity = {
  channelId?: number
  resourceRef: ManagedUpstreamResourceRef
}

type ChannelFilterSettings = {
  filters: ChannelModelFilterRule[]
  modelSyncExcluded: boolean
}

/**
 * Load rules and sync participation from the same channel configuration.
 *
 * 1. Prefer the background runtime handler (`channelConfig:get`) so the
 *    authoritative storage inside the extension context is used.
 * 2. When the options page is running outside the extension (e.g. dev server)
 *    the runtime call fails—fall back to reading `channelConfigStorage`
 *    locally so editing is still possible.
 */
export async function fetchChannelFilterSettings(
  identity: ChannelFilterStorageIdentity,
): Promise<ChannelFilterSettings> {
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
    return {
      filters: config.modelFilterSettings?.rules ?? [],
      modelSyncExcluded: config.modelSyncExcluded === true,
    }
  }

  if (response.success) {
    return {
      filters: response.data?.modelFilterSettings?.rules ?? [],
      modelSyncExcluded: response.data?.modelSyncExcluded === true,
    }
  }

  throw new Error(
    getRuntimeMessageFailureMessage(response, "Failed to load channel filters"),
  )
}

/**
 * Persist rules and any explicit sync participation change in one transaction.
 *
 * Tries to update via runtime messaging first so the background copy stays in
 * sync. If messaging is unavailable, we optimistically persist through the
 * local `channelConfigStorage` as a best-effort fallback.
 */
export async function saveChannelFilters(
  identity: ChannelFilterStorageIdentity,
  filters: ChannelModelFilterRule[],
  options: { modelSyncExcluded?: boolean } = {},
): Promise<void> {
  let response: Awaited<ReturnType<typeof sendChannelConfigMessage>>
  const request = identity

  try {
    response = await sendChannelConfigMessage(
      ChannelConfigMessageTypes.UpsertFilters,
      { ...request, filters, ...options },
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
    await channelConfigStorage.upsertFilters(request.resourceRef, filters, {
      channelId: request.channelId,
      ...options,
    })
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
