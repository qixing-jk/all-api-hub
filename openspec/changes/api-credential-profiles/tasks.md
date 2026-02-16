## 1. Repo Recon & Reuse Plan

- [x] 1.1 Review existing key management UI patterns (`entrypoints/options/pages/KeyManagement/*`)
- [x] 1.2 Review existing secret masking + reveal patterns (KeyManagement key display, settings API key reveal)
- [x] 1.3 Review existing verification flows (`components/VerifyApiDialog/*`, `services/aiApiVerification/*`)
- [x] 1.4 Review existing base URL normalization helpers (`utils/webAiApiCheck.ts`, `utils/url.ts`)
- [x] 1.5 Review backup/import + WebDAV sync wiring (`entrypoints/options/pages/ImportExport/utils.ts`, `services/webdav/*`)

## 2. Types, Storage Keys, and Storage Service

- [x] 2.1 Add types for `ApiCredentialProfile` and `ApiCredentialProfilesConfig`
- [x] 2.2 Register new storage keys + locks in `services/storageKeys.ts`
- [x] 2.3 Implement `services/apiCredentialProfilesStorage.ts` with CRUD + normalization + dedupe
- [x] 2.4 Add unit tests for storage CRUD + normalization + dedupe

## 3. Options UI: New Page + Navigation

- [x] 3.1 Add new menu id in `constants/optionsMenuIds.ts`
- [x] 3.2 Add new menu item in `entrypoints/options/constants.ts`
- [x] 3.3 Create `entrypoints/options/pages/ApiCredentialProfiles/` page scaffold (header + empty state)
- [x] 3.4 Add i18n namespaces (`locales/en/apiCredentialProfiles.json`, `locales/zh_CN/apiCredentialProfiles.json`)

## 4. Options UI: CRUD

- [x] 4.1 Implement list rendering with search + apiType filter
- [x] 4.2 Implement add/edit dialog (mask key by default; validate + normalize baseUrl on save)
- [x] 4.3 Implement delete confirmation + toast feedback
- [x] 4.4 Add component tests for the critical CRUD paths

## 5. Verification: Verify Stored Profile

- [x] 5.1 Implement verify modal for a profile using `runApiVerificationProbe` (no account required)
- [x] 5.2 Auto-fetch model ids and use a custom-value picker; still use `models` probe suggestion as fallback (no weird fetch button)
- [x] 5.3 Ensure all errors are sanitized with key redaction
- [x] 5.4 Add unit/component tests for verify modal flows
- [x] 5.5 Web AI API Check: allow saving baseUrl + apiKey to profiles without requiring a test run

## 6. Integration: Key Management “Save to Profiles”

- [x] 6.1 Add a token action button in Key Management to save (account.baseUrl + token.key) as a profile
- [x] 6.2 Ensure key management never logs token keys; show success/error toasts
- [x] 6.3 Add tests where practical (unit tests for mapping + storage calls)

## 7. Backup / Import / WebDAV

- [x] 7.1 Extend V2 backup export to include `apiCredentialProfiles`
- [x] 7.2 Extend import merge logic to merge profiles safely and dedupe by identity
- [x] 7.3 Update WebDAV auto sync export/import to include profiles
- [x] 7.4 Add tests for import/export merge behavior

## 8. Quality Gates

- [x] 8.1 Run `pnpm lint`, `pnpm format:check`, `pnpm compile`
- [x] 8.2 Run `pnpm test` (targeted + CI as needed)

## 9. Shared Tags (Global TagStore)

- [x] 9.1 Replace profile `tags` with global `tagIds` (schema + storage + merge)
- [x] 9.2 Update Options UI to use the existing TagPicker + resolve tag labels for search/list display
- [x] 9.3 Update backup import/export + WebDAV sync to merge tag stores and remap profile `tagIds`
- [x] 9.4 Extend global tag delete semantics to remove deleted ids from API credential profiles
- [x] 9.5 Update tests + rerun quality gates

## 10. Quick Export (Reuse Key Management Integrations)

- [x] 10.1 Add Key-Management-style export actions for profiles (Cherry Studio, CC Switch, Kilo Code, CLIProxyAPI, Claude Code Router, managed site).
- [x] 10.2 Implement a single-profile Kilo Code export dialog for API credential profiles.
- [x] 10.3 Add component tests for export menu + dialog open flows.
- [x] 10.4 Run targeted tests and quality checks for the new export actions.

### Coverage gap & incremental plan

This repo’s current global coverage thresholds are low (see `vitest.config.ts`), so reaching ≥90% overall coverage is not realistic within a single feature.

Incremental plan:

1. Add tests close to new storage/service code and key UI components for this feature.
2. Expand tests around import/export merge logic touched by this change.
3. Raise global coverage thresholds gradually once the suite is stable.

