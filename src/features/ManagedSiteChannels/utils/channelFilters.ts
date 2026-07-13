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

export type ChannelFilterStorageIdentity =
  | number
  | {
      channelId: number
      resourceRef?: ManagedUpstreamResourceRef
    }
  | {
      channelId?: number
      resourceRef: ManagedUpstreamResourceRef
    }

/**
 * Normalizes legacy numeric ids and resource-aware identities into requests.
 */
function toChannelFilterRequest(identity: ChannelFilterStorageIdentity) {
  return typeof identity === "number" ? { channelId: identity } : identity
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
  const request = toChannelFilterRequest(identity)

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
    const config = request.resourceRef
      ? await channelConfigStorage.getConfigByResourceRef(
          request.resourceRef,
          request.channelId,
        )
      : await channelConfigStorage.getConfig(request.channelId!)
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
  const request = toChannelFilterRequest(identity)

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
    const success = request.resourceRef
      ? await channelConfigStorage.upsertResourceFilters(
          request.resourceRef,
          filters,
          request.channelId,
        )
      : await channelConfigStorage.upsertFilters(request.channelId!, filters)
    if (!success) {
      throw new Error("Failed to persist filters locally")
    }
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
