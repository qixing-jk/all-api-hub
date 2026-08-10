import { ChannelType } from "~/constants/newApi"

/** Canonical Sub2API API-key platform metadata. */
export const SUB2API_API_KEY_ACCOUNT_PLATFORM_METADATA = {
  openai: { label: "OpenAI", channelType: ChannelType.OpenAI },
  anthropic: { label: "Anthropic", channelType: ChannelType.Anthropic },
  gemini: { label: "Gemini", channelType: ChannelType.Gemini },
  grok: { label: "Grok", channelType: ChannelType.Xai },
  antigravity: { label: "Antigravity", channelType: ChannelType.Custom },
} as const

export type Sub2ApiApiKeyAccountPlatform =
  keyof typeof SUB2API_API_KEY_ACCOUNT_PLATFORM_METADATA

/** Sub2API API-key account platforms exposed by the upstream admin API. */
export const SUB2API_API_KEY_ACCOUNT_PLATFORMS: readonly Sub2ApiApiKeyAccountPlatform[] =
  Object.freeze(
    Object.keys(
      SUB2API_API_KEY_ACCOUNT_PLATFORM_METADATA,
    ) as Sub2ApiApiKeyAccountPlatform[],
  )

export const SUB2API_DEFAULT_ACCOUNT_PLATFORM: Sub2ApiApiKeyAccountPlatform =
  SUB2API_API_KEY_ACCOUNT_PLATFORMS[0]

export const SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS: Readonly<
  Record<Sub2ApiApiKeyAccountPlatform, string>
> = Object.freeze(
  Object.fromEntries(
    SUB2API_API_KEY_ACCOUNT_PLATFORMS.map((platform) => [
      platform,
      SUB2API_API_KEY_ACCOUNT_PLATFORM_METADATA[platform].label,
    ]),
  ) as Record<Sub2ApiApiKeyAccountPlatform, string>,
)

/** Channel-type select options derived from canonical Sub2API platform metadata. */
export const SUB2API_API_KEY_ACCOUNT_TYPE_OPTIONS = Object.freeze(
  SUB2API_API_KEY_ACCOUNT_PLATFORMS.map((platform) => {
    const metadata = SUB2API_API_KEY_ACCOUNT_PLATFORM_METADATA[platform]
    return { value: metadata.channelType, label: metadata.label }
  }),
)

export const isSub2ApiManagedResourcePlatform = (
  value: unknown,
): value is Sub2ApiApiKeyAccountPlatform =>
  typeof value === "string" &&
  SUB2API_API_KEY_ACCOUNT_PLATFORMS.includes(
    value as Sub2ApiApiKeyAccountPlatform,
  )

export const sub2ApiPlatformToChannelType = (
  platform: Sub2ApiApiKeyAccountPlatform,
) => SUB2API_API_KEY_ACCOUNT_PLATFORM_METADATA[platform].channelType

export const sub2ApiChannelTypeToPlatform = (
  channelType: unknown,
): Sub2ApiApiKeyAccountPlatform => {
  if (isSub2ApiManagedResourcePlatform(channelType)) return channelType
  const normalizedChannelType =
    typeof channelType === "string" && channelType.trim()
      ? Number(channelType)
      : channelType
  return (
    SUB2API_API_KEY_ACCOUNT_PLATFORMS.find(
      (platform) =>
        SUB2API_API_KEY_ACCOUNT_PLATFORM_METADATA[platform].channelType ===
        normalizedChannelType,
    ) ?? SUB2API_DEFAULT_ACCOUNT_PLATFORM
  )
}

export const SUB2API_MANAGED_RESOURCE_STATUS = {
  Active: "active",
  Inactive: "inactive",
  Error: "error",
} as const

export type Sub2ApiApiKeyAccountStatus =
  (typeof SUB2API_MANAGED_RESOURCE_STATUS)[keyof typeof SUB2API_MANAGED_RESOURCE_STATUS]

const SUB2API_API_KEY_ACCOUNT_STATUSES: readonly Sub2ApiApiKeyAccountStatus[] =
  Object.freeze(Object.values(SUB2API_MANAGED_RESOURCE_STATUS))

export const isSub2ApiManagedResourceStatus = (
  value: unknown,
): value is Sub2ApiApiKeyAccountStatus =>
  typeof value === "string" &&
  SUB2API_API_KEY_ACCOUNT_STATUSES.includes(value as Sub2ApiApiKeyAccountStatus)

export const SUB2API_ADMIN_REQUEST_TIMEOUT_MS = 30_000

export const SUB2API_MANAGED_RESOURCE_FIELD_IDS = {
  Name: "name",
  Platform: "platform",
  Status: "status",
  BaseUrl: "baseURL",
  Key: "key",
  Models: "supportedModels",
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
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.Models,
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
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.Models,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS.Notes,
] as const
