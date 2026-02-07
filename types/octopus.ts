/**
 * Octopus 渠道类型枚举
 * 对应 Octopus 后端的 OutboundType
 */
export enum OctopusOutboundType {
  /** OpenAI 聊天补全 API */
  OpenAIChat = 0,
  /** OpenAI 响应模式 */
  OpenAIResponse = 1,
  /** Anthropic (Claude) API */
  Anthropic = 2,
  /** Google Gemini API */
  Gemini = 3,
  /** 火山引擎 API */
  Volcengine = 4,
  /** OpenAI 嵌入 API */
  OpenAIEmbedding = 5,
}

/**
 * Octopus 自动分组类型枚举
 */
export enum OctopusAutoGroupType {
  /** 不自动分组 */
  None = 0,
  /** 模糊匹配 */
  Fuzzy = 1,
  /** 精确匹配 */
  Exact = 2,
  /** 正则匹配 */
  Regex = 3,
}

/**
 * Octopus 渠道密钥
 */
export interface OctopusChannelKey {
  /** 密钥唯一标识符 */
  id?: number
  /** 所属渠道 ID */
  channel_id?: number
  /** 是否启用 */
  enabled: boolean
  /** API 密钥值 */
  channel_key: string
  /** 备注信息 */
  remark?: string
  /** 最后响应状态码 */
  status_code?: number
  /** 最后使用时间戳 (Unix 秒) */
  last_use_time_stamp?: number
  /** 累计消费金额 */
  total_cost?: number
}

/**
 * Octopus Base URL 对象
 */
export interface OctopusBaseUrl {
  /** API 基础地址 */
  url: string
  /** 延迟 (毫秒)，用于负载均衡选择 */
  delay?: number
}

/**
 * Octopus 自定义请求头
 */
export interface OctopusCustomHeader {
  /** 请求头名称 */
  header_key: string
  /** 请求头值 */
  header_value: string
}

/**
 * Octopus 渠道统计信息
 */
export interface OctopusChannelStats {
  /** 渠道 ID */
  channel_id: number
  /** 输入 token 总数 */
  input_token: number
  /** 输出 token 总数 */
  output_token: number
  /** 输入消费金额 */
  input_cost: number
  /** 输出消费金额 */
  output_cost: number
  /** 累计等待时间 */
  wait_time: number
  /** 成功请求数 */
  request_success: number
  /** 失败请求数 */
  request_failed: number
}

/**
 * Octopus 渠道完整对象
 */
export interface OctopusChannel {
  /** 渠道唯一标识符 */
  id: number
  /** 渠道名称 */
  name: string
  /** 渠道类型 */
  type: OctopusOutboundType
  /** 是否启用 */
  enabled: boolean
  /** 基础 URL 列表 */
  base_urls: OctopusBaseUrl[]
  /** API 密钥列表 */
  keys: OctopusChannelKey[]
  /** 支持的模型列表 (逗号分隔) */
  model: string
  /** 自定义模型列表 (逗号分隔) */
  custom_model?: string
  /** 是否使用代理 */
  proxy: boolean
  /** 是否自动同步模型 */
  auto_sync: boolean
  /** 自动分组类型 */
  auto_group: OctopusAutoGroupType
  /** 自定义请求头列表 */
  custom_header?: OctopusCustomHeader[]
  /** 参数覆盖配置 */
  param_override?: string
  /** 渠道专用代理地址 */
  channel_proxy?: string
  /** 模型匹配正则表达式 */
  match_regex?: string
  /** 渠道统计信息 */
  stats?: OctopusChannelStats
}

/**
 * 创建渠道请求
 */
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

/**
 * 密钥添加请求
 */
export interface OctopusKeyAddRequest {
  /** 是否启用 */
  enabled?: boolean
  /** API 密钥值 */
  channel_key: string
  /** 备注信息 */
  remark?: string
}

/**
 * 密钥更新请求
 */
export interface OctopusKeyUpdateRequest {
  /** 要更新的密钥 ID */
  id: number
  /** 是否启用 */
  enabled?: boolean
  /** 新的 API 密钥值 */
  channel_key?: string
  /** 新的备注信息 */
  remark?: string
}

/**
 * 更新渠道请求
 */
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

/**
 * 获取上游模型列表请求
 */
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

/**
 * Octopus API 通用响应格式
 */
export interface OctopusApiResponse<T = unknown> {
  /** 是否成功 */
  success: boolean
  /** 响应数据 */
  data?: T
  /** 错误消息 */
  message?: string
}

/**
 * Octopus 登录响应
 */
export interface OctopusLoginResponse {
  /** JWT Token */
  token: string
  /** Token 过期时间 */
  expire_at: string
}
