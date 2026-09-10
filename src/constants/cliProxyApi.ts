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
export const CLI_PROXY_API_DETAIL_FIELDS = Object.values(
  CLI_PROXY_API_RESOURCE_FIELDS,
)
