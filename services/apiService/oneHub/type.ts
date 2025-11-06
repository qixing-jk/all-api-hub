// 站点的token 密钥信息(API 密钥)
interface ApiToken {
  id: number
  user_id: number
  key: string
  status: number
  name: string
  created_time: number
  accessed_time: number
  expired_time: number
  remain_quota: number
  unlimited_quota: boolean
  used_quota: number
  group?: string

  setting?: {
    heartbeat?: {
      enabled: boolean
      timeout_seconds: number
    }
  }
}

export interface PaginatedTokenDate {
  data: ApiToken[]
  page: number
  size: number
  total_count: number
}

// 分页令牌响应类型
export interface PaginatedTokenResponse {
  data: PaginatedTokenDate
  message: string
  success: boolean
}

export type OneHubUserGroupInfo = {
  id: number
  symbol: string
  name: string
  ratio: number
  api_rate: number
  public: boolean
  promotion: boolean
  min: number
  max: number
  enable: boolean
}

// 分组响应类型
export interface OneHubUserGroupsResponse {
  data: Record<string, OneHubUserGroupInfo>
  message: string
  success: boolean
}

export type OneHubModelPricing = Record<string, OneHubModelPricingItem>

export interface OneHubModelPricingItem {
  groups: string[]
  owned_by: string
  price: {
    model: string
    type: "tokens" | "times"
    channel_type: number
    input: number
    output: number
    locked: boolean
    extra_ratios?: Record<string, number>
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface OneHubVendor {
  id: number
  name: string
  icon?: string
}

export interface OneHubUserGroupMap {
  [key: string]: {
    id: number
    symbol: string
    name: string
    ratio: number
  }
}
