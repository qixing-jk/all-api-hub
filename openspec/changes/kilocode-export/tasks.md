## 1. Repo Recon & Planning

- [x] 1.1 Confirm UI entry point location in Key Management token actions (`entrypoints/options/pages/KeyManagement/components/TokenListItem/TokenHeader.tsx`)
- [x] 1.2 Identify reusable UI patterns from existing export dialogs (`components/CliProxyExportDialog.tsx`, `components/CCSwitchExportDialog.tsx`, `components/ClaudeCodeRouterImportDialog.tsx`)
- [x] 1.3 Confirm URL helpers for OpenAI `/v1` normalization (`utils/url.ts`) and id generation helper (`utils/identifier.ts`)

## 2. Types & Pure Export Builder

- [x] 2.1 Define types for Kilo Code/Roo Code settings payload (`providerProfiles.currentApiConfigName`, `providerProfiles.apiConfigs`)
- [x] 2.2 Implement a pure builder that converts selected (account, token) tuples into `providerProfiles.apiConfigs` entries
- [x] 2.3 Implement deterministic profile naming + collision disambiguation rules (per-site vs per-token)
- [x] 2.4 Normalize `openAiBaseUrl` to end with `/v1` without duplicating segments
- [x] 2.5 Ensure builder never logs token keys or full exported JSON

## 3. Token Loading + Token Creation Wiring

- [x] 3.1 Implement per-site lazy token loading using `getApiService(siteType).fetchAccountTokens(...)`
- [x] 3.2 Add per-site loading/error states and retry behavior
- [x] 3.3 Implement “Create default token” action using `ensureAccountApiToken(account, displaySiteData)`
- [x] 3.4 After token creation, refresh token list and preselect newly created token for export

## 4. Export Dialog UI

- [x] 4.1 Create `KiloCodeExportDialog` modal component (`components/KiloCodeExportDialog.tsx`)
- [x] 4.2 Add export mode selector: per-site vs per-token
- [x] 4.3 Implement per-site selection UI: include toggle + token picker per included site (token list loaded on demand)
- [x] 4.4 Implement per-token selection UI: multi-select tokens across sites (token lists loaded on demand)
- [x] 4.5 Add “currentApiConfigName” selector for the downloadable settings file
- [x] 4.6 Add warning copy about plaintext API keys and ensure export actions are disabled when nothing is exportable

## 5. Output Actions (Copy + Download)

- [x] 5.1 Implement “Copy apiConfigs” action using `navigator.clipboard.writeText(JSON.stringify(apiConfigs, null, 2))`
- [x] 5.2 Implement “Download settings” action using Blob download (similar to existing Import/Export download code)
- [x] 5.3 Ensure filename defaults to `kilo-code-settings.json`

## 6. Integrate Into Import/Export Page (later removed; kept for historical tracking)

- [x] 6.1 Add a new “Export Kilo Code JSON” entry in `ExportSection` and wire it to open the dialog
- [x] 6.2 Ensure loading state does not block existing backup exports

## 7. i18n & UX Polish

- [x] 7.1 Add new locale keys in `locales/*/ui.json` (dialog strings) and `locales/*/keyManagement.json` (entry label)
- [x] 7.2 Add user-facing error messages for token fetch/create failures without exposing secrets

## 8. Tests

- [x] 8.1 Add unit tests for the pure export builder (profile naming, collision handling, baseUrl normalization, empty selection behavior)
- [x] 8.2 Add component tests for the dialog critical paths (mode switch, disabled export when empty, token-load error isolation)
- [x] 8.3 Verify existing tests still pass (`pnpm test`)

## 9. Follow-up (Post-feedback)

- [x] 9.1 Move entry point to Key Management token actions and preselect current site/token
- [x] 9.2 Refactor export dialog + builder into shared `components/` and `services/` modules
- [x] 9.3 Add per-API-key model ID selection with upstream default + custom input
- [x] 9.4 Disable export until all selected API keys have a model ID
- [x] 9.5 Remove deprecated Import/Export i18n keys for the removed entry
