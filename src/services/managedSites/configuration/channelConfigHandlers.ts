import {
  normalizeChannelFilters,
  type IncomingChannelFilter,
} from "~/services/managedSites/channelModelFilterRules"
import {
  ChannelConfigMessageTypes,
  onChannelConfigMessage,
  type ChannelConfigGetRequest,
  type ChannelConfigGetResponse,
  type ChannelConfigUpsertFiltersRequest,
  type ChannelConfigUpsertFiltersResponse,
} from "~/services/managedSites/configuration/channelConfigMessaging"
import { isManagedUpstreamResourceRef } from "~/services/managedSites/configuration/channelConfigSnapshot"
import { channelConfigStorage } from "~/services/managedSites/configuration/channelConfigStorage"
import { createRuntimeMessageFailure } from "~/services/runtimeMessaging/result"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

/** Normalizes filter inputs received through the runtime messaging boundary. */
function normalizeFilters(
  filters: Array<IncomingChannelFilter | ChannelModelFilterRule>,
): ChannelModelFilterRule[] {
  return normalizeChannelFilters(filters as IncomingChannelFilter[], {
    idPrefix: "channel-filter",
  })
}

let channelConfigMessagingCleanup: (() => void)[] | null = null

/** Registers channel-config runtime listeners once per background lifetime. */
export function setupChannelConfigMessagingListeners() {
  if (channelConfigMessagingCleanup) {
    return
  }

  channelConfigMessagingCleanup = [
    onChannelConfigMessage(ChannelConfigMessageTypes.Get, ({ data }) =>
      resolveChannelConfigGetMessage(data),
    ),
    onChannelConfigMessage(
      ChannelConfigMessageTypes.UpsertFilters,
      ({ data }) => resolveChannelConfigUpsertFiltersMessage(data),
    ),
  ]
}

/** Resolves a resource-scoped channel-config read message. */
export async function resolveChannelConfigGetMessage(
  request: ChannelConfigGetRequest,
): Promise<ChannelConfigGetResponse> {
  try {
    if (!isManagedUpstreamResourceRef(request.resourceRef)) {
      throw new Error("resourceRef is invalid")
    }

    return {
      success: true,
      data: await channelConfigStorage.getConfig(request.resourceRef),
    }
  } catch (error) {
    logger.error("Message handling failed", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/** Resolves a resource-scoped channel-filter write message. */
export async function resolveChannelConfigUpsertFiltersMessage(
  request: ChannelConfigUpsertFiltersRequest,
): Promise<ChannelConfigUpsertFiltersResponse> {
  try {
    if (!isManagedUpstreamResourceRef(request.resourceRef)) {
      throw new Error("resourceRef is invalid")
    }

    const normalizedFilters = normalizeFilters(request.filters ?? [])
    await channelConfigStorage.upsertFilters(
      request.resourceRef,
      normalizedFilters,
      {
        channelId: request.channelId,
        modelSyncExcluded: request.modelSyncExcluded,
      },
    )
    return { success: true, data: normalizedFilters }
  } catch (error) {
    logger.error("Message handling failed", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

const logger = createLogger("ChannelConfigStorage")
