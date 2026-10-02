const CLI_PROXY_API_RESOURCE_FIELDS = {
  Name: "name",
  Type: "type",
  Status: "status",
  BaseUrl: "baseURL",
  Key: "key",
  Models: "supportedModels",
  ProxyUrl: "proxy_url",
  Prefix: "prefix",
  Headers: "headers",
  ExcludedModels: "excluded_models",
} as const

export const CLI_PROXY_API_TABLE_FIELDS = [
  "name",
  "type",
  "baseURL",
  "status",
  "supportedModels",
] as const
/**
 * Fields the detail view may show. Headers and excluded models are not declared:
 * the adapter projects no fact for either (headers can carry credentials, so they
 * are never copied into display data), and a declaration without a fact would
 * promise a detail row that can never render.
 */
export const CLI_PROXY_API_DETAIL_FIELDS = Object.values(
  CLI_PROXY_API_RESOURCE_FIELDS,
).filter(
  (fieldId) =>
    fieldId !== CLI_PROXY_API_RESOURCE_FIELDS.Headers &&
    fieldId !== CLI_PROXY_API_RESOURCE_FIELDS.ExcludedModels,
)
