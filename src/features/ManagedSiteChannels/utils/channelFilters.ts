import {
  ChannelConfigMessageTypes,
  sendChannelConfigMessage,
} from "~/services/managedSites/channelConfigMessaging"
import { channelConfigStorage } from "~/services/managedSites/channelConfigStorage"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import { isMessageReceiverUnavailableError } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to channel filter load/save helpers in the options UI.
 */
const logger = createLogger("ChannelFilters")

/**
 * Builds an error from an explicit runtime failure while preserving local copy.
 */
function createRuntimeResponseError(
  fallbackMessage: string,
  error?: string,
): Error {
  return new Error(error?.trim() || fallbackMessage)
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
  channelId: number,
): Promise<ChannelModelFilterRule[]> {
  try {
    const response = await sendChannelConfigMessage(
      ChannelConfigMessageTypes.Get,
      { channelId },
    )
    if (response?.success) {
      return response.data?.modelFilterSettings?.rules ?? []
    }
    if (response?.success === false) {
      throw createRuntimeResponseError(
        "Failed to load channel filters",
        response.error,
      )
    }
    throw new Error("Failed to load channel filters")
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
  try {
    const response = await sendChannelConfigMessage(
      ChannelConfigMessageTypes.UpsertFilters,
      { channelId, filters },
    )
    if (response?.success !== true) {
      if (response?.success === false) {
        throw createRuntimeResponseError(
          "Failed to save channel filters",
          response.error,
        )
      }
      throw new Error("Failed to save channel filters")
    }
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
  }
}
