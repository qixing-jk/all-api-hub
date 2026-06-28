import type { ApiToken } from "~/types"

export interface UserGroupInfo {
  desc: string
  ratio: number
}

export interface CreateTokenRequest {
  name: string
  remain_quota: number
  expired_time: number
  unlimited_quota: boolean
  model_limits_enabled: boolean
  model_limits: string
  allow_ips: string
  group: string
}

export type CreateTokenResult = boolean | ApiToken

export interface PaginatedTokenResponse {
  page: number
  page_size: number
  total: number
  items: ApiToken[]
}
