/**
 * Sub2API DTOs and route constants.
 *
 * Sub2API frontends commonly wrap responses in an envelope:
 * `{ code, message, data }`.
 */

export const SUB2API_AUTH_ME_ENDPOINT = "/api/v1/auth/me"
export const SUB2API_KEYS_ENDPOINT = "/api/v1/keys"
export const SUB2API_AVAILABLE_GROUPS_ENDPOINT = "/api/v1/groups/available"
export const SUB2API_GROUP_RATES_ENDPOINT = "/api/v1/groups/rates"

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

export type Sub2ApiGroupData = {
  id: IntLike
  name?: string | null
  description?: string | null
  rate_multiplier?: NumericLike | null
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
