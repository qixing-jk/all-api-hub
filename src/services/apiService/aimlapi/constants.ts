import { AIMLAPI_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"

/**
 * AI/ML API saved-key routes.
 *
 * The deployment answers two disjoint credential scopes on one host:
 * - a **management key** manages keys (`/v1/keys`),
 * - a **regular API key** reads account money (`/v2/billing*`).
 * Both may read `/v2/usage*` and `/v2/logs`. Verified 2026-10-24; the 403s are
 * explicit ("this route is for regular keys" / "not allowed for this API key").
 */
export const AIMLAPI_ENDPOINTS = {
  Keys: "/v1/keys",
  /** Parameters of the most recently used key; never a key inventory. */
  LatestKey: "/v1/key",
  Billing: "/v2/billing",
  BillingDetail: "/v2/billing/detail",
  BillingTransactions: "/v2/billing/transactions",
  Usage: "/v2/usage",
  UsageDetail: "/v2/usage/detail",
  Logs: "/v2/logs",
  /** Public catalogue: no credential required. */
  Models: "/v1/models",
} as const

export const AIMLAPI_ONBOARDING_ERRORS = {
  IdentityMismatch: "identity_mismatch",
  ManualCredentialRequired: "manual_credential_required",
  SessionUnavailable: "session_unavailable",
  ConsoleRequestFailed: "aimlapi_console_request_failed",
  IssuanceUnconfirmed: "aimlapi_issuance_unconfirmed",
} as const

export const AIMLAPI_BILLING_ENDPOINT = AIMLAPI_ENDPOINTS.Billing
export const AIMLAPI_BILLING_DETAIL_ENDPOINT = AIMLAPI_ENDPOINTS.BillingDetail
export const AIMLAPI_USAGE_DETAIL_ENDPOINT = AIMLAPI_ENDPOINTS.UsageDetail
export const AIMLAPI_LOGS_ENDPOINT = AIMLAPI_ENDPOINTS.Logs

/** Model access scopes accepted on key create and patch. */
export const AIMLAPI_KEY_SCOPES = [
  "model:chat",
  "model:responses",
  "model:image",
  "model:audio",
  "model:video",
  "model:embeddings",
  "model:speech",
  "model:ocr",
] as const

export type AimlApiKeyScope = (typeof AIMLAPI_KEY_SCOPES)[number]

/**
 * Limit retention values the create route accepts. `never` reads back as
 * `retention: null` with `window_start: null`, so the read model tolerates it.
 */
export const AIMLAPI_KEY_LIMIT_PERIODS = {
  Day: "day",
  Week: "week",
  Month: "month",
  Never: "never",
} as const

export const AIMLAPI_KEY_LIMIT_RETENTIONS = [
  AIMLAPI_KEY_LIMIT_PERIODS.Day,
  AIMLAPI_KEY_LIMIT_PERIODS.Week,
  AIMLAPI_KEY_LIMIT_PERIODS.Month,
  AIMLAPI_KEY_LIMIT_PERIODS.Never,
] as const

export type AimlApiKeyLimitRetention =
  (typeof AIMLAPI_KEY_LIMIT_RETENTIONS)[number]

/** Provider endpoint identities shared by price reconciliation and capability projection. */
export const AIMLAPI_MODEL_ENDPOINT_TYPES = {
  Chat: "openai/chat-completions",
  Responses: "openai/responses/submit",
  ImageGeneration: "openai/image-generations",
  ImageEditing: "openai/image-editing",
  Embeddings: "openai/embeddings",
  Messages: "anthropic/messages",
  VideoGeneration: "internal/video-generations/submit",
  TextToSpeech: "internal/text-to-speech",
  SpeechToText: "internal/speech-to-text/submit",
  AudioGeneration: "internal/audio-generations/submit",
  Ocr: "internal/optical-character-recognition",
  Batches: "anthropic/batches",
  BatchStatus: "anthropic/batches-status",
  BatchCancel: "anthropic/batches-cancel",
  AudioPreprocess: "internal/audio-generations/preprocess",
} as const

/** Native editor limits; validation and user guidance must agree. */
export const AIMLAPI_KEY_EDITOR_LIMITS = {
  Name: 64,
  AllowedModels: 15,
  AllowedTools: 50,
} as const

/** Values declared by the provider's structured pricing schema. */
export const AIMLAPI_PRICING_KINDS = {
  Fixed: "fixed",
  Variable: "variable",
  Variants: "variants",
} as const
export const AIMLAPI_CHARGE_TYPES = { Charge: "charge", Hold: "hold" } as const
export const AIMLAPI_PRICING_UNITS = {
  Token: "token",
  Call: "call",
  Second: "second",
  Generation: "generation",
  Payload: "payload",
  Page: "page",
  Megapixel: "megapixel",
} as const
export const AIMLAPI_PRICING_CONTENTS = {
  Text: "text",
  Image: "image",
  Video: "video",
  Audio: "audio",
  Document: "document",
} as const
export const AIMLAPI_PRICING_ORIGINS = {
  Provided: "provided",
  Generated: "generated",
  Cached: "cached",
  CacheWrite: "cache_write",
  CacheWrite1h: "cache_write_1h",
} as const

/** Public structured catalog used as the authoritative pricing source. */
export const AIMLAPI_CATALOG_PRICING_URL = `${AIMLAPI_API_BASE_URL}${AIMLAPI_ENDPOINTS.Models}?include=pricing`
