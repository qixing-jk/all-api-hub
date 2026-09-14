# Handoff: retire ApiToken from product consumer interfaces

Updated: 2026-09-15. First implementation slice:
`refactor/export-credential-contract`.

## Direction

Gradually retire `ApiToken` as the shared input to product workflows. Native
resource management, runtime credential use, and external export need different
interfaces. Renaming the fields of one universal token DTO would preserve the
coupling that this migration is intended to remove.

The original normalization discussion came from
[PR #1083](https://github.com/qixing-jk/all-api-hub/pull/1083), which has since
merged. That PR and its old `apiService/*` paths are historical context. Use the
current source paths below for follow-up work.

Read `CONTEXT.md`, `docs/agents/site-integrations.md`, and
`src/services/apiAdapters/contracts/siteTypeCapabilities.ts` before expanding
the migration.

## Current architecture

Account key resources and managed-site channel resources are separate capability
families. Native managed-site registration does not establish that account key
consumers have migrated.

Account capability registrations currently differ:

| Adapter | Ordinary native key UI | Native key workflow capability | Legacy token capabilities |
| --- | --- | --- | --- |
| OpenRouter | `keyResourceManagement` | `keyResources` | Neither `keyManagement` nor `tokenProvisioning` |
| New API family | Not registered | `keyResources` | `keyManagement`, `tokenProvisioning` |
| Sub2API | Not registered | `keyResources` | `keyManagement`, `tokenProvisioning` |
| VoAPI v2 | Not registered | `keyResources` | `keyManagement`, `tokenProvisioning` |
| AIHubMix | Not registered | Not registered | `keyManagement`, `tokenProvisioning` |

Verify the relevant `src/services/apiAdapters/<adapter>/index.ts` before changing
one of these registrations. `keyResources` is explicitly transitional;
`keyResourceManagement` opts a provider into the ordinary native Key Management
UI. Existing native operations alone are insufficient to switch the UI safely.

Existing interfaces to build on:

- `contracts/accountKeyResource.ts`: scoped opaque resource references, native
  sessions, editing, runtime-key resolution, and provisioning.
- `accounts/accountRuntimeKeys.ts`: runtime keys from legacy account tokens,
  native key resources, and singleton service credentials.
- `apiCredentialProfiles`: standalone usable credentials and persistent links
  to resource locators.
- `accountTokens/tokenProvisioningModel.ts`: the remaining legacy
  `CreateTokenRequest` and `CreateTokenResult = boolean | ApiToken`.

The paths above are relative to `src/services/`.

## Completed first slice: external exports

Cherry Studio, CC Switch, Claude Code Router, and Cursor++ now consume credential
data rather than account/token inventory DTOs:

- `services/integrations/credentialExport.ts` owns `CredentialExportData` and
  `CredentialExportSource`: provider metadata, an opaque selection identity,
  a discovery cache key, and deferred `resolveApiKey()`.
- `services/accounts/utils/credentialExport.ts` adapts real legacy inventory and
  runtime keys. Secret recovery and optional `sk-` formatting stay with account
  code. Exporters that already preferred a usable current secret retain that
  behavior, including creation-only native secrets; runtime consumers that
  resolved the latest secret still do so.
- `services/apiCredentialProfiles/credentialExport.ts` exports a profile's
  stored credential directly. The former
  `features/ApiCredentialProfiles/utils/exportShims.ts` has been removed.
- The three export dialogs, their service entrypoints, and the account,
  key-management, and credential-profile callers use the new interfaces.
- Cherry Studio provider IDs and Cursor++ provider IDs remain compatible with
  previous exports. The old profile ID hash remains solely for exported
  identity compatibility; it no longer creates numeric inventory identities.
- Discovery/action cache identities change with endpoint, key, and account
  authentication inputs. Cursor++ discards a pending copy when those inputs
  change.

The paths in this section are relative to `src/`.

This removes fabricated quota, expiry, user ID, and account-health fields from
profile export adaptation. New credential sources can use the same exporters
without acquiring token-management semantics. Product behavior and exported
formats stay compatible.

## Completed second slice: runtime model policy and verification

Runtime keys expose owner-projected model groups, allowed model IDs, and model
selection hints. API verification, CLI verification, and batch/model selection
consume that policy without interpreting token fields. Hints remain separate
from restrictions; an enabled empty allow-list still denies all models.

Verification services accept an optional fallback model ID instead of token
metadata. The unused token-only batch selector and verification model resolver
have been removed. Native resource keys use the same policy checks directly.

Validation: 12 focused test files / 216 tests, TypeScript, and Knip. Native
inventory and ordinary native key editing remain follow-up work below.

## Remaining migration

### 1. Remove inventory DTOs from remaining read-only consumers

Migrate Kilo Code's account inventory/selection workflow and remaining
verification/model-selection consumers. They should request only the identity,
runtime secret, model availability, or permission information they actually
need. Credential-only consumers can reuse `CredentialExportSource`; resource
management should retain its own native references and capabilities.

Audit these entrypoints:

- `src/components/KiloCodeExportDialog.tsx`
- `src/components/kiloCodeAccountExport.ts`
- `src/components/kiloCodeTokenSelection.ts`
- `src/features/ModelList/components/ModelKeyDialog/`
- `src/features/ModelList/batchVerification.ts`
- `src/features/KeyManagement/utils.ts`

`accountRuntimeKeyToLegacyApiToken` and
`accountRuntimeKeyToLegacyAccountToken` still exist for remaining consumers.
Remove each bridge only after its production callers and behavioral tests have
migrated.

### 2. Complete ordinary native key management per provider

Start with providers that already expose `keyResources`, then implement missing
native support such as AIHubMix. Verify listing, details, editing, deletion,
scope changes, search, and bulk selection before opting a provider into
`keyResourceManagement`.

Retain provider-owned units, expiry rules, restrictions, and mutation outcomes.
Use opaque resource IDs together with their account/site/scope; avoid converting
native IDs into numeric token IDs. Keep unsupported operations explicit.

### 3. Move creation and provisioning onto native results

Reuse native provisioning sessions, resource mutation results, and
`CreatedRuntimeSecret` where their semantics fit. Keep default-key intent and
provider-specific creation rules separate. A replacement universal
`CreateApiToken` command would carry the old coupling into another name.

Migrate `defaultTokenLifecycle`, `tokenQuickCreateResolution`,
`createdTokenSecretHandling`, and Token Provisioning UI together with the
affected adapter's creation behavior. Preserve:

- Confirmed creation with a usable one-time secret.
- Confirmed creation requiring inventory/resource refresh.
- Unavailable or unrecoverable secrets with appropriate recovery paths.
- Writes with uncertain outcomes that require reconciliation rather than an
  automatic retry that could create duplicates.

Delete `boolean | ApiToken` classification and legacy creation contracts once
their consumers no longer depend on them. Earlier removal must not discard
creation-response secrets or provider-specific error behavior.

### 4. Localize or delete the remaining legacy types

After each consumer group migrates, remove its old exports and compatibility
code. Wire DTOs may remain inside the adapters that use that protocol. The goal
is to stop treating `ApiToken` as the product-wide key model.

Persisted credential associations still contain `account_token` / `tokenId`
locators. Preserve their readability and associations until an explicit stored
data migration covers them. A TypeScript rename cannot migrate those links.

## Model pricing scope

`CONTEXT.md` explicitly permits historical New API field names when they have
become product vocabulary. `ModelPricing.model_name`, `model_description`, and
`owner_by` therefore do not by themselves require a bulk camelCase migration.

Keep pricing normalization separate. Change an interface when its semantics or
ownership are misleading, and preserve units, billing rules, display, filtering,
verification, and cache behavior. Do not use a repository-wide absence of
snake_case as the completion criterion.

## Validation

Local verification: 21 focused Vitest files (303 distinct tests) passed across
scoped runs. `pnpm run validate:push` also passed (TypeScript and Knip).

The export slice has focused coverage for payload compatibility, profile export
without account context, masked-secret recovery, creation-only secrets, native
resource identity, credential changes, stale asynchronous actions, and the
affected UI entrypoints.

Focused source-contract tests:

```bash
pnpm exec vitest run tests/services/accounts/credentialExport.test.ts tests/services/apiCredentialProfiles/credentialExport.test.ts tests/services/accounts/apiServiceRequest.test.ts
```

Run affected export service/dialog and caller tests as well. Run
`pnpm run validate:push` for TypeScript and Knip; let the commit hook own
`validate:staged` formatting, lint, staged tests, and i18n checks. Browser or
real-provider evidence is needed for future protocol or UI behavior changes;
this slice does not establish that later native migrations are complete.

Useful follow-up audits:

```bash
rg -n 'ApiToken|CreateTokenRequest|CreateTokenResult|accountRuntimeKeyToLegacy' src
rg -n 'keyResourceManagement|keyResources|keyManagement|tokenProvisioning' src/services/apiAdapters
rg -n 'createExportAccount|createExportToken|createExportRuntimeKey|exportShims' src tests
```

The last query should have no matches. Classify the other matches by consumer,
provider, and persisted compatibility requirements before removing them.
