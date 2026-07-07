import {
  SPONSOR_SUPPORT_STATUS,
  SPONSOR_VISIBILITY_BROWSER_FAMILIES,
} from "./types"

type StringEnum = Record<string, string>

/** Builds a reusable lookup set from a string enum-like constant object. */
function createValueSet(values: StringEnum): ReadonlySet<string> {
  return new Set(Object.values(values))
}

const SPONSOR_CATALOG_ITEM_FIELD = {
  Id: "id",
  Locales: "locales",
} as const

const SPONSOR_LOCALE_CAMPAIGN_FIELD = {
  Enabled: "enabled",
  Rank: "rank",
  SupportStatus: "supportStatus",
  StartsAt: "startsAt",
  EndsAt: "endsAt",
  Name: "name",
  Tagline: "tagline",
  PostClickNote: "postClickNote",
  Links: "links",
  Actions: "actions",
  Visibility: "visibility",
} as const

const SPONSOR_CAMPAIGN_LINK_FIELD = {
  Primary: "primary",
} as const

const SPONSOR_CAMPAIGN_VISIBILITY_FIELD = {
  ExtensionVersions: "extensionVersions",
  ExcludedBrowserFamilies: "excludedBrowserFamilies",
} as const

const SPONSOR_CAMPAIGN_ACTION_FIELD = {
  AddAccount: "addAccount",
  BookmarkFallback: "bookmarkFallback",
  ApiCredentialProfileFallback: "apiCredentialProfileFallback",
} as const

const SPONSOR_ADD_ACCOUNT_ACTION_FIELD = {
  SiteType: "siteType",
  SiteUrl: "siteUrl",
  AuthType: "authType",
} as const

const SPONSOR_BOOKMARK_FALLBACK_ACTION_FIELD = {
  Url: "url",
} as const

const SPONSOR_API_CREDENTIAL_PROFILE_FALLBACK_ACTION_FIELD = {
  BaseUrl: "baseUrl",
  ApiKeyCreateUrl: "apiKeyCreateUrl",
  ApiKeyCreateHint: "apiKeyCreateHint",
} as const

export const SPONSOR_CATALOG_ITEM_FIELDS = createValueSet(
  SPONSOR_CATALOG_ITEM_FIELD,
)

export const SPONSOR_LOCALE_CAMPAIGN_FIELDS = createValueSet(
  SPONSOR_LOCALE_CAMPAIGN_FIELD,
)

export const SPONSOR_CAMPAIGN_LINK_FIELDS = createValueSet(
  SPONSOR_CAMPAIGN_LINK_FIELD,
)

export const SPONSOR_CAMPAIGN_VISIBILITY_FIELDS = createValueSet(
  SPONSOR_CAMPAIGN_VISIBILITY_FIELD,
)

export const SPONSOR_CAMPAIGN_ACTION_FIELDS = createValueSet(
  SPONSOR_CAMPAIGN_ACTION_FIELD,
)

export const SPONSOR_ADD_ACCOUNT_ACTION_FIELDS = createValueSet(
  SPONSOR_ADD_ACCOUNT_ACTION_FIELD,
)

export const SPONSOR_BOOKMARK_FALLBACK_ACTION_FIELDS = createValueSet(
  SPONSOR_BOOKMARK_FALLBACK_ACTION_FIELD,
)

export const SPONSOR_API_CREDENTIAL_PROFILE_FALLBACK_ACTION_FIELDS =
  createValueSet(SPONSOR_API_CREDENTIAL_PROFILE_FALLBACK_ACTION_FIELD)

export const SPONSOR_SUPPORT_STATUS_VALUES = createValueSet(
  SPONSOR_SUPPORT_STATUS,
)

export const SPONSOR_VISIBILITY_BROWSER_FAMILY_VALUES = createValueSet(
  SPONSOR_VISIBILITY_BROWSER_FAMILIES,
)
