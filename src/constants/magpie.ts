export const MAGPIE_ENDPOINT_TYPES = {
  Chat: "chat",
  Responses: "responses",
  Anthropic: "anthropic",
  Gemini: "gemini",
} as const

export const MAGPIE_ENDPOINT_FIELDS = [
  MAGPIE_ENDPOINT_TYPES.Chat,
  MAGPIE_ENDPOINT_TYPES.Responses,
  MAGPIE_ENDPOINT_TYPES.Anthropic,
  MAGPIE_ENDPOINT_TYPES.Gemini,
] as const

export const MAGPIE_PROTOCOLS = {
  chat: "openai-compatible",
  responses: "openai",
  anthropic: "anthropic",
  gemini: "google",
} as const

export const MAGPIE_TABLE_FIELDS = [
  "name",
  "baseURL",
  "status",
  "supportedModels",
] as const
export const MAGPIE_DETAIL_FIELDS = [
  ...MAGPIE_TABLE_FIELDS,
  ...MAGPIE_ENDPOINT_FIELDS,
  "key",
  "proxy",
] as const
