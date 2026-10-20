import { isRecord } from "~/utils/core/object"

import { getUnknownKeys } from "./catalogValidation"
import {
  SPONSOR_SUPPORT_STATUS,
  SPONSOR_VISIBILITY_BROWSER_FAMILIES,
  type RawSponsorCatalogItem,
  type RawSponsorLocaleCampaign,
} from "./types"

type StringEnum = Record<string, string>
type RawSponsorCampaignLinks = RawSponsorLocaleCampaign["links"]
type RawSponsorCampaignVisibility = NonNullable<
  RawSponsorLocaleCampaign["visibility"]
>
type RawSponsorCampaignActions = NonNullable<
  RawSponsorLocaleCampaign["actions"]
>
type RawSponsorAddAccountAction = NonNullable<
  RawSponsorCampaignActions["addAccount"]
>
type RawSponsorBookmarkFallbackAction = NonNullable<
  RawSponsorCampaignActions["bookmarkFallback"]
>
type RawSponsorApiCredentialProfileFallbackAction = NonNullable<
  RawSponsorCampaignActions["apiCredentialProfileFallback"]
>

/** Builds a reusable lookup set from a string enum-like constant object. */
function createValueSet(values: StringEnum): ReadonlySet<string> {
  return new Set(Object.values(values))
}

const SPONSOR_CATALOG_ITEM_FIELD = {
  Id: "id",
  Locales: "locales",
} as const satisfies Record<string, keyof RawSponsorCatalogItem>

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
} as const satisfies Record<string, keyof RawSponsorLocaleCampaign>

const SPONSOR_CAMPAIGN_LINK_FIELD = {
  Primary: "primary",
} as const satisfies Record<string, keyof RawSponsorCampaignLinks>

const SPONSOR_CAMPAIGN_VISIBILITY_FIELD = {
  ExtensionVersions: "extensionVersions",
  ExcludedBrowserFamilies: "excludedBrowserFamilies",
} as const satisfies Record<string, keyof RawSponsorCampaignVisibility>

const SPONSOR_CAMPAIGN_ACTION_FIELD = {
  AddAccount: "addAccount",
  BookmarkFallback: "bookmarkFallback",
  ApiCredentialProfileFallback: "apiCredentialProfileFallback",
} as const satisfies Record<string, keyof RawSponsorCampaignActions>

const SPONSOR_ADD_ACCOUNT_ACTION_FIELD = {
  SiteType: "siteType",
  SiteUrl: "siteUrl",
  AuthType: "authType",
} as const satisfies Record<string, keyof RawSponsorAddAccountAction>

const SPONSOR_BOOKMARK_FALLBACK_ACTION_FIELD = {
  Url: "url",
} as const satisfies Record<string, keyof RawSponsorBookmarkFallbackAction>

const SPONSOR_API_CREDENTIAL_PROFILE_FALLBACK_ACTION_FIELD = {
  BaseUrl: "baseUrl",
  ApiKeyCreateUrl: "apiKeyCreateUrl",
  ApiKeyCreateHint: "apiKeyCreateHint",
} as const satisfies Record<
  string,
  keyof RawSponsorApiCredentialProfileFallbackAction
>

const SPONSOR_CATALOG_ITEM_FIELDS = createValueSet(SPONSOR_CATALOG_ITEM_FIELD)

const SPONSOR_LOCALE_CAMPAIGN_FIELDS = createValueSet(
  SPONSOR_LOCALE_CAMPAIGN_FIELD,
)

const SPONSOR_CAMPAIGN_LINK_FIELDS = createValueSet(SPONSOR_CAMPAIGN_LINK_FIELD)

export const SPONSOR_CAMPAIGN_VISIBILITY_FIELDS = createValueSet(
  SPONSOR_CAMPAIGN_VISIBILITY_FIELD,
)

const SPONSOR_CAMPAIGN_ACTION_FIELDS = createValueSet(
  SPONSOR_CAMPAIGN_ACTION_FIELD,
)

const SPONSOR_ADD_ACCOUNT_ACTION_FIELDS = createValueSet(
  SPONSOR_ADD_ACCOUNT_ACTION_FIELD,
)

const SPONSOR_BOOKMARK_FALLBACK_ACTION_FIELDS = createValueSet(
  SPONSOR_BOOKMARK_FALLBACK_ACTION_FIELD,
)

const SPONSOR_API_CREDENTIAL_PROFILE_FALLBACK_ACTION_FIELDS = createValueSet(
  SPONSOR_API_CREDENTIAL_PROFILE_FALLBACK_ACTION_FIELD,
)

export const SPONSOR_SUPPORT_STATUS_VALUES = createValueSet(
  SPONSOR_SUPPORT_STATUS,
)

export const SPONSOR_VISIBILITY_BROWSER_FAMILY_VALUES = createValueSet(
  SPONSOR_VISIBILITY_BROWSER_FAMILIES,
)

/**
 * Strict schema validator for served V5 catalog artifacts in CI.
 * Enforces that served artifacts do not contain unrecognised fields (e.g. iconURL typos or unprojected top-level additions)
 * that would cause older released V5 clients (v3.52.0+) using closed-world validation to reject campaigns.
 */
export function validateStrictSponsorCatalogArtifact(
  catalog: unknown,
): string[] {
  if (!isRecord(catalog)) {
    return ["catalog payload must be an object"]
  }
  if (!Array.isArray(catalog.items)) {
    return ["catalog items must be an array"]
  }

  const errors: string[] = []

  catalog.items.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`item at index ${index} must be an object`)
      return
    }

    const itemId = typeof item.id === "string" ? item.id : `index_${index}`
    const unknownItemKeys = getUnknownKeys(item, SPONSOR_CATALOG_ITEM_FIELDS)
    if (unknownItemKeys.length > 0) {
      errors.push(
        `item ${itemId} has unsupported top-level fields: ${unknownItemKeys.join(", ")}`,
      )
    }

    if (!isRecord(item.locales)) {
      errors.push(`item ${itemId} locales must be an object`)
      return
    }

    Object.entries(item.locales).forEach(([locale, campaign]) => {
      if (!isRecord(campaign)) {
        errors.push(
          `item ${itemId} locale ${locale} campaign must be an object`,
        )
        return
      }

      const unknownCampaignKeys = getUnknownKeys(
        campaign,
        SPONSOR_LOCALE_CAMPAIGN_FIELDS,
      )
      if (unknownCampaignKeys.length > 0) {
        errors.push(
          `item ${itemId} locale ${locale} has unsupported campaign fields: ${unknownCampaignKeys.join(", ")}`,
        )
      }

      if (campaign.links !== undefined) {
        if (!isRecord(campaign.links)) {
          errors.push(`item ${itemId} locale ${locale} links must be an object`)
        } else {
          const unknownLinkKeys = getUnknownKeys(
            campaign.links,
            SPONSOR_CAMPAIGN_LINK_FIELDS,
          )
          if (unknownLinkKeys.length > 0) {
            errors.push(
              `item ${itemId} locale ${locale} has unsupported link fields: ${unknownLinkKeys.join(", ")}`,
            )
          }
        }
      }

      if (campaign.actions !== undefined) {
        if (!isRecord(campaign.actions)) {
          errors.push(
            `item ${itemId} locale ${locale} actions must be an object`,
          )
        } else {
          const unknownActionKeys = getUnknownKeys(
            campaign.actions,
            SPONSOR_CAMPAIGN_ACTION_FIELDS,
          )
          if (unknownActionKeys.length > 0) {
            errors.push(
              `item ${itemId} locale ${locale} has unsupported action fields: ${unknownActionKeys.join(", ")}`,
            )
          }

          if (campaign.actions.addAccount !== undefined) {
            if (!isRecord(campaign.actions.addAccount)) {
              errors.push(
                `item ${itemId} locale ${locale} addAccount action must be an object`,
              )
            } else {
              const unknownAddAccountKeys = getUnknownKeys(
                campaign.actions.addAccount,
                SPONSOR_ADD_ACCOUNT_ACTION_FIELDS,
              )
              if (unknownAddAccountKeys.length > 0) {
                errors.push(
                  `item ${itemId} locale ${locale} has unsupported addAccount fields: ${unknownAddAccountKeys.join(", ")}`,
                )
              }
            }
          }

          if (campaign.actions.bookmarkFallback !== undefined) {
            if (!isRecord(campaign.actions.bookmarkFallback)) {
              errors.push(
                `item ${itemId} locale ${locale} bookmarkFallback action must be an object`,
              )
            } else {
              const unknownBookmarkKeys = getUnknownKeys(
                campaign.actions.bookmarkFallback,
                SPONSOR_BOOKMARK_FALLBACK_ACTION_FIELDS,
              )
              if (unknownBookmarkKeys.length > 0) {
                errors.push(
                  `item ${itemId} locale ${locale} has unsupported bookmarkFallback fields: ${unknownBookmarkKeys.join(", ")}`,
                )
              }
            }
          }

          if (campaign.actions.apiCredentialProfileFallback !== undefined) {
            if (!isRecord(campaign.actions.apiCredentialProfileFallback)) {
              errors.push(
                `item ${itemId} locale ${locale} apiCredentialProfileFallback action must be an object`,
              )
            } else {
              const unknownCredentialKeys = getUnknownKeys(
                campaign.actions.apiCredentialProfileFallback,
                SPONSOR_API_CREDENTIAL_PROFILE_FALLBACK_ACTION_FIELDS,
              )
              if (unknownCredentialKeys.length > 0) {
                errors.push(
                  `item ${itemId} locale ${locale} has unsupported apiCredentialProfileFallback fields: ${unknownCredentialKeys.join(", ")}`,
                )
              }
            }
          }
        }
      }

      if (campaign.visibility !== undefined) {
        if (!isRecord(campaign.visibility)) {
          errors.push(
            `item ${itemId} locale ${locale} visibility must be an object`,
          )
        } else {
          const unknownVisibilityKeys = getUnknownKeys(
            campaign.visibility,
            SPONSOR_CAMPAIGN_VISIBILITY_FIELDS,
          )
          if (unknownVisibilityKeys.length > 0) {
            errors.push(
              `item ${itemId} locale ${locale} has unsupported visibility fields: ${unknownVisibilityKeys.join(", ")}`,
            )
          }
        }
      }
    })
  })

  return errors
}
