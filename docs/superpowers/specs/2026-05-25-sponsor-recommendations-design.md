# Sponsor Recommendations Design

Date: 2026-05-25

## Goal

Add a project-controlled sponsor and partner recommendation surface to the
account onboarding flow.

The feature should help users discover recommended service providers when they
need an account, while keeping affiliate conversion reliable and keeping the
extension behavior honest about whether a provider is directly supported.

This is not an advertising SDK. The extension should not load third-party ad
scripts, perform personalized ad targeting, or send account/user input data to
sponsors. The sponsor catalog is curated by the project and consumed as product
configuration.

## Current Context

The account management experience already has several natural entry points:

- `NewcomerSupportCard` appears in the account list empty state and is a strong
  fit for users who do not yet have any accounts.
- Existing users can add another account from the account management header or
  list actions.
- `AccountDialog` is the central add/edit account flow. Add mode currently
  opens with an empty draft and can only use current-tab detection as an
  indirect prefill source.
- The current dialog opener does not accept sponsor-specific prefill data.
- Unsupported-site recovery exists mostly as navigation. The extension can open
  the site support request page, bookmark manager, or API credential profiles
  page, but it cannot currently create a prefilled bookmark or API profile from
  account onboarding.

Because of this, a sponsor surface that only appears in the empty state would
miss existing users, while a sponsor surface that only lives inside the add
dialog would miss the strongest no-account onboarding context.

## Selected Approach

Use a hybrid account-entry design:

1. Upgrade `NewcomerSupportCard` into the primary no-account sponsor onboarding
   entry.
2. Add a sponsor recommendation area to the first phase of the Add Account
   dialog.
3. Keep sponsor content out of the credential form phase.
4. Add a narrow add-account prefill contract for supported sponsors, limited to
   URL and `siteType`.
5. Treat unsupported sponsors as valid recommendations, but present unsupported
   status gently and route fallback guidance through secondary actions.

This keeps the highest-conversion placement for new users, gives existing users
a reachable entry when they intentionally add accounts, and avoids turning the
account list into a persistent promotional surface.

## Non-Goals

- Do not add a third-party advertising SDK.
- Do not add personalized advertising or user profiling.
- Do not add a global "hide sponsor recommendations" setting in the first
  version.
- Do not implement one-click unsupported-site bookmark creation in the first
  version.
- Do not implement one-click API credential profile creation from sponsor cards
  in the first version.
- Do not show sponsor cards inside the credential/token form phase.
- Do not rely on current-tab detection as the sponsor prefill mechanism.

## Sponsor Catalog

Sponsor data should come from a normalized catalog shape. The extension should
ship a bundled snapshot and optionally refresh it from a project-controlled
static JSON endpoint.

Example conceptual shape:

```ts
type SponsorSupportStatus = "supported" | "unsupported"

interface SponsorCatalog {
  schemaVersion: number
  items: SponsorItem[]
}

interface SponsorItem {
  id: string
  enabled: boolean
  rank?: number
  weight?: number
  supportStatus: SponsorSupportStatus
  locales: Record<
    string,
    {
      name: string
      tagline: string
    }
  >
  urls: {
    primaryAffiliate: string
    website?: string
  }
  accountPrefill?: {
    siteType: string
    siteUrl: string
  }
  fallbackHints?: {
    siteSupportRequest?: boolean
    bookmarkManager?: boolean
    apiCredentialProfiles?: boolean
  }
  startsAt?: string
  endsAt?: string
}
```

`supportStatus` is mandatory. The extension should not infer support from URL
patterns or display copy. `accountPrefill` is present only when the extension
can reliably prefill the add-account form for a direct account setup path; it is
not an auto-detection hint.

The remote catalog may influence ordering. Local code remains
responsible for safety filtering, locale fallback, date filtering, URL
validation, and support-status-specific behavior.

## Cloud Update and Offline Fallback

Catalog loading should be best-effort:

1. Load the bundled snapshot immediately.
2. Read the last good cached remote catalog if it exists and passes validation.
3. Fetch the remote static JSON in the background when network is available.
4. Cache only validated remote payloads.
5. Keep using the bundled snapshot when the extension starts offline or the
   remote payload is unavailable, expired, malformed, or unsafe.

The catalog loader should reject entries with invalid IDs, missing localized
fallback copy, unsupported schema versions, disabled entries, invalid dates, or
non-HTTP(S) URLs.

Remote failure must not block account management. It should only reduce the
recommendation set to cached or bundled data.

## UI Placement

### No-Account State

`NewcomerSupportCard` remains a first-class entry. It should be adapted from a
generic onboarding card into a recommendation-aware card:

- Show one or two high-priority sponsors, or a concise entry to view
  recommended providers.
- Keep the primary action conversion-oriented.
- Preserve a clear path to manual account adding for users who already have a
  provider.

This is the strongest placement because the user's current problem is likely
"where do I get an account?"

### Existing Accounts

Do not insert a large persistent sponsor card into normal account rows by
default. Existing users already have management tasks on this page.

Instead, the main sponsor entry for existing users is the Add Account flow. A
small account-management header or add-account-adjacent affordance may point to
recommended providers, but the detailed sponsor content should live in the
Add Account entry phase.

### Add Account Dialog

The first Add Account phase should become an entry phase with two paths:

- Existing/manual path: enter or detect a site URL, then continue through the
  normal account setup flow.
- Recommended provider path: choose a sponsor card, usually opening the
  affiliate registration link first.

Large screens may use a wider dialog and a two-column layout:

- left: manual URL and existing account setup path
- right: compact recommended providers

Small screens should keep manual setup first and show recommendations as a
compact section after it, such as a short list, horizontal list, or collapsible
section. The manual setup action must not be pushed below an excessive sponsor
list.

Sponsor content should not appear in the credential/token form phase. Once a
user is entering credentials, the UI priority is completing account setup.

## Click Strategy

### Supported Sponsors

The primary sponsor action opens the affiliate registration URL. This protects
affiliate conversion and matches the sponsor goal.

Supported sponsor cards may also offer a secondary continuation path after the
user has registered or obtained credentials:

- Continue adding this account.
- Open Add Account with a sponsor prefill.

The prefill should include only:

- `siteUrl`
- `siteType`

`siteType` prevents the extension from guessing the wrong adapter. `siteUrl`
gives the account flow the endpoint context. Site name, auth type, tags, notes,
and other metadata should be detected or entered in the normal flow unless a
later sponsor-specific need justifies more fields.

### Unsupported Sponsors

Unsupported sponsors are still valid recommendations. Their primary action can
open the affiliate or website URL, but unsupported status should be presented as
gentle guidance rather than a failure state.

Recommended copy posture:

- Use a small label such as "Manual setup may be needed" or "Not directly
  supported yet".
- Avoid large warning styling.
- Keep fallback actions secondary.

Fallback guidance should be contextual:

- Site support request when the user wants direct account support added.
- API credential profiles when the user already has a Base URL and API key.
- Bookmark manager when the user only wants to keep a site entry around.

The first version should not promise one-click save behavior for unsupported
sponsors.

## Add Account Prefill Contract

Add Account needs a narrow prefill contract to make supported sponsor
continuation stable.

Conceptually:

```ts
interface AddAccountPrefill {
  siteUrl: string
  siteType: string
  source: "sponsor"
  sponsorId: string
}
```

The dialog state can carry this optional prefill into add mode. The account
dialog should use it to initialize the site URL and selected `siteType`, then
continue through the existing manual or detection flow.

The prefill must not silently create an account. Users still need to provide
credentials and confirm the final account data.

## Internationalization

Sponsor UI copy must use the existing i18n pipeline. Remote catalog localized
fields are sponsor content, while fixed UI labels remain extension locale keys.

Locale behavior:

- Prefer the current extension locale when present in the catalog.
- Fall back to a configured base locale, such as `zh-CN` or `en`.
- Hide a sponsor item if no valid localized name and tagline are available
  after fallback.

Fixed UI labels should cover:

- recommended providers
- supported/unsupported labels
- visit/register CTA
- continue adding account CTA
- fallback guidance labels
- remote catalog error or empty states when visible

## Privacy and Analytics

Recommendations are non-personalized. The extension should not send target
site URLs, account URLs, API keys, user input, account IDs, or sponsor page
domains as analytics payload.

If analytics are added, keep them as anonymous fixed-enum funnel events:

- sponsor impression
- sponsor primary click
- sponsor continuation click
- sponsor fallback click

Allowed event properties:

- sponsor ID
- support status
- surface
- action
- catalog source: bundled, cached, or remote

This may warrant a small privacy documentation clarification that the product
may show non-personalized partner recommendations and, if enabled, collect only
coarse anonymous interaction events. It should not be described as third-party
advertising or personalized ad tracking.

## Error Handling

Catalog and UI failure should degrade safely:

- If the catalog is empty, invalid, or unavailable, hide sponsor
  recommendations and keep normal account adding unchanged.
- If a sponsor URL is invalid, hide that sponsor item.
- If a remote catalog fails validation, keep the previous cache or bundled
  snapshot.
- If Add Account prefill is invalid, fall back to the normal Add Account flow.
- If a browser blocks opening the affiliate tab, keep the user in the current
  flow and show a normal failure message.

Popup behavior needs care because opening external tabs can close the popup.
The design should not depend on returning to the popup after the affiliate tab
opens. Options-page and side-panel contexts can provide richer continuation
controls.

## Testing Strategy

Unit tests should cover:

- catalog validation and normalization
- bundled/cache/remote precedence
- locale fallback
- date and enabled filtering
- URL validation
- support-status mapping
- invalid prefill fallback

Component tests should cover:

- no-account sponsor entry rendering
- Add Account entry phase with and without sponsors
- supported sponsor card actions
- unsupported sponsor card copy and secondary fallback actions
- responsive layout states where practical

Add Account prefill tests should cover:

- initializing URL and `siteType`
- preserving manual user edits after initialization
- falling back when prefill data is invalid

E2E coverage is not mandatory for the first implementation if the behavior is
well-covered by unit and component tests. Add one browser-level test only if
the implementation introduces cross-entrypoint navigation, popup-specific
continuation behavior, or browser-tab behavior that lower-level tests cannot
exercise.

After adding or changing translation keys, run the repository i18n extraction
CI check.

## Open Implementation Notes

- The sponsor catalog storage key should be separate from site announcements.
- Remote refresh can reuse the same general best-effort pattern as existing
  extension update or announcement fetches, but should not share unrelated
  runtime state.
- The Add Account dialog may need a responsive width increase for desktop
  sponsor recommendations. Mobile should remain compact and prioritize manual
  setup.
- Sponsor cards should use existing UI primitives and restrained styling so
  they read as product recommendations rather than external ad units.
