/**
 * ManagedSiteChannel 的站点增强复合类型。
 * 用于在通用渠道字段基础上附加站点原始数据，例如 _octopusData 或 _axonHubData。
 */
import type { AxonHubChannel } from "./axonHub"
import type { NewApiChannel } from "./newApi"
import type { OctopusChannel } from "./octopus"

export { CHANNEL_MODE, CHANNEL_STATUS } from "./newApi"

export type {
  ChannelDefaults,
  ChannelFormData,
  ChannelMode,
  ChannelModel,
  ChannelGroup,
  ChannelStatus,
  CreateChannelPayload,
  UpdateChannelPayload,
  NewApiChannelListData,
} from "./newApi"

export type {
  NewApiChannel as ManagedSiteChannel,
  NewApiChannelListData as ManagedSiteChannelListData,
} from "./newApi"

export type OctopusChannelWithData = NewApiChannel & {
  /** 原始 Octopus 渠道数据 (必填) */
  _octopusData: OctopusChannel
}

export type AxonHubChannelWithData = NewApiChannel & {
  /** Raw AxonHub GraphQL channel data. */
  _axonHubData: AxonHubChannel
}
