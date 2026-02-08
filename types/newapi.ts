import { ChannelType } from "~/constants"

import type { OctopusOutboundType } from "./octopus"

/**
 * Group data from New API
 */
export interface ChannelGroup {
  id: string
  name: string
}

/**
 * Model data from New API or model suggestion
 */
export interface ChannelModel {
  id: string
  name: string
  provider?: string
  description?: string
  tags?: string[]
}

/**
 * Channel status constants
 * @see https://github.com/QuantumNous/new-api/blob/7156bf238276d2089435eacc3efb266403f27c8e/common/constants.go#L192
 */
export const CHANNEL_STATUS = {
  Unknown: 0,
  Enable: 1,
  ManuallyDisabled: 2,
  AutoDisabled: 3,
} as const

export type ChannelStatus = (typeof CHANNEL_STATUS)[keyof typeof CHANNEL_STATUS]

/**
 * Channel mode constants
 */
export const CHANNEL_MODE = {
  SINGLE: "single",
  BATCH: "batch",
} as const

export type ChannelMode = (typeof CHANNEL_MODE)[keyof typeof CHANNEL_MODE]

/**
 * Channel default field values
 */
export interface ChannelDefaults {
  mode: ChannelMode
  status: ChannelStatus
  priority: number
  weight: number
  groups: string[]
  models: string[]
  type: ChannelType
}

/**
 * Channel creation/edit form data
 */
export interface ChannelFormData {
  name: string
  type: ChannelType | OctopusOutboundType
  key: string
  base_url: string
  models: string[]
  groups: string[]
  priority: number
  weight: number
  status: ChannelStatus
}

/**
 * Channel creation payload for New API
 */
export interface CreateChannelPayload {
  mode: ChannelMode
  channel: Omit<UpdateChannelPayload, "id"> & {
    status: ChannelStatus
  }
}

/**
 * Channel edition payload for New API
 */
export interface UpdateChannelPayload {
  /**
   * 渠道ID
   */
  id: number
  type?: ChannelType | OctopusOutboundType
  max_input_tokens?: number
  other?: string
  models?: string
  auto_ban?: number
  /**
   * 渠道可用用户分组
   * 其实就是groups.join(",")而来，但现行API只认这个不认groups
   */
  group?: string
  groups?: string[]
  priority?: number
  weight?: number
  settings?: string
  name?: string
  base_url?: string
  model_mapping?: string
  status_code_mapping?: string
  setting?: string
  openai_organization?: string | null
  test_model?: string | null
  tag?: string | null
  param_override?: any | null
  header_override?: any | null
  remark?: string | null
  key?: string
  /**
   * 多密钥模式下专用
   * @see https://github.com/QuantumNous/new-api/blob/7156bf238276d2089435eacc3efb266403f27c8e/controller/channel.go#L769
   */
  key_mode?: string
  multi_key_mode?: string
}

export interface ChannelInfo {
  is_multi_key: boolean
  multi_key_size: number
  multi_key_status_list: any[] | null
  multi_key_polling_index: number
  multi_key_mode: string
}

/**
 * New API Channel data
 * 获取 Channel 的 info 时使用的数据结构。
 */
export interface NewApiChannel {
  id: number
  type: ChannelType
  /**
   * 渠道key
   * 通常从接口获取时该字段可能为空字符串。
   */
  key: string
  name: string
  /**
   * 渠道API基础地址
   */
  base_url: string
  /**
   * 模型列表，逗号分隔的字符串
   * @example "gpt-3.5-turbo,gpt-4"
   */
  models: string
  status: ChannelStatus
  /**
   * 渠道权重
   */
  weight: number
  /**
   * 渠道优先级
   */
  priority: number
  openai_organization: string | null
  /**
   * 测试模型名称
   */
  test_model: string | null
  /**
   * 创建时间戳
   * 使用 Unix 时间戳（秒）。
   */
  created_time: number
  test_time: number
  response_time: number
  other: string
  balance: number
  balance_updated_time: number
  /**
   * 可用用户分组，逗号分隔的字符串
   * @example  "default,group1"
   */
  group: string
  used_quota: number
  // 原为 JSON 字符串，可 parse 为对象：Record<string,string>
  model_mapping: string
  // 原为 JSON 字符串，可 parse 为对象：Record<string,string>
  status_code_mapping: string
  auto_ban: number
  // 原为 JSON 字符串 (含 status_reason 等)，可 parse 为对象
  other_info: string
  tag: string | null
  param_override: any | null
  header_override: any | null
  remark: string | null
  channel_info: ChannelInfo
  // 原为 JSON 字符串，可 parse 为对象
  setting: string
  // 原为 JSON 字符串，可 parse 为对象
  settings: string
}

/**
 * All New API Channel data
 */
export interface NewApiChannelListData {
  items: NewApiChannel[]
  total: number
  type_counts: Record<string, number>
}
