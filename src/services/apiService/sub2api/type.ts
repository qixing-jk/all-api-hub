/**
 * Sub2API DTOs and route constants.
 *
 * Sub2API frontends commonly wrap responses in an envelope:
 * `{ code, message, data }`.
 */

export const SUB2API_AUTH_ME_ENDPOINT = "/api/v1/auth/me"
export const SUB2API_PUBLIC_SETTINGS_ENDPOINT = "/api/v1/settings/public"
export const SUB2API_AFFILIATE_ENDPOINT = "/api/v1/user/aff"
export const SUB2API_KEYS_ENDPOINT = "/api/v1/keys"
export const SUB2API_ANNOUNCEMENTS_ENDPOINT = "/api/v1/announcements"
export const SUB2API_AVAILABLE_GROUPS_ENDPOINT = "/api/v1/groups/available"
export const SUB2API_GROUP_RATES_ENDPOINT = "/api/v1/groups/rates"
export const SUB2API_USAGE_STATS_ENDPOINT = "/api/v1/usage/stats"
export const SUB2API_REDEEM_CHECKIN_ENDPOINT = "/api/v1/redeem/checkin"
export const SUB2API_REDEEM_CHECKIN_STATUS_ENDPOINT =
  "/api/v1/redeem/checkin/status"

/**
 * Machine-readable failure reasons carried in the top-level `reason` field of
 * redeem check-in error envelopes. Numeric `code` mirrors the HTTP status;
 * `reason` is the authoritative discriminator.
 *
 * Contract pinned to jiangmuran/sub2api_pro@3f858570 and Wei-Shaw/sub2api#510.
 */
export const SUB2API_REDEEM_CHECKIN_ERROR_REASONS = {
  DailyCheckinDisabled: "DAILY_CHECKIN_DISABLED",
  DailyCheckinRoleForbidden: "DAILY_CHECKIN_ROLE_FORBIDDEN",
  DailyCheckinAlreadyDone: "DAILY_CHECKIN_ALREADY_DONE",
} as const

export type Sub2ApiRedeemCheckInErrorReason =
  (typeof SUB2API_REDEEM_CHECKIN_ERROR_REASONS)[keyof typeof SUB2API_REDEEM_CHECKIN_ERROR_REASONS]

/**
 * Strict status DTO for `GET /api/v1/redeem/checkin/status`.
 * Booleans must be real booleans, numbers finite, and reward bounds ordered.
 * Extra unrelated fields may be present; alias probing is forbidden.
 */
export type Sub2ApiRedeemCheckInStatusData = {
  enabled: boolean
  checked_in_today: boolean
  reward_min: number
  reward_max: number
  reward_amount?: number
}

/**
 * Execution DTO for `POST /api/v1/redeem/checkin` on success.
 */
export type Sub2ApiRedeemCheckInResultData = {
  message: string
  reward_amount: number
  new_balance: number
  checked_in_at: string
}

type IntLike = number | string
type NumericLike = number | string

export type Sub2ApiEnvelope<T> = {
  /**
   * Sub2API response code (0 indicates success; non-zero indicates a business error).
   */
  code: number
  /**
   * Sub2API response message.
   */
  message: string
  data?: T
}

export type Sub2ApiPaginatedData<T> = {
  items?: T[]
  total?: number
  page?: number
  page_size?: number
  pages?: number
}

/**
 * User payload returned under `data` for Sub2API `/api/v1/auth/me`.
 */
export type Sub2ApiAuthMeData = {
  id: IntLike
  username?: string | null
  email?: string | null
  balance?: NumericLike | null
}

export type Sub2ApiAuthMeResponse = Sub2ApiEnvelope<Sub2ApiAuthMeData>

export type Sub2ApiPublicSettingsData = {
  affiliate_enabled?: boolean | null
  site_name?: string | null
}

export type Sub2ApiAffiliateData = {
  aff_code?: string | null
}

export type Sub2ApiGroupData = {
  id: IntLike
  name?: string | null
  description?: string | null
  rate_multiplier?: NumericLike | null
}

/** Provider-native group identity and safe display metadata. */
export type Sub2ApiGroupDescriptor = {
  readonly id: number
  readonly displayName: string
  readonly description: string
  readonly ratio: number
}

export type Sub2ApiKeyStatus =
  | "active"
  | "inactive"
  | "quota_exhausted"
  | "expired"
  | (string & {})

export type Sub2ApiKeyData = {
  id: IntLike
  user_id?: IntLike | null
  key?: string | null
  name?: string | null
  status?: Sub2ApiKeyStatus | number | null
  quota?: NumericLike | null
  quota_used?: NumericLike | null
  expires_at?: string | number | null
  created_at?: string | number | null
  updated_at?: string | number | null
  ip_whitelist?: string[] | string | null
  group_id?: IntLike | null
  group?: Sub2ApiGroupData | null
  Group?: Sub2ApiGroupData | null
}

export type Sub2ApiKeyListData =
  | Sub2ApiPaginatedData<Sub2ApiKeyData>
  | Sub2ApiKeyData[]

export type Sub2ApiUsageStatsData = {
  total_requests?: NumericLike | null
  total_input_tokens?: NumericLike | null
  total_output_tokens?: NumericLike | null
  total_actual_cost?: NumericLike | null
}

export type Sub2ApiAnnouncementData = {
  id?: IntLike | null
  title?: string | null
  content?: string | null
  message?: string | null
  body?: string | null
  created_at?: string | number | null
  updated_at?: string | number | null
  read_at?: string | number | null
}

export type Sub2ApiAnnouncementListData =
  | Sub2ApiPaginatedData<Sub2ApiAnnouncementData>
  | Sub2ApiAnnouncementData[]

export type Sub2ApiKeyWritePayloadBase = {
  name: string
  group_id?: number
  quota?: number
  ip_whitelist?: string[]
}

export type Sub2ApiCreateKeyPayload = Sub2ApiKeyWritePayloadBase & {
  expires_in_days?: number
}

export type Sub2ApiUpdateKeyPayload = Sub2ApiKeyWritePayloadBase & {
  status?: "active" | "inactive"
  expires_at?: string
  reset_quota?: boolean
}
