/** New API-family wire data. Keep protocol fields inside the provider seam. */
export interface NewApiToken {
  id: number
  user_id: number
  key: string
  status: number
  name: string
  note?: string
  created_time: number
  accessed_time: number
  expired_time: number
  remain_quota: number
  unlimited_quota: boolean
  model_limits_enabled?: boolean
  model_limits?: string
  models?: string
  allow_ips?: string
  used_quota: number
  group?: string
  cross_group_retry?: boolean
  auto_groups?: string[] | null
  DeletedAt?: null
}

/** Fields consumed by New API's create/update token endpoint. */
export interface NewApiTokenWrite {
  name: string
  remain_quota: number
  expired_time: number
  unlimited_quota: boolean
  model_limits_enabled: boolean
  model_limits: string
  allow_ips: string
  group: string
  cross_group_retry?: boolean
  auto_groups?: string[] | null
}
