import {
  ChannelConfigMessageTypes,
  sendChannelConfigMessage,
} from "~/services/managedSites/channelConfigMessaging"
import { channelConfigStorage } from "~/services/managedSites/channelConfigStorage"
import { getRuntimeMessageFailureMessage } from "~/services/runtimeMessaging/result"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import { isMessageReceiverUnavailableError } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to channel filter load/save helpers in the options UI.
 */
const logger = createLogger("ChannelFilters")

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
  channelId: number,
): Promise<ChannelModelFilterRule[]> {
  let response: Awaited<ReturnType<typeof sendChannelConfigMessage>>

  try {
    response = await sendChannelConfigMessage(ChannelConfigMessageTypes.Get, {
      channelId,
    })
  } catch (runtimeError) {
    if (!isMessageReceiverUnavailableError(runtimeError)) {
      throw runtimeError
    }

    logger.warn("Runtime fetch failed for channel, using fallback storage", {
      channelId,
      error: runtimeError,
    })
    const config = await channelConfigStorage.getConfig(channelId)
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
  channelId: number,
  filters: ChannelModelFilterRule[],
): Promise<void> {
  let response: Awaited<ReturnType<typeof sendChannelConfigMessage>>

  try {
    response = await sendChannelConfigMessage(
      ChannelConfigMessageTypes.UpsertFilters,
      { channelId, filters },
    )
  } catch (runtimeError) {
    if (!isMessageReceiverUnavailableError(runtimeError)) {
      throw runtimeError
    }

    logger.warn("Runtime save failed for channel, persisting locally", {
      channelId,
      error: runtimeError,
    })
    const success = await channelConfigStorage.upsertFilters(channelId, filters)
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
