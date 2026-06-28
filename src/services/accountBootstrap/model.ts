import type { AccountIdentity } from "~/types"

export interface UserInfo {
  id: AccountIdentity
  username: string
  access_token: string | null
}

export interface AccessTokenInfo {
  username: string
  access_token: string
}

export interface SiteStatusInfo {
  price?: number
  stripe_unit_price?: number
  PaymentUSDRate?: number
  system_name?: string
  theme?: string
  /**
   * 是否启用签到功能
   */
  checkin_enabled?: boolean
}
