# Internal Unified API Guidance Design

Date: 2026-06-22

## Purpose

Help users who want one externally callable API endpoint understand the
supported All API Hub path:

1. All API Hub does not host, proxy, or expose a plugin-owned unified API.
2. A configured managed site, such as a self-hosted New API-compatible gateway,
   is the external API endpoint.
3. All API Hub acts as the local account and gateway configuration hub: it
   discovers, validates, organizes, imports, and helps maintain full account
   sources and lightweight API credential profiles (tokens / API keys) so the
   managed site can be configured as the unified runtime endpoint.

The guidance should make that boundary obvious while still showing the product
value: users can combine account-backed tokens and saved API credentials
instead of manually copying scattered upstream credentials into their gateway
one by one.

## Current Context

The product already has the functional pieces for this path, but they are
presented as separate tools:

- `src/features/OptionsOverview/` has a configuration overview model with
  account, credential, and managed-site groups.
- `src/features/AccountManagement/AccountManagement.tsx` is the primary page
  for adding and managing site accounts.
- `src/features/AccountManagement/components/NewcomerSupportCard.tsx` appears
  when no accounts exist and already routes users toward docs, sponsors,
  account creation, bookmarks, and API credential profiles.
- `src/features/ApiCredentialProfiles/ApiCredentialProfiles.tsx` stores
  lightweight API credential profiles for verification, model lookup, and reuse
  without adding a full account.
- `src/features/AccountManagement/components/CopyKeyDialog/TokenDetails.tsx`
  already exposes per-token import-to-managed-site actions.
- `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.tsx`
  already supports importing selected account tokens into a managed site.
- `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx` manages channels
  on the configured managed site.
- `src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx` supports model
  sync for managed sites that can use it.
- The Account Dialog already has a managed-site configuration prompt when a
  post-save account-to-channel shortcut needs managed-site settings first.

The external README and docs already mention multi-account management and
self-hosted site management. The gap is inside the extension UI: users can see
the pieces but may not understand the route from third-party accounts to a
single self-hosted API gateway.

## Problem

Users who ask for a "unified API" can infer the wrong product boundary:

- They may expect the extension itself to expose an HTTP API endpoint.
- They may not realize that the managed site is the runtime gateway.
- They may not understand how account management, API credential profiles,
  key management, managed-site channel import, and optional model sync relate.
- Existing buttons such as "Import to managed site" are useful once discovered,
  but they do not provide a state-aware path from "I need one API endpoint" to
  "my self-hosted gateway has channels configured."

Adding a few words to page descriptions would reduce confusion, but it would
not guide users through the next action from their current state.

## Product Boundary

The UI must consistently communicate this boundary:

- All API Hub is not an API gateway.
- All API Hub does not accept external model requests.
- All API Hub does not issue one plugin-owned runtime credential.
- The configured managed site is the external unified API endpoint.
- All API Hub helps build and maintain that gateway setup by collecting source
  accounts/API credentials, validating them, importing account tokens or saved
  credentials as channels, and providing related maintenance shortcuts.

Avoid copy such as "All API Hub provides a unified API" or "use the extension
as your API endpoint." Prefer copy such as "Use your managed site as the
gateway; All API Hub helps prepare and import the sources."

## Goals

- Add a lightweight internal guidance path for users who need one unified API
  endpoint.
- Make the extension's role explicit: account-token and API-credential
  organization, validation, import, and maintenance.
- Present managed-site import and direct tool export as sibling destinations,
  not as steps in the same path.
- Treat model sync as an optional managed-site maintenance enhancement, not as
  a prerequisite for unified API usage.
- Reuse existing Options, Account Management, API Credential Profiles,
  Key Management, Managed Site Channels, and Managed Site Model Sync patterns.
- Keep the first implementation narrow enough for focused component/unit tests.
- Preserve existing behavior and public contracts.

## Non-Goals

- Do not build a runtime API proxy, local HTTP server, cloud relay, or extension
  API endpoint.
- Do not make model sync mandatory in the guidance flow.
- Do not put direct client-tool export inside the self-hosted gateway path.
- Do not redesign managed-site settings, provider registration, channel CRUD,
  model sync internals, or account/key lifecycle behavior.
- Do not add a large first-run wizard or marketing-style landing page.
- Do not add a new dependency.
- Do not add Playwright E2E coverage by default unless implementation later
  introduces browser-only navigation behavior that unit/component tests cannot
  cover.

## Recommended Approach

Add a small reusable "Unified API path" guidance model and render it in the
places where it helps users choose the next action.

The guidance should behave like a status-aware task path, not a static
paragraph. It should answer:

- What does All API Hub do here?
- What provides the final unified API endpoint?
- What is my next step?
- Is model sync optional?
- Is direct tool export a separate destination?

### Path Shape

Main managed-site path:

```text
Full account sources
  -> All API Hub validates, organizes, and maintains account tokens
  -> Import selected account tokens into managed-site channels
  -> The managed site exposes the runtime endpoint and calling credential

API credential profiles
  -> All API Hub stores and verifies lightweight API credentials
  -> Import an individual profile into a managed-site channel when useful
  -> The managed site exposes the runtime endpoint and calling credential
```

Sibling direct-tool destination:

```text
Account/API credential sources
  -> Export or copy directly to supported tools
```

Optional managed-site maintenance:

```text
Managed-site channels exist
  -> Model sync may help keep model lists, mappings, or routing consistent
```

## Guidance State Model

Introduce a UI-facing helper, likely under `src/features/UnifiedApiGuidance/`
or a similarly narrow feature folder, that derives a compact status from
existing local state.

Suggested statuses:

- `needs_sources`: no usable account and no API credential profile exists.
- `needs_managed_site`: at least one source exists, but no supported managed
  site is configured.
- `ready_to_import`: sources exist and a managed site is configured. The
  recommended action should reflect the available source kind:
  account-backed tokens route toward Key Management import, while profile-only
  setups route toward API Credential Profiles.
- `has_gateway_channels`: managed-site channels are loaded and at least one
  channel exists. If reliable channel-count data is not cheap on the first
  slice, this can be deferred; the channel page should be treated as
  `ready_to_import` or `manage_channels` until actual channel data is available.
- `optional_model_sync`: managed site supports model sync and channel import is
  already plausible. This should never block the main path.

The helper should return:

- headline key;
- short description key;
- source-kind summary, distinguishing account-backed sources, profile-backed
  sources, or both;
- primary action target;
- optional secondary action targets;
- boundary note key that states the plugin is not the API endpoint.

Do not duplicate route strings. Use existing `MENU_ITEM_IDS`, settings anchors,
and navigation helpers where possible.

## Surface Design

### Options Overview

Add the primary entry point in Overview because it is already the setup and
status workbench.

Preferred shape:

- Add a new compact widget or a new action-center group only if it fits the
  existing Overview layout without crowding.
- The card headline should be about the user task, for example "Need one API
  endpoint?"
- The description should explicitly name the boundary: the managed site
  provides the endpoint; All API Hub prepares and imports the sources.
- The primary button should follow the current status:
  - no sources: "Add account", with "Add API credential" as a complementary
    secondary action;
  - missing managed-site config: "Configure managed site";
  - ready with account-backed tokens: "Import to managed site";
  - ready with only API credential profiles: "Open API credential profiles";
  - channel-management context: "Manage channels";
  - optional enhancement: "Open model sync" as a secondary action only.

If the existing action center is used, do not make model sync contribute to the
managed-site group's readiness in a way that implies unified API setup is
incomplete without it. Model sync can remain visible as an optional sub-item.

### Account Management

Add a lightweight guidance block near the header or empty/newcomer state:

- For users with no accounts, tell them adding accounts creates the source
  inventory that can later be imported into a managed site.
- For users with accounts and no managed-site config, route to managed-site
  settings.
- For users with accounts and managed-site config, route to key management or a
  managed-site import action.

Do not hide or demote existing account-management operations. This is an
orientation aid, not a replacement for the account list.

### Account Detection Failure Recovery

When automatic account detection cannot identify a manageable account, use API
Credential Profiles as the main continuation path when the user may still have
usable API credentials.

Recommended recovery copy shape:

- Title: "Could not identify a manageable account yet."
- Description: "If you already have this site's API credentials (token / API
  key), save them to the credential library for verification, reuse, export, or
  managed-site setup."
- Primary action: "Save API credential" / "Open API credential library".
- Secondary action: "Request site support" or the existing support-issue flow.

The copy should present the credential library as its own useful way to keep
working, not only as an error fallback. Do not default to manual account
creation when the failure means the site structure, login state, or account API
could not be recognized; manual entry is only appropriate when the current site
type is known to support full account management and the failure looks like a
temporary page/login context problem.

### API Credential Profiles

Clarify API credential profiles as lightweight sources that complement full
accounts:

- On first mention in a guidance surface, explain the term as "API credentials
  (token / API key)" so users can map it to backend wording such as New API
  tokens or Sub2API API keys.
- They are useful when the user already has a callable API credential, wants
  quick verification and reuse, or does not need a full site account entry for
  that source.
- They should be presented beside account-backed sources as another way to
  prepare upstream credentials for direct tool export or managed-site channel
  import.
- The copy should describe the difference by action shape rather than by
  limitation: account-backed tokens use Key Management and batch-oriented
  import surfaces; API credential profiles use the profile list and per-profile
  import/reuse actions.
- When both source types exist, guidance should describe them as complementary:
  accounts are the managed inventory for sites, while profiles are saved
  portable credentials for verification, direct tool export, and individual
  managed-site channel setup.

### Key Management And Token Details

Use existing import-to-managed-site actions as the most concrete bridge:

- Add short assistive copy near batch import or token import surfaces:
  "Import these keys into your managed site channels. The managed site is what
  external tools call as the unified API."
- Keep direct client-tool export beside it as a sibling action. Avoid implying
  "export to tool" completes the managed-site gateway path.

### Managed Site Channels

Make this the main landing surface for the unified API path after setup:

- Header or empty/config-missing state should say this page manages the
  channels that make the managed site act as the unified gateway.
- Config-missing state should route to managed-site settings.
- Empty state should route to account/key import if supported, or explain that
  channels must be created/imported first.
- Existing channel table and migration/import behavior should remain the main
  work surface.

### Managed Site Model Sync

Adjust guidance only enough to avoid prerequisite confusion:

- Describe model sync as optional maintenance for supported managed sites.
- Explain that it helps keep model lists, mappings, or routing aligned after
  channels exist.
- Do not use copy that says model sync is required before the managed site can
  provide a unified API.

## Copy Principles

- Lead with the user's job: "need one API endpoint" or "use a self-hosted
  gateway."
- Name the runtime provider: "your managed site" or the selected managed-site
  label.
- Name All API Hub's role as action-oriented verbs: detect, validate, organize,
  import, locate, maintain.
- Treat "API credential" as the product-level term, but explain it on first use
  as "token / API key" in guidance surfaces where users may not know the term.
- Use backend-specific words only in backend-specific contexts; generic unified
  API guidance should not force a New API vs Sub2API naming choice.
- Keep the boundary note short and repeat it only where confusion is likely.
- Use "optional" for model sync.
- Use "separate path" language for direct client-tool export when both actions
  are visible.
- Avoid claiming external backend behavior that the repo cannot verify.

## Data Flow

The first implementation should use already available local state:

- enabled account count and account list from Overview/account contexts;
- API credential profile count from existing profile storage/controller data;
- managed-site type and config readiness from user preferences and
  `hasValidManagedSiteConfig(...)`;
- managed-site model-sync support from existing support helpers;
- route targets from existing `MENU_ITEM_IDS`, settings anchors, and
  navigation helpers.

Channel-count awareness should be added only if there is a cheap existing
source. Do not introduce background channel loading solely for the guidance
card in the first slice.

## Error And Empty States

- If preferences fail to load, do not guess managed-site readiness. Fall back to
  a neutral description and route to managed-site settings.
- If accounts or API credential profiles cannot be loaded, keep the guidance
  visible but avoid status claims about source availability.
- If the selected managed site does not support a specific import, channel
  lookup, or model-sync enhancement, show the existing unsupported state and
  do not present the action as the recommended next step.
- If model sync is unsupported, omit it or label it unavailable as an optional
  enhancement; never block the main path.

## Telemetry Decision

Add or reuse action telemetry for the guidance card because it introduces a new
user-visible navigation path. The event should record only controlled enums:

- guidance status;
- clicked action kind;
- source surface;
- managed-site type as the existing sanitized managed-site enum if already
  available.

Do not record URLs, keys, account names, raw backend messages, channel IDs, or
user-entered text.

If implementation reuses existing navigation analytics without new event fields,
document that as `reuse existing` in the final handoff.

## Settings Search And Deep Links

If implementation adds only inline guidance and uses existing destinations, no
new settings search target is required.

If implementation adds a new targetable section or anchor, update:

- rendered DOM `id`;
- settings search definition;
- `searchTargets.ts`;
- `ANCHOR_TO_TAB` or equivalent anchor routing.

Prefer exported target-id constants if new anchors are introduced.

## Testing Strategy

Focused tests should cover the state model and rendering decisions:

- no sources -> add account/API credential next action;
- sources but no managed-site config -> configure managed site next action;
- account-backed sources and managed-site config -> Key Management import or
  channel management next action;
- only API credential profiles and managed-site config -> API Credential
  Profiles next action, with copy that frames profiles as complementary
  lightweight sources;
- both account-backed sources and API credential profiles -> primary account
  token import action plus API credential profile as a secondary/complementary
  action;
- model sync supported -> optional secondary action appears;
- model sync unsupported -> optional action is absent or clearly unavailable;
- direct tool export is not described as a step in the managed-site gateway
  path;
- boundary copy does not imply the extension itself exposes an API endpoint.
- account detection failure recovery presents API Credential Profiles as the
  primary continuation path and site-support feedback as the secondary path,
  without defaulting to manual account creation.

Use Vitest/React Testing Library for state helpers and components. Add
Playwright only if the implementation creates a browser-only cross-entrypoint
navigation behavior that cannot be verified through component tests.

## Validation

Expected validation for an implementation slice:

- focused Vitest suites for the new guidance helper/component;
- related component tests for touched pages;
- `pnpm run i18n:extract:ci` if locale keys change;
- `pnpm run validate:staged` before commit;
- `pnpm run validate:push` only if shared contracts, exports, or repo structure
  change broadly.

## Open Implementation Notes

- The first implementation can keep the guidance card read-only with
  navigation actions. It does not need to perform channel import directly.
- API credential profile guidance should point to the existing profile list and
  per-profile import/reuse actions. New batch profile import or profile
  lifecycle automation should be a separate implementation slice.
- Account detection failure guidance should be recovery copy and navigation
  only. It should not change the auto-detection algorithm or add a new manual
  account fallback flow in the first slice.
- Channel-count detection should be deferred unless current page state already
  has it.
- The Overview managed-site configuration summary may need wording changes so
  model sync is not interpreted as required setup.

## Follow-up: Managed-site channel onboarding and upstream shortcuts

The managed-site channels page should distinguish two onboarding states rather
than combining their guidance:

- When the selected managed site is not configured, show only the existing
  configuration-required state and its settings action.
- When configuration exists but the initial unfiltered channel list is empty,
  show the existing source-import guidance for Key Management and API
  Credential Profiles.

Once managed-site configuration exists, the page title actions should keep the
settings shortcut in its established first position and append a compact
shortcut that opens the selected gateway's own channel-management surface. The
shortcut should reuse `WorkflowTransitionIcon`, with tooltip and accessible
name copy that explicitly says it opens gateway channel management. It should
not become a full-width page-header button.

The upstream channel route is a managed-site capability fact and should be
centralized by `ManagedSiteType`, rather than duplicated in UI components:

- `new-api`: `/channels`
- `Veloera`: `/admin/channels`
- `done-hub`: `/panel/channel`
- `octopus`: `/model`
- `axonhub`: `/channels`
- `claude-code-hub`: `/settings/providers`

Join these paths to the configured managed-site base URL without duplicating
slashes. If no verified route exists for a future managed-site type, open the
configured site root instead of guessing a path. The UI should describe the
Claude Code Hub destination as provider management where backend-specific copy
is available, while the generic action may continue to use the product term
"gateway channel management."

Client integration remains secondary on this page. A short, non-blocking note
may explain that external clients also need a gateway-issued calling key and
an OpenAI-compatible API address. A text-level "open token management" action
may use these verified routes without competing with the channel shortcut:

- `new-api`: `/keys`
- `Veloera`: `/app/tokens`
- `done-hub`: `/panel/token`
- `octopus`: `/keys`
- `axonhub`: `/api-keys`
- `claude-code-hub`: `/dashboard/users`

Do not add client-integration actions to the batch-import completion dialog.
API Credential Profiles should instead add lightweight copy explaining that a
configured gateway can be selected from each profile's existing more-actions
menu; it should not add another prominent card-level action.

## Follow-up: Partial-data honesty and permission separation

Overview guidance must distinguish an empty source inventory from source data
that could not be loaded. A source-availability conclusion is reliable only
when accounts, API credential profiles, and managed-site preferences all load
successfully. If any of those critical inputs are unavailable:

- Keep independently loaded Overview widgets usable instead of replacing the
  whole page with a fatal state.
- Render the unified API guidance slot as a neutral, retryable
  "status unconfirmed" state. Do not claim that the user has no sources or
  recommend source-creation actions from fallback empty arrays.
- Render unavailable account or credential summary values as unknown and
  suppress setup-attention items that depend on the missing inventory.
- Preserve the partial-load error and retry action so the user can recover.

Retry controls should retain focus while a refresh is in progress and expose
busy/disabled semantics without replacing or natively disabling the focused
button.

Global optional browser permissions are not part of unified API readiness and
must not be rendered inside the unified API guidance card. Those permissions
serve unrelated enhancements such as cookie-assisted browser flows,
notifications, clipboard access, or bookmark import. Keep permission education
in the existing first-use onboarding, permission settings, or the specific
feature action that needs a permission. A permission-status check failure may
still remain unknown rather than being converted to denied, but that shared
permission-controller behavior is outside this guidance model.

## Acceptance Criteria

- Users can understand from inside the extension that All API Hub is not the
  external unified API provider.
- Users can see the supported path for a unified API: configure a managed site,
  import account/API-credential sources as channels, and call the managed site.
- Users can understand API credential profiles as a complementary lightweight
  source path beside full account management.
- Users who hit account detection failure can continue by saving API
  credentials, while still having a clear path to request site support.
- Users can distinguish managed-site import from direct client-tool export.
- Model sync is presented only as an optional managed-site maintenance
  enhancement.
- The guidance surfaces provide actionable next-step navigation based on local
  setup state.
- Partial local-store failures never turn unknown account or credential data
  into a "no sources" conclusion, while independently available Overview data
  remains usable and retryable.
- Unrelated optional browser permissions do not appear as unified API setup
  requirements or readiness warnings.
- Existing account, key, managed-site channel, model-sync, and export behavior
  remain unchanged unless a later implementation plan explicitly changes them.
