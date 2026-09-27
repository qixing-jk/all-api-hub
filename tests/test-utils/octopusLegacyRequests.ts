import type {
  OctopusAutoGroupType,
  OctopusBaseUrl,
  OctopusChannelKey,
  OctopusCustomHeader,
  OctopusKeyAddRequest,
  OctopusKeyUpdateRequest,
  OctopusOutboundType,
} from "~/types/octopus"

/** Legacy request fixtures used to verify both Octopus codecs. */
export interface OctopusCreateChannelRequest {
  /** 渠道名称 (必须唯一) */
  name: string
  /** 渠道类型 */
  type: OctopusOutboundType
  /** 是否启用 (默认 true) */
  enabled?: boolean
  /** 基础 URL 列表 */
  base_urls: OctopusBaseUrl[]
  /** API 密钥列表 */
  keys: OctopusChannelKey[]
  /** 支持的模型列表 */
  model?: string
  /** 自定义模型列表 */
  custom_model?: string
  /** 是否使用代理 */
  proxy?: boolean
  /** 是否自动同步 */
  auto_sync?: boolean
  /** 自动分组类型 */
  auto_group?: OctopusAutoGroupType
  /** 自定义请求头 */
  custom_header?: OctopusCustomHeader[]
  /** 参数覆盖配置 */
  param_override?: string
  /** 渠道专用代理 */
  channel_proxy?: string
  /** 模型匹配正则 */
  match_regex?: string
}

export interface OctopusUpdateChannelRequest {
  /** 要更新的渠道 ID (必填) */
  id: number
  /** 新名称 */
  name?: string
  /** 新渠道类型 */
  type?: OctopusOutboundType
  /** 是否启用 */
  enabled?: boolean
  /** 新的基础 URL 列表 */
  base_urls?: OctopusBaseUrl[]
  /** 新的模型列表 */
  model?: string
  /** 新的自定义模型列表 */
  custom_model?: string
  /** 是否使用代理 */
  proxy?: boolean
  /** 是否自动同步 */
  auto_sync?: boolean
  /** 自动分组类型 */
  auto_group?: OctopusAutoGroupType
  /** 自定义请求头 */
  custom_header?: OctopusCustomHeader[]
  /** 渠道专用代理 */
  channel_proxy?: string
  /** 参数覆盖配置 */
  param_override?: string
  /** 模型匹配正则 */
  match_regex?: string
  /** 要添加的新密钥列表 */
  keys_to_add?: OctopusKeyAddRequest[]
  /** 要更新的密钥列表 */
  keys_to_update?: OctopusKeyUpdateRequest[]
  /** 要删除的密钥 ID 列表 */
  keys_to_delete?: number[]
}

export interface OctopusFetchModelRequest {
  /** 渠道类型 */
  type: OctopusOutboundType
  /** 基础 URL 列表 */
  base_urls: OctopusBaseUrl[]
  /** API 密钥列表 */
  keys: OctopusChannelKey[]
  /** 是否使用代理 */
  proxy?: boolean
}
