import {
  SPONSOR_SUPPORT_STATUS,
  SPONSOR_VISIBILITY_BROWSER_FAMILIES,
  type RawSponsorLocaleCampaign,
} from "./types"

type StringEnum = Record<string, string>
type RawSponsorCampaignVisibility = NonNullable<
  RawSponsorLocaleCampaign["visibility"]
>

/** Builds a reusable lookup set from a string enum-like constant object. */
function createValueSet(values: StringEnum): ReadonlySet<string> {
  return new Set(Object.values(values))
}

const SPONSOR_CAMPAIGN_VISIBILITY_FIELD = {
  ExtensionVersions: "extensionVersions",
  ExcludedBrowserFamilies: "excludedBrowserFamilies",
} as const satisfies Record<string, keyof RawSponsorCampaignVisibility>

export const SPONSOR_CAMPAIGN_VISIBILITY_FIELDS = createValueSet(
  SPONSOR_CAMPAIGN_VISIBILITY_FIELD,
)

export const SPONSOR_SUPPORT_STATUS_VALUES = createValueSet(
  SPONSOR_SUPPORT_STATUS,
)

export const SPONSOR_VISIBILITY_BROWSER_FAMILY_VALUES = createValueSet(
  SPONSOR_VISIBILITY_BROWSER_FAMILIES,
)
