/** AIHubMix's own key response, including aliases used by its console versions. */
export type AIHubMixKeyData = {
  id?: number | string
  token_id?: number | string
  name?: string
  note?: string
  key?: string
  full_key?: string
  token?: string
  value?: string
  status?: number
  expired_time?: number
  created_time?: number
  accessed_time?: number
  unlimited_quota?: boolean
  remain_quota?: number
  used_quota?: number
  models?: string
  subnet?: string
  user_id?: number
  model_limits?: string
  model_limits_enabled?: boolean
  allow_ips?: string
  ip_whitelist?: string
  group?: string
  DeletedAt?: null
}

export type AIHubMixKey = AIHubMixKeyData & { id: number }

/** AIHubMix documents model and subnet strings, with no key-level group. */
export type AIHubMixKeyWrite = {
  name: string
  expired_time: number
  unlimited_quota: boolean
  remain_quota: number
  models: string
  subnet: string
}
