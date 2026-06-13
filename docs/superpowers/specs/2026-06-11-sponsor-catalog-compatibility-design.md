# Sponsor Catalog Compatibility Design

Date: 2026-06-11

## Goal

Preserve sponsor catalog compatibility for all released extension versions while
moving current source code to a single V4 sponsor catalog contract.

The catalog must support a clean future schema where a sponsor can map to
different campaigns by language or region. Old clients keep reading the frozen
legacy catalog artifact without being forced to parse data they do not
understand.

## Current Context

Before the V4 migration, the sponsor catalog was served from
`public/sponsor-catalog.json` and was also bundled into the extension. Those
released clients accept only their bundled `schemaVersion`; unsupported remote
or cached schemas are rejected and the client falls back to cached or bundled
data.

That strict check is useful as a safety boundary. It also means a breaking
schema must not replace the legacy remote endpoint while old clients still
consume it. The V4 migration therefore adds a new versioned endpoint instead of
mutating `public/sponsor-catalog.json`.

The legacy API credential fallback could only derive the prefilled API base URL
from `websiteUrl ?? primaryAffiliateUrl`. That was sufficient when the provider
website was also the API service origin, but it is not enough for providers
where the campaign landing page, API key console, and OpenAI-compatible API
base URL are three different URLs.

The same ambiguity exists for bookmark fallback. The legacy UI used the same
derived fallback URL for both bookmark creation and API credential profile
creation. That works only when the sponsor website is the right page to save as
a bookmark and the right API base URL to prefill. Those are separate actions
and must have separate V4 fields.

For the immediate release, it is acceptable to use the legacy `website` field
as a tactical API base URL fallback for a sponsor item that only enables
`fallbackHints.apiCredentialProfiles` and does not expose bookmark fallback or
other website-navigation behavior. This is a compatibility workaround, not the
long-term field meaning. Future schema work should replace it with an explicit
API credential prefill field.

## Final Selected Approach

Use a V4-only runtime model:

1. Keep `public/sponsor-catalog.json` as the legacy stable endpoint.
2. Add `public/sponsor-catalog.v4.json` as the current client endpoint and
   bundled catalog.
3. Make current source import, validate, cache, and render V4 only.
4. Remove runtime V3 fallback and manifest negotiation from current source.
5. Keep future incompatible schema changes on new versioned JSON files, for
   example `sponsor-catalog.v5.json`, instead of changing V4 in place.

Old clients continue to read only `public/sponsor-catalog.json`. Current
clients read only the V4 artifact. This avoids maintaining two active runtime
contracts in source while still preserving the deployed V3 public artifact for
released versions.

## Endpoint Contract

`public/sponsor-catalog.json` is the compatibility baseline. It should keep the
current legacy shape and only receive changes that old clients can safely ignore
or safely reject item-by-item.

`public/sponsor-catalog.v4.json` is the current endpoint. It must use
`schemaVersion: 4` and the locale-campaign schema below. The extension should
also bundle this V4 file so bundled fallback has the same contract as the
remote path.

- There is no `sponsor-catalog-manifest.json` in the current design.
- Current clients should not fetch `public/sponsor-catalog.json`.
- Current clients should not parse V3 JSON as a V4 input.
- Remote V4 payloads are cached only after V4 validation succeeds.
- Cache writes are best-effort after validation. Failure to persist a validated
  remote catalog must not make that catalog fail selection for the current load.

## V4 Locale Campaign Schema

V4 should treat each locale entry as a complete campaign. The top-level sponsor
item only owns the stable `id`; every other field is locale-specific. This
avoids field-level inheritance and makes it explicit when a language uses a
different landing page, affiliate project, supported flow, or API endpoint.

```json
{
  "schemaVersion": 4,
  "items": [
    {
      "id": "example-provider",
      "locales": {
        "zh-CN": {
          "enabled": true,
          "rank": 90,
          "startsAt": "2026-06-01T00:00:00.000Z",
          "endsAt": "2026-07-01T00:00:00.000Z",
          "supportStatus": "unsupported",
          "name": "示例服务商",
          "tagline": "示例中文投放文案。",
          "postClickNote": "示例中文活动提示。",
          "links": {
            "primary": "https://zh.example.invalid/campaign"
          },
          "actions": {
            "apiCredentialProfileFallback": {
              "baseUrl": "https://api.zh.example.invalid/v1",
              "apiKeyCreateUrl": "https://console.zh.example.invalid/api-keys"
            }
          }
        },
        "en": {
          "enabled": true,
          "rank": 90,
          "supportStatus": "unsupported",
          "name": "Example Provider",
          "tagline": "Example English campaign copy.",
          "postClickNote": "Example English campaign note.",
          "links": {
            "primary": "https://en.example.invalid/campaign"
          },
          "actions": {
            "bookmarkFallback": {
              "url": "https://docs.en.example.invalid/get-started"
            },
            "apiCredentialProfileFallback": {
              "baseUrl": "https://api.en.example.invalid/v1",
              "apiKeyCreateUrl": "https://console.en.example.invalid/api-keys"
            }
          }
        }
      }
    }
  ]
}
```

The logical shape is:

```ts
interface SponsorCatalogV4 {
  schemaVersion: 4
  items: SponsorCatalogItemV4[]
}

interface SponsorCatalogItemV4 {
  id: string
  locales: Record<string, SponsorLocaleCampaignV4>
}

interface SponsorLocaleCampaignV4 {
  enabled: boolean
  rank: number
  supportStatus: "supported" | "unsupported"
  startsAt?: string
  endsAt?: string
  name: string
  tagline: string
  postClickNote?: string
  links: SponsorCampaignLinksV4
  actions?: SponsorCampaignActionsV4
}

interface SponsorCampaignLinksV4 {
  primary: string
}

interface SponsorCampaignActionsV4 {
  addAccount?: {
    siteType: string
    siteUrl: string
    authType?: string
  }
  bookmarkFallback?: {
    url: string
  }
  apiCredentialProfileFallback?: {
    baseUrl: string
    apiKeyCreateUrl?: string
    apiKeyCreateHint?: string
  }
}
```

## V4 Field Semantics

- `id`: the only cross-locale sponsor identity. It is used for analytics,
  deduplication, tie-break sorting, and stable references.
- `locales`: campaign records keyed by BCP-47-like locale strings. Each record
  is complete and validated independently.
- `enabled`: whether this locale campaign can be shown.
- `rank`: locale-specific sort priority. Items sort by campaign `rank`, then
  top-level `id`.
- `startsAt` / `endsAt`: optional locale campaign activation window.
- `supportStatus`: visible support label for this locale campaign.
- `name`, `tagline`, `postClickNote`: sponsor-provided campaign copy.
- `links.primary`: required primary click target for visit-provider and
  attribution behavior.
- `actions.addAccount`: optional add-account prefill action. Presence of this
  action means the recommendation can drive the add-account flow.
- `actions.bookmarkFallback`: optional bookmark fallback action. Presence of
  this action means the bookmark fallback button can be shown.
- `actions.apiCredentialProfileFallback`: optional API credential profile
  fallback action. Presence of this action means the API credential fallback
  button can be shown.

V4 does not need `fallbackHints`. UI availability comes from the presence of an
action object. V4 also does not need `urls.website` or a replacement home-page
field in the first schema version; each visible action owns its own parameters.

`supportStatus` is display metadata, not a capability switch. The presence of
an action object decides whether that action can be shown. This allows a locale
campaign to be marked `unsupported` while still exposing fallback actions such
as bookmark creation or API credential profile prefill.

Action handling should keep navigation and action data separate:

- `links.primary` is the sponsor's primary visit or attribution target.
- `actions.addAccount` provides only the add-account prefill parameters.
- `actions.bookmarkFallback.url` provides the URL to save as a bookmark.
- `actions.apiCredentialProfileFallback.baseUrl` provides the API base URL to
  prefill in an API credential profile.

If a UI flow needs to open the primary sponsor link for attribution before
continuing an action, it should still read that URL from `links.primary`. It
must not derive action parameters from `links.primary`.

## V4 Normalization

The normalization rule is:

1. Build the locale candidate list using the existing locale fallback order.
2. Iterate candidates and validate each candidate campaign as a complete
   record.
3. Select the first complete valid campaign.
4. Skip the item if no valid campaign exists for the requested locale or any
   fallback locale.
5. Expose only normalized UI-ready fields to components.

Locale fallback happens before action availability is evaluated. Once a
complete campaign is selected, missing optional actions hide only those actions.
They do not trigger fallback to another locale campaign. If `en` is the selected
campaign and lacks `apiCredentialProfileFallback`, the UI must not borrow that
action from `zh-CN`.

The normalized v4 UI shape should expose explicit action objects instead of the
v3-derived `websiteUrl ?? primaryAffiliateUrl` fallback. Components should see
stable identity and display fields, `links.primary`, selected-locale metadata,
and optional action payloads. Current source should not expose legacy V3 bridge
fields in `SponsorRecommendation`.

## Manual V3-To-V4 Authoring Notes

These notes are for maintainers writing a future v4 catalog from existing v3
data. They are not runtime migration rules, and v4 clients should not parse v3
JSON as a v4 input.

- v3 `urls.primaryAffiliate` maps conceptually to v4 `links.primary`.
- v3 `accountPrefill` maps conceptually to v4 `actions.addAccount` when the
  prefill is still valid for the selected locale campaign.
- v3 `fallbackHints.bookmarkManager: true` does not automatically become
  `actions.bookmarkFallback`. The v4 action requires an explicit safe bookmark
  URL.
- v3 `fallbackHints.apiCredentialProfiles: true` does not automatically become
  `actions.apiCredentialProfileFallback`. The v4 action requires an explicit
  API base URL.
- v3 `urls.apiKeyCreate` can be used as the source for
  `actions.apiCredentialProfileFallback.apiKeyCreateUrl` when it is still
  accurate for the selected locale campaign.
- v3 `urls.website` has no direct v4 field in this schema. It may help humans
  decide an action URL, but clients must not treat it as a generic fallback for
  bookmark URLs, API base URLs, or primary campaign links.

## Compatibility Rules

- Old clients read only `public/sponsor-catalog.json`.
- Current clients read only `public/sponsor-catalog.v4.json` and bundled V4
  data.
- Remote payloads are cached only after V4 validation succeeds.
- Versioned catalog caches must be schema-discriminated by at least schema
  version and source URL. A validated V4 payload must never be read as a legacy
  V3 payload, and legacy V3 cache records must not be read by the current V4
  loader.
- Catalog loading should use one ordered fallback sequence:
  1. Try the remote V4 catalog.
  2. If remote fetch or validation fails, try a still-valid cache entry for
     `(schemaVersion: 4, sourceUrl: V4 remote URL)`.
  3. If cache is unavailable or invalid, use bundled V4 data.
- A breaking schema must not be published at the legacy endpoint.
- Legacy-compatible tactical fields must be narrowly documented in the catalog
  or follow-up spec. For example, using `website` as an API base URL is allowed
  only as a temporary v3 release workaround until v4 action-specific fields are
  available in the supported client path.
- V4 action-specific fields must not be nested inside legacy `fallbackHints`.
  The presence of an action object decides which action appears and provides
  the action parameters.

## Validation

Each schema version owns its own validator. Shared validation rules should still
apply after version-specific normalization:

- Sponsor IDs are opaque stable identifiers. They must be non-empty, trimmed,
  reasonably short, and safe for analytics, cache keys, tests, and deterministic
  sorting. Lowercase slug-style IDs are preferred, but validators must not infer
  business meaning from the ID.
- The top-level item must not contain campaign fields other than `id` and
  `locales`.
- Unknown top-level item fields should be rejected in v4. Unknown locale
  campaign fields should be rejected unless the validator intentionally reserves
  a namespaced extension point in a future schema.
- Each locale campaign must provide valid `enabled`, `rank`, `supportStatus`,
  `name`, `tagline`, and `links.primary` values before it can be selected.
- All link and action URL fields must be HTTP(S).
- `actions.addAccount.siteType` and `actions.addAccount.authType` must pass the
  same compatibility validation used by the current add-account prefill path.
- Disabled, expired, or malformed locale campaigns must not reach the UI.
- Locale fallback must select a whole valid campaign. It must not borrow missing
  fields from another locale campaign.

## Testing Strategy

Focused tests should cover:

- remote V4, cache V4, and bundled V4 fallback order
- rejection of V3, missing-schema, or unsupported-schema payloads in the current
  loader
- absence of `public/sponsor-catalog-manifest.json`
- preservation of `public/sponsor-catalog.json` as a valid legacy artifact for
  old clients
- rejection of unsupported schema versions
- rejection when a v4 item contains top-level campaign fields other than `id`
  and `locales`
- locale campaign fallback order selects a whole valid campaign
- missing optional actions on the selected campaign do not trigger fallback to
  another locale campaign
- missing action objects hide the corresponding UI actions
- `supportStatus` does not hide or show actions by itself
- `actions.addAccount` produces the same add-account prefill payload shape that
  UI handlers already understand
- `actions.bookmarkFallback.url` is used for bookmark fallback
- `actions.apiCredentialProfileFallback.baseUrl` is used for API credential
  fallback
- action handlers do not derive bookmark URLs or API base URLs from
  `links.primary`
- invalid link or action URLs reject the affected locale campaign
- cache writes only after schema-specific validation succeeds
- legacy and V4 catalog caches cannot be read as each other

No E2E coverage is required for the protocol design itself unless a future
implementation changes browser-level navigation or cross-entrypoint behavior.
