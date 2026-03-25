## 1. Recon And Shared Reuse

- [x] 1.1 Inspect and confirm the existing reuse points in `src/features/ModelList/hooks/useModelData.ts`, `src/features/ModelList/components/StatusIndicator.tsx`, `src/features/ModelList/modelManagementSources.ts`, `src/services/apiCredentialProfiles/modelCatalog.ts`, `src/services/accounts/utils/apiServiceRequest.ts`, and `src/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog.ts` before editing.
- [x] 1.2 Extend or extract a narrow shared helper for account-token fallback loading so token inventory fetch, secret resolution, and minimal catalog building are reused instead of duplicated.

## 2. Account Fallback Flow

- [x] 2.1 Extend the single-account Model Management data flow to track retryable account-load failures, transient selected-key fallback state, and fallback reset when the source changes or a direct account reload succeeds.
- [x] 2.2 Implement the account-key fallback UI in the Model List error path so users can load tokens on demand, choose a key explicitly, retry fallback requests, and see redacted fallback errors.
- [x] 2.3 Overlay fallback-active capability handling so key-backed catalogs hide pricing, ratio, group, and account-summary affordances while keeping the owning account context intact.
- [x] 2.4 Add brief clarifying comments around non-obvious fallback reset and capability-downgrade logic.

## 3. Coverage And Copy

- [x] 3.1 Add or update targeted automated tests for single-account load failure fallback, key selection behavior, normalized fallback catalog rendering, and fallback-state reset or redacted error handling.
- [x] 3.2 Update `modelList` locale strings for the fallback action labels, helper text, and failure states introduced by the new account-key recovery flow.

## 4. Verification

- [x] 4.1 Run `pnpm lint`.
- [x] 4.2 Run the repo's pre-commit-equivalent affected validation flow for the touched files with `pnpm run validate:staged`, or document the blocker if staged-file setup prevents an equivalent run.
- [x] 4.3 Run the smallest related automated test command for the touched behavior, preferring the repo-native `vitest related --run` path or the closest direct equivalent, and document any blocker if it cannot run.
- [x] 4.4 Run `pnpm run i18n:extract:ci` after locale-key changes and document any blocker if it cannot run.
