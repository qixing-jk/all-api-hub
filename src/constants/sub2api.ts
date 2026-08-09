import { ChannelType } from "~/constants/newApi"
import {
  SUB2API_API_KEY_ACCOUNT_PLATFORMS,
  type Sub2ApiApiKeyAccountPlatform,
} from "~/types/sub2apiManagedSite"

/** Sub2API API-key account platforms exposed by the upstream admin API. */
export const SUB2API_API_KEY_ACCOUNT_TYPE_OPTIONS = [
  { value: ChannelType.OpenAI, label: "OpenAI" },
  { value: ChannelType.Anthropic, label: "Anthropic" },
  { value: ChannelType.Gemini, label: "Gemini" },
  { value: ChannelType.Xai, label: "Grok" },
  { value: ChannelType.Custom, label: "Antigravity" },
] as const

export const SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  grok: "Grok",
  antigravity: "Antigravity",
} as const satisfies Record<Sub2ApiApiKeyAccountPlatform, string>

export const SUB2API_MANAGED_RESOURCE_STATUS = {
  Active: "active",
  Inactive: "inactive",
  Error: "error",
} as const

export const SUB2API_MANAGED_RESOURCE_FIELD_IDS = {
  Name: "name",
  Platform: "platform",
  Status: "status",
  BaseUrl: "baseURL",
  Key: "key",
  Concurrency: "concurrency",
  Priority: "priority",
  Notes: "notes",
} as const

export const SUB2API_MANAGED_RESOURCE_EDITABLE_FIELD_IDS = Object.freeze([
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.Notes,
])

export const SUB2API_MANAGED_RESOURCE_TABLE_FIELD_IDS = [
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority,
] as const

export const SUB2API_MANAGED_RESOURCE_DETAIL_FIELD_IDS = [
  ...SUB2API_MANAGED_RESOURCE_TABLE_FIELD_IDS,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.Notes,
] as const

export const isSub2ApiManagedResourcePlatform = (
  value: unknown,
): value is Sub2ApiApiKeyAccountPlatform =>
  typeof value === "string" &&
  SUB2API_API_KEY_ACCOUNT_PLATFORMS.includes(
    value as Sub2ApiApiKeyAccountPlatform,
  )
