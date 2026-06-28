/**
 * Usage log item types.
 * @see https://github.com/QuantumNous/new-api/blob/8ef99f472875ceeaf20aecb2bb0f2b33ff575feb/model/log.go#L43
 */
export enum LogType {
  /** 所有 */
  All = 0,
  /** 充值 */
  Topup = 1,
  /** 消费 */
  Consume = 2,
  /** 管理 */
  Manage = 3,
  /** 系统 */
  System = 4,
  /** 错误 */
  Error = 5,
  /** Refund */
  Refund = 6,
}

/**
 * Usage log item.
 * @see https://github.com/QuantumNous/new-api/blob/aa35d8db69b50d6401550bd34b6f37ef5863acd0/model/log.go#L20
 */
export interface LogItem {
  id: number
  user_id: number
  created_at: number
  /**
   * 日志类型
   * @see LogType
   */
  type: LogType
  /**
   * 系统消息内容，说明文字
   * @example
   * 签到奖励 ＄10.586246 额度
   * 通过兑换码充值 ＄0.200000 额度，兑换码ID 1
   */
  content: string
  username: string
  token_name: string
  model_name: string
  /**
   * 额度变动
   */
  quota: number
  prompt_tokens: number
  completion_tokens: number
  use_time: number
  is_stream: boolean
  channel_id: number
  channel_name: string
  token_id: number
  group: string
  ip: string
  other: string // JSON 字符串，可以进一步解析为对象
}

export interface LogResponseData {
  items: LogItem[]
  total: number
}

export interface LogStatResponseData {
  quota?: number
  rpm?: number
  tpm?: number
}

export interface TodayLogQueryConfig {
  endpoint?: string
  pageParamName?: string
  pageSizeParamName?: string
  logTypeParamName?: string
  itemsField?: "items" | "data"
  totalField?: "total" | "total_count"
  includeGroupParam?: boolean
  extraParams?: Record<string, string>
}
