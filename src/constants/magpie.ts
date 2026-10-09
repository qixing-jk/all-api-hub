export const MAGPIE_ENDPOINT_FIELDS = [
  "chat",
  "responses",
  "anthropic",
  "gemini",
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
