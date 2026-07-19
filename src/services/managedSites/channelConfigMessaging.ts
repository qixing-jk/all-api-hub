import { defineExtensionMessaging } from "~/services/runtimeMessaging/extensionMessaging"
import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"
import type {
  ChannelConfig,
  ChannelResourceConfig,
} from "~/types/channelConfig"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import type { ManagedUpstreamResourceRef } from "~/types/managedUpstreamResource"

import type { IncomingChannelFilter } from "./channelModelFilterRules"

export const ChannelConfigMessageTypes = {
  Get: "channelConfig:get",
  UpsertFilters: "channelConfig:upsertFilters",
} as const

export interface ChannelConfigGetRequest {
  channelId?: number
  resourceRef?: ManagedUpstreamResourceRef
}

export interface ChannelConfigUpsertFiltersRequest {
  channelId?: number
  resourceRef?: ManagedUpstreamResourceRef
  filters: Array<IncomingChannelFilter | ChannelModelFilterRule>
}

export type ChannelConfigGetResponse = RuntimeMessageResponse<
  ChannelConfig | ChannelResourceConfig
>
export type ChannelConfigUpsertFiltersResponse = RuntimeMessageResponse<
  ChannelModelFilterRule[]
>

interface ChannelConfigProtocolMap {
  [ChannelConfigMessageTypes.Get](
    data: ChannelConfigGetRequest,
  ): ChannelConfigGetResponse
  [ChannelConfigMessageTypes.UpsertFilters](
    data: ChannelConfigUpsertFiltersRequest,
  ): ChannelConfigUpsertFiltersResponse
}

export const {
  sendMessage: sendChannelConfigMessage,
  onMessage: onChannelConfigMessage,
} = defineExtensionMessaging<ChannelConfigProtocolMap>({
  logger: createRuntimeMessagingLogger("ChannelConfigMessaging"),
})
