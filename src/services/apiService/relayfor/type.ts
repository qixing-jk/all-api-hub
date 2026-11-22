import { type BUDGET_PERIODS } from "~/services/amounts/financialConstants"

/**
 * RelayFor wire types.
 *
 * Source: RelayFor frontend bundles (auth.bundle.js and console.bundle.js) and
 * verified endpoints on https://relayfor.xyz/.
 */

export type RelayForUser = {
  id: number
  username: string
  quota: number
  role: number
  created_at?: string
  [key: string]: unknown
}

/** The overview only guarantees identity. Financial and count fields are raw. */
export type RelayForOverview = Record<string, unknown> & {
  user: Pick<RelayForUser, "id" | "username"> & Record<string, unknown>
}

export type RelayForTokenLimits = {
  budget_5h?: number
  budget_day?: number
  budget_week?: number
  budget_month?: number
  requests_per_minute?: number
  concurrent_requests?: number
  [key: string]: unknown
}

export type RelayForToken = {
  budget_usage?: {
    window: (typeof BUDGET_PERIODS)[keyof typeof BUDGET_PERIODS]
    limit: number
    used: number
    remaining: number
    reserved?: number
    next_reset_at?: string
  }[]
  limits?: RelayForTokenLimits
  id: number
  name: string
  key: string
  status: number // 1: enabled, 2: disabled
  remain_quota: number
  used_quota: number
  unlimited_quota: boolean
  model_limits?: string[] | null
  ip_limits?: string | string[] | null
  expired_at?: string | null
  created_at?: string
  updated_at?: string
}

export type RelayForTokenCreateRequest = {
  limits?: RelayForTokenLimits
  name: string
  remain_quota?: number
  unlimited_quota?: boolean
  expires_at?: string
  model_limits?: string[] | null
  ip_limits?: string
}

export type RelayForTokenUpdateRequest = {
  limits?: RelayForTokenLimits
  name?: string
  status?: number
  remain_quota?: number
  unlimited_quota?: boolean
  expires_at?: string
  model_limits?: string[] | null
  ip_limits?: string
}

export type RelayForModelPrices = {
  input?: number
  output?: number
  cache_read?: number
  cache_write?: number
}

export type RelayForModelItem = {
  access_reason?: string
  data_training_consent_required?: boolean
  data_training_channel_available?: boolean
  prompt_audit_enabled?: boolean
  prompt_audit_consent_required?: boolean
  prompt_audit_price?: number
  remote_compaction_enabled?: boolean
  effective_compaction_price?: number
  selected_group?: string
  active_session?: unknown
  model_groups?: {
    name: string
    available: boolean
    effective_multiplier?: number
  }[]
  subscription_plan?: string
  subscription_multiplier?: number
  model: string
  display_name?: string
  accessible?: boolean
  free_model?: boolean
  billing_mode?: "token" | "request" | string
  base_prices?: RelayForModelPrices
  effective_prices?: RelayForModelPrices
  base_request_price?: number
  effective_request_price?: number
  price_multiplier?: number
  effective_multiplier?: number
  long_context_threshold?: number
  long_context_base_prices?: RelayForModelPrices
  long_context_effective_prices?: RelayForModelPrices
  supported_endpoints?: string[]
  type?: string
  pricing?: {
    prompt_ratio?: number
    completion_ratio?: number
  }
  [key: string]: unknown
}

export type RelayForModelListResponse = {
  items: RelayForModelItem[]
}

export type RelayForCheckInDay = {
  date: string
  claimed: boolean
  can_claim: boolean
  can_makeup: boolean
}

export type RelayForCheckInCampaign = {
  id: number | string
  name: string
  description?: string
  start_date: string
  end_date: string
  makeups_used: number
  makeup_limit: number
  days: RelayForCheckInDay[]
}

export type RelayForCheckInClaimResult = {
  is_makeup: boolean
  reward_type: string
  quota_awarded: number
  benefits?: unknown
  subscription?: unknown
}

export type RelayForAnnouncement = {
  title?: string
  content: string
}
