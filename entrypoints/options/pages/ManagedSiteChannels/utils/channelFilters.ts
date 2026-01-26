import { RuntimeActionIds } from "~/constants/runtimeActions"
import { channelConfigStorage } from "~/services/channelConfigStorage"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import { sendRuntimeMessage } from "~/utils/browserApi"

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
    const response = await sendRuntimeMessage({
      action: RuntimeActionIds.ChannelConfigGet,
      channelId,
    })
    if (response?.success) {
      return response.data?.modelFilterSettings?.rules ?? []
    }
    throw new Error(response?.error || "Failed to load channel filters")
  } catch (runtimeError) {
    console.warn(
      `[ChannelFilters] Runtime fetch failed for channel ${channelId}, using fallback storage`,
      runtimeError,
    )
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
    const response = await sendRuntimeMessage({
      action: RuntimeActionIds.ChannelConfigUpsertFilters,
      channelId,
      filters,
    })
    if (!response?.success) {
      throw new Error(response?.error || "Failed to save channel filters")
    }
  } catch (runtimeError) {
    console.warn(
      `[ChannelFilters] Runtime save failed for channel ${channelId}, persisting locally`,
      runtimeError,
    )
    const success = await channelConfigStorage.upsertFilters(channelId, filters)
    if (!success) {
      throw new Error("Failed to persist filters locally")
    }
  }
}
