/**
 * Octopus 渠道与 ManagedSiteChannel 的复合类型
 * 用于在 ManagedSiteChannel 基础上附加原始 Octopus 渠道数据
 *
 * 注意：此类型扩展 ManagedSiteChannel 的所有字段，并添加必填的 _octopusData 字段
 */
import type { NewApiChannel } from "./newapi"
import type { OctopusChannel } from "./octopus"

export { CHANNEL_MODE, CHANNEL_STATUS } from "./newapi"

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
} from "./newapi"

export type {
  NewApiChannel as ManagedSiteChannel,
  NewApiChannelListData as ManagedSiteChannelListData,
} from "./newapi"

export type OctopusChannelWithData = NewApiChannel & {
  /** 原始 Octopus 渠道数据 (必填) */
  _octopusData: OctopusChannel
}
