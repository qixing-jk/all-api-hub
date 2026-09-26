/**
 * Right Code wire types.
 *
 * Field names are the provider's own snake_case payloads, measured against a
 * live authenticated account (see `.scratch/rightcode-adaptation/probe-*.json`
 * for the captured responses). Optional fields stay optional because the
 * deployment adds capabilities over time.
 */

/** Protocol families a channel can serve. */
export const RIGHTCODE_PROTOCOLS = [
  "responses",
  "messages",
  "completions",
  "gemini",
] as const

export type RightCodeProtocol = (typeof RIGHTCODE_PROTOCOLS)[number]

export type RightCodeUpstreamLimit = {
  upstream_id: number
  upstream_prefix?: string | null
  upstream_name?: string | null
  rpm_limit?: number | null
  current_rpm?: number | null
  concurrent_limit?: number | null
  current_concurrent?: number | null
}

/** `GET /auth/me`; the account token is also the API credential clients export. */
export type RightCodeUserInfo = {
  id: number
  username: string
  email?: string | null
  balance?: number | string | null
  permissions?: string[] | null
  user_token: string
  invite_code?: string | null
  is_banned?: boolean
  is_admin?: number
  upstream_limits?: RightCodeUpstreamLimit[] | null
  otp_enabled?: boolean
  token_rotation_enabled?: boolean
  token_rotation_days?: number
  created_at?: string | null
  updated_at?: string | null
}

/**
 * `GET /api-key/list` item. `key` is returned in plaintext by list, detail and
 * create, so the inventory can always recover the real secret.
 */
export type RightCodeApiKey = {
  id: number
  key: string
  name?: string | null
  bound_upstream_id?: number | null
  user_id?: number | null
  quota_limit?: number | string | null
  used_quota?: number | string | null
  expired_at?: string | null
  is_active?: boolean | null
  allowed_prefixes?: string[] | null
  allowed_models?: string[] | null
  allow_wallet?: boolean | null
  allowed_item_ids?: number[] | null
  created_at?: string | null
  updated_at?: string | null
}

/** `POST /api-key/create` body. */
export type RightCodeApiKeyCreateRequest = {
  bound_upstream_id: number
  allowed_models: string[]
  name?: string
  quota_limit: number | null
  allow_wallet: boolean
  allowed_item_ids: number[] | null
}

/** `PATCH /api-key/{id}` body. Omitted fields keep their current value. */
export type RightCodeApiKeyUpdateRequest = {
  name?: string
  quota_limit?: number | null
  is_active?: boolean
  bound_upstream_id?: number
  allowed_prefixes?: string[]
  allowed_models?: string[]
  allow_wallet?: boolean
  allowed_item_ids?: number[] | null
}

export type RightCodeEffectiveModelTier = {
  max_context_length?: number | null
  max_output_length?: number | null
  input_price?: number | string | null
  output_price?: number | string | null
  cache_read_input_price?: number | string | null
  cache_creation_input_price?: number | string | null
}

export type RightCodeEffectivePriceConfig = {
  input_price?: number | string | null
  output_price?: number | string | null
  cache_read_input_price?: number | string | null
  cache_creation_input_price?: number | string | null
  request_price?: number | string | null
  tiers?: RightCodeEffectiveModelTier[] | null
}

/** `GET /models/effective` model entry. Prices already include the site rate. */
export type RightCodeEffectiveModel = {
  model_id: number
  name: string
  is_available?: boolean | null
  input_price?: number | string | null
  output_price?: number | string | null
  cache_read_input_price?: number | string | null
  cache_creation_input_price?: number | string | null
  request_price?: number | string | null
  billing_mode?: string | null
  tiers?: RightCodeEffectiveModelTier[] | null
  effective_price_config?: RightCodeEffectivePriceConfig | null
  effective_total_rate?: number | string | null
  pricing_source?: string | null
}

/** `GET /models/effective` channel entry. */
export type RightCodeEffectiveUpstream = {
  upstream_id: number
  name?: string | null
  prefix: string
  remark?: string | null
  /**
   * The deployment's own "copy base URL" rule: true appends `/v1` to the
   * channel address. Not every responses/completions channel sets it, so it
   * takes precedence over the protocol-derived default.
   */
  copy_with_v1?: boolean | null
  official_currency?: string | null
  modality?: string | null
  effective_upstream_rate?: number | string | null
  supported_protocols?: RightCodeProtocol[] | null
  default_protocol?: RightCodeProtocol | null
  models?: RightCodeEffectiveModel[] | null
}

export type RightCodeUsageStats = {
  total_requests?: number | string | null
  total_tokens?: number | string | null
  total_cost?: number | string | null
  start_date?: string | null
  end_date?: string | null
}

export type RightCodeOverallUsageStats = RightCodeUsageStats & {
  period_days?: number | null
  note?: string | null
}

/** `GET /subscriptions/list` item. */
export type RightCodeSubscription = {
  item_id: number
  name?: string | null
  remaining_quota?: number | string | null
  total_quota?: number | string | null
  available_today_quota?: number | string | null
  available_prefixes?: string[] | null
  reset_today?: boolean | null
  expired_at?: string | null
}

export type RightCodeSubscriptionSummary = {
  total_quota?: number | string | null
  used_quota?: number | string | null
  remaining_quota?: number | string | null
  active_subscription_count?: number | null
}
