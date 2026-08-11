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

export interface OneHubUserGroupMap {
  [key: string]: {
    id: number
    symbol: string
    name: string
    ratio: number
  }
}
