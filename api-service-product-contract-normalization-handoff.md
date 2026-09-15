# Handoff: retire ApiToken from product consumer interfaces

Updated: 2026-09-15. Branch: `refactor/export-credential-contract`.

## Outcome

The shared `ApiToken` and `AccountToken` DTOs have been removed. Product workflows
now consume provider-native resources, runtime keys, or export credentials
according to the operation they perform.

This completes the consumer migration discussed after
[PR #1083](https://github.com/qixing-jk/all-api-hub/pull/1083). Its older
`apiService/*` paths are historical context; use the current ownership below.

## Current ownership

All paths in this section are relative to `src/services/`.

| Concern | Contract and owner |
| --- | --- |
| Resource identity, inventory, native editing, provisioning | `apiAdapters/contracts/accountKeyResource.ts` and each provider adapter |
| Runtime identity, secret resolution, model access | `accounts/accountRuntimeKeys.ts`, `accounts/runtimeKeyModelAccess.ts`, and `accounts/utils/apiServiceRequest.ts` |
| Foreground/default key creation | `accounts/accountKeyCreation.ts` |
| Response-only secret disclosure | `accounts/createdRuntimeSecret.ts` |
| External credential export | `integrations/credentialExport.ts` |
| Persistent credential profiles and associations | `apiCredentialProfiles/` |
| New API-family wire records and writes | `apiService/newApiFamily/tokenTypes.ts` |

OpenRouter, New API-family sites, Sub2API, VoAPI v2, and AIHubMix all register
`account.keyResourceManagement`. The transitional `keyResources`, shared
`keyManagement`, and `tokenProvisioning` capabilities are gone. Singleton
providers continue to expose `serviceCredential`.

Account-key resources and managed-site channel resources remain separate
capability families. Registration in one does not imply support in the other.

## Completed migration

- Ordinary Key Management, Copy Key, model-key selection, account post-save
  creation, channel import, default/group provisioning, and Kilo Code creation
  use native inventory and creation results.
- Copy, API/CLI verification, batch verification, managed-site status, and
  credential-profile capture consume runtime keys. They no longer convert
  runtime keys back into token DTOs.
- Cherry Studio, CC Switch, Claude Code Router, Cursor++, and Kilo Code consume
  credential export sources with deferred secret resolution. Existing external
  export identities and formats remain compatible.
- New API-family, Sub2API, VoAPI v2, and AIHubMix own their editor fields and
  write commands. Sub2API retains exact group IDs and total USD quota; VoAPI v2
  retains multiple group IDs and native monetary values.
- Sub2API pricing resolves the selected native resource to its provider-owned
  price group. Generic model-list code no longer interprets token group fields.
- Legacy creation forms, lifecycle helpers, token-only presentation,
  `boolean | ApiToken` creation classification, and runtime-to-token bridges
  have been deleted.

## Behavior that must remain intact

Native facts contain no plaintext secrets. `AccountKeyCreationResult` keeps
nullable `ref`, nullable `facts`, and optional `createdSecret` separate. A confirmed
creation may have a reference without refreshed facts, or only an unattributed
response secret. Retain disclosure in both cases; do not invent resource facts.

Runtime model policy is:

```ts
{
  groups: readonly string[] | null
  allowedModelIds: readonly string[] | null
  suggestedModelIds: readonly string[]
}
```

`null` is unrestricted; an empty array denies access. Suggested model IDs are
selection hints. A bare created reference, or facts without a runtime
projection, cannot authorize unrestricted verification or export.

Creation recovery uses the returned native reference. It must not select a
newer or similarly named unrelated key. Known creation facts and response-only
secrets survive an independent inventory refresh failure.

Prepared creates dispatch at most once. Concurrent default-key callers share
work only when their cancellation and disclosure policies match; other callers
serialize and re-read. Uncertain or unreconciled writes do not trigger automatic
write retries. These guards are transient and retain no response secret.

Copy, model-key, and Kilo workflows reject late results after their source or
dialog session changes. Account authentication replacement invalidates pending
inventory, creation, and export work.

Native Key Management inventory carries its automatic-loading context. Manual
refresh, foreground creation, and resource detail/edit/delete requests carry
user-command context, preserving the existing protected-site fallback policy
and same-site cookie-account isolation.

Diagnostics redact raw and formatted key representations as well as account
and managed-site credentials. Native resource facts, inventory search, logs,
and analytics must not retain response secrets.

## Deliberately preserved compatibility

Historical credential associations and cleanup tasks still store
`account_token` / numeric `tokenId` locators. The locator union and provider
projection of `legacyTokenId` preserve their equivalence to account-scoped
native references. These are stored-data compatibility rules, not a surviving
runtime `AccountToken` variant. Do not delete them without a separate data
migration.

`NewApiToken` and `NewApiTokenWrite` are provider-owned wire types. Existing
protocol endpoint/function names containing “token” remain valid. The migration
does not rename provider wire fields or the product's established
`ModelPricing.model_name`, `model_description`, and `owner_by` vocabulary.

Read `CONTEXT.md` and `docs/agents/site-integrations.md` before expanding provider
contracts. Keep unrelated pricing normalization and storage migration separate.

## Validation

Completed on 2026-09-15:

- Affected Vitest: 132 files and 2,522 tests passed, counting the latest result
  for each file across targeted runs. This is affected-behavior coverage, not a
  full-repository suite.
- Chromium: 46 browser scenarios plus build setup passed. Coverage includes
  native CRUD, response-only secrets, model-to-key creation, credential-profile
  association/navigation, exports, guided import, and linked-channel cleanup.
- Chromium DNR-required variant: both browser scenarios plus build setup
  passed, including same-site cookie/access-token account isolation during
  account refresh and native key inventory loading.
- TypeScript, Knip, formatting, ESLint, and normal `git diff --check` passed.
- Mandatory commit hooks passed staged Vitest, i18n extraction integrity, and
  locale completeness checks. Every secondary locale is 100% complete.
- Extraction removed 34 obsolete translation-key families consistently across
  all eight app locales. The diff contains no added or rewritten translations;
  the removed keys have no remaining source references.
- Shared-contract, deleted-module import, and temporary-diagnostic audits
  passed. Persisted locator compatibility remains intentionally present.

Local evidence is retained under `.scratch/api-token-retirement/`: the Vitest
reports `affected-20.json`, `key-management-23.json`, `remaining-24.json`,
`controller-26.json`, and `controller-27.json`; browser reports `browser-27.json`
and `dnr-26.json`; and `static-27.log`, `compile-29.log`, `diff-check-27.log`, and
`commit-30.log` for the final validation gates. These local artifacts are not
part of the source commit.

Useful contract audit:

```bash
rg -n '\b(ApiToken|CreateTokenRequest|CreateTokenResult|accountRuntimeKeyToLegacyApiToken|accountRuntimeKeyToLegacyAccountToken)\b' src
rg -n 'keyResources|tokenProvisioning|keyManagement' src/services/apiAdapters/contracts/siteTypeCapabilities.ts
```

Both commands should have no matches. Inspect `AccountToken` references
separately: persisted locator compatibility is intentionally retained.
