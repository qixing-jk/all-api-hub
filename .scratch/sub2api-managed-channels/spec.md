# Sub2API Managed Channels

Status: resolved

## Decision

Add initial Sub2API managed-site support by treating upstream API-key accounts
as the product's managed channels.

The first implementation supports only the default Sub2API security settings:

- persisted configuration is `base URL + Admin API Key`;
- admin requests authenticate with `x-api-key`;
- `step_up_enabled` is assumed to be `false` (the upstream default);
- API keys may be re-read through the selected-account data export endpoint;
- admin username/password login, JWT sessions, TOTP, and step-up recovery are
  explicitly out of scope.

If a deployment enables step-up and rejects Admin API Key export, the extension
must fail with an explicit permission/unsupported result. It must not silently
fall back to account login or claim that the saved key does not exist.

## Verified upstream contract

Verified against `Wei-Shaw/sub2api` commit
`48eb3766d2da817b171b45bb3036d42575e42b8f` on 2026-08-10.

- Managed resource: `/api/v1/admin/accounts` filtered with `type=apikey`.
- List search: `search` is a case-insensitive substring match on account name;
  URL and key matching must be completed locally from listed/exported data.
- List/detail responses redact sensitive credentials and expose
  `credentials_status.has_api_key` instead.
- Create supports `name`, optional `notes`, `platform`, `type: "apikey"`, and
  credentials with `base_url` and `api_key`.
- Update supports `notes` and merges provided credential keys; an omitted
  `api_key` preserves the existing secret and a supplied value replaces it.
- Delete uses `/api/v1/admin/accounts/:id`.
- Selected raw export uses
  `/api/v1/admin/accounts/data?ids=<id>&include_proxies=false` and returns raw
  credentials when step-up is disabled.

Source:
https://github.com/Wei-Shaw/sub2api/tree/48eb3766d2da817b171b45bb3036d42575e42b8f

## Product scope

- Keep existing Sub2API saved-account support unchanged.
- Make Sub2API selectable as a Managed Site with its own URL and Admin API Key
  settings.
- Support list, name search, create, edit, delete, import, duplicate matching,
  and saved-key second view for API-key accounts.
- Preserve provider-native `platform`, `base_url`, status, priority, and
  concurrency semantics at the adapter boundary.
- Do not route Sub2API through New API request helpers or endpoints.
- Do not add managed-site model sync or redirect support in this slice.
- Do not persist secrets returned by raw export outside the existing transient
  editor/import operation.

## Search and duplicate matching

Server search is used only for display-name search. Import duplicate matching
must inventory `type=apikey` accounts and compare normalized Base URLs locally.
When exact URL+key matching is needed, reveal only the candidate accounts'
keys. A failed reveal is an unknown/verification-required outcome, not a
confirmed non-match.

## Failure history

`archive/wrong-managed-sub2api` targeted the historical
`/api/v1/admin/channels` surface. Current upstream channel management is the
admin API-key account surface above. Reusable configuration, settings, and
registry ideas may be adapted, but its endpoint and payload assumptions must
not be copied.

## Release decisions

- Telemetry: reuse existing managed-site action/result events and add Sub2API
  only to controlled managed-site type values; never record URL or key.
- Settings search: add Sub2API URL/Admin API Key entries and stable anchors.
- E2E: use focused Vitest coverage for registry, config, protocol, search,
  secret reveal, and settings behavior. Add browser E2E only if an extension
  runtime or navigation risk remains after integration.

## Implementation outcome

Implemented the default-security slice with a dedicated Sub2API account
adapter, managed-site settings, local duplicate key hydration, selected-key
reveal, settings search, privacy-safe analytics dimensions, and synchronized
locales. New API model sync and redirect controls are hidden for Sub2API.

Sub2API API-key accounts are registered as provider-native managed resources,
not flattened into the legacy New API channel editor. The native list/detail
projection includes name, platform, Base URL, status, concurrency, priority,
saved-key state, and notes. Create exposes every upstream-supported input in
this slice. Edit keeps platform visible but read-only, supports replacing or
explicitly viewing the saved key, and updates notes plus the other mutable
fields. The editor omits the redundant available-credential status sentence
while retaining the keep-existing guidance and explicit view action. The
existing import entry now uses the shared native managed-channel import seed to
open the same provider-native create editor and mutation functions as native
CRUD. The editor exposes name, platform, status, Base URL, key, optional model
whitelist, concurrency, priority, and notes. It does not discover or select
models automatically: an empty whitelist preserves Sub2API's default of
allowing every upstream model, while an explicit selection writes identity
entries to `credentials.model_mapping`. Before creation, duplicate matching
inventories API-key accounts, filters normalized Base URLs locally, and reveals
only the matching candidates needed to compare keys. Exact URL+key matches are
skipped.

Step-up authentication remains a separately disclosed follow-up.
