/**
 * Requesty management API constants.
 *
 * Contract: https://docs.requesty.ai/api-reference/management-apis and the
 * OpenAPI spec (requesty_management-openapi.json). Every management route is
 * rooted at the dedicated management host's `/v1/manage` prefix, not the
 * console origin.
 */
export const REQUESTY_ENDPOINTS = {
  org: "/v1/manage/org",
  groups: "/v1/manage/group",
  apiKeys: "/v1/manage/apikey",
  apiKey: (id: string) => `/v1/manage/apikey/${encodeURIComponent(id)}`,
  apiKeyLimit: (id: string) =>
    `/v1/manage/apikey/${encodeURIComponent(id)}/limit`,
  apiKeyExpiry: (id: string) =>
    `/v1/manage/apikey/${encodeURIComponent(id)}/expiry`,
  orgUsage: "/v1/manage/org/usage",
} as const

/** Known permission values shared by parsing, creation and inference policy. */
export const REQUESTY_KEY_PERMISSIONS = {
  None: "none",
  Write: "write",
} as const

export const REQUESTY_RESPONSE_ERRORS = {
  Organization: "invalid_requesty_org",
  Groups: "invalid_requesty_groups",
  GroupOrganization: "invalid_requesty_group_organization",
  SelfKey: "invalid_requesty_apikey_self",
  KeyList: "invalid_requesty_apikey_list",
  Key: "invalid_requesty_apikey",
  CreatedKey: "invalid_requesty_apikey_create",
  Model: "invalid_requesty_model",
} as const
