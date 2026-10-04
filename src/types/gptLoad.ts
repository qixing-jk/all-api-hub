/**
 * gpt-load (https://github.com/tbphp/gpt-load) management API shapes.
 *
 * A "channel" here is the gateway's **group**: one channel id (the built-in
 * provider driver), a set of channel-specific `params` (at least `base_url`),
 * a pool of credentials, and a replaceable model list. Verified against a live
 * v2 control plane on 2026-10-03; the Go route handlers are the contract (no
 * OpenAPI document exists).
 */

/** `GET /api/auth/session` — the admin validation endpoint. */
export interface GptLoadSession {
  authenticated?: boolean | null
  principalType?: string | null
}

/** One descriptor field on a channel catalogue entry. */
export interface GptLoadChannelField {
  key: string
  label?: string | null
  input_kind?: string | null
  required?: boolean | null
  sensitive?: boolean | null
  default_value?: string | null
  [key: string]: unknown
}

/** One built-in channel driver as returned by `GET /api/channels`. */
export interface GptLoadChannelCatalogEntry {
  channel_id: string
  name?: string | null
  mark?: string | null
  icon?: string | null
  search_terms?: unknown[] | null
  description?: string | null
  param_fields?: GptLoadChannelField[] | null
  credential_fields?: GptLoadChannelField[] | null
  connection?: {
    type?: string | null
    credential_input?: string | null
    [key: string]: unknown
  } | null
  capabilities?: {
    model_discovery?: boolean | null
    outbound_proxy?: boolean | null
    quota_observation?: boolean | null
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

/** Credential-count summary attached to a list row. */
export interface GptLoadGroupCredentialCounts {
  total: number
  available: number
  [key: string]: unknown
}

/** A group row from `GET /api/modern/groups` or `GET /api/groups`. */
export interface GptLoadGroup {
  id: number
  name: string
  channel_id: string
  channel_name?: string | null
  connection_type?: string | null
  /** Channel-specific params; `base_url` when the channel accepts one. */
  params?: Record<string, unknown> | null
  enabled?: boolean | null
  /** `ready`/`unavailable`… from modern list; `status` from classic list. */
  availability?: string | null
  status?: string | null
  weight?: number | null
  price_multiplier?: string | null
  model_count?: number | null
  model_names?: string[] | null
  endpoint?: string | null
  credential_counts?: GptLoadGroupCredentialCounts | null
  [key: string]: unknown
}

/** `GET /api/groups/:id/settings`. */
export interface GptLoadGroupSettings {
  name?: string | null
  channel_id?: string | null
  connection_type?: string | null
  params?: Record<string, unknown> | null
  price_multiplier?: string | null
  enabled?: boolean | null
  weight_manual?: number | null
  validation_protocol?: string | null
  validation_model?: string | null
  proxy?: Record<string, unknown> | null
  [key: string]: unknown
}

/** A credential row from `GET /api/groups/:id/credentials`. */
export interface GptLoadCredential {
  credential_id: number
  name?: string | null
  /** Gateway-masked secret (`sk-p****0001`). Never a usable value. */
  mask?: string | null
  connection_type?: string | null
  secret_version?: number | null
  effective_status?: string | null
  configured_status?: string | null
  weight?: number | null
  recent_success_count?: number | null
  recent_failure_count?: number | null
  consecutive_failure_count?: number | null
  auth_state?: string | null
  [key: string]: unknown
}

/** One model on a group's model list (`GET/PUT /api/groups/:id/models`). */
export interface GptLoadGroupModel {
  id: string
  alias?: string | null
  alias_enabled?: boolean | null
  [key: string]: unknown
}

/** `GET /api/groups/:id/models`. */
export interface GptLoadGroupModels {
  items?: GptLoadGroupModel[] | null
  total?: number | null
  [key: string]: unknown
}

/** `POST /api/groups/:credId/reveal` result. */
export interface GptLoadCredentialReveal {
  credential_id?: number | null
  credential?: Record<string, unknown> | null
  [key: string]: unknown
}
