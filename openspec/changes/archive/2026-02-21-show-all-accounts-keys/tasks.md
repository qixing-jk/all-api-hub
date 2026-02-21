## 1. Spec + Data Model Alignment

- [x] 1.1 Update Key Management token type to include `accountId` (owning account scope) and adjust any token→account lookups to use `accountId` instead of `accountName`.
- [x] 1.2 Replace key visibility tracking from `Set<number>` to a collision-safe `Set<string>` using `${accountId}:${tokenId}` identity; update `KeyDisplay`/`formatKey` accordingly.
- [x] 1.3 Add a helper for building token UI identity keys and ensure all list keys are collision-safe in aggregated mode.

## 2. Aggregated Token Loading (All Accounts Mode)

- [x] 2.1 Add an “All accounts” option to Key Management account selector controls and define the sentinel value (e.g. `"all"`).
- [x] 2.2 Refactor token loading state to a per-account inventory map with status (`idle/loading/loaded/error`) and error messages, reusing patterns from `components/KiloCodeExportDialog.tsx`.
- [x] 2.3 Implement aggregated token loading flow that loads tokens per enabled account, continues on failures, and supports retrying failed accounts.
- [x] 2.4 Add race-safety for mode/account switching (selection epoch + per-account request epoch guards) so stale results do not overwrite current state.
- [x] 2.5 Add light concurrency control keyed by normalized origin so accounts on the same site are not fetched concurrently (sequential per origin), while allowing parallelism across distinct origins (no global cap).

## 3. UI/UX Updates

- [x] 3.1 Update Key Management summary line to show aggregated counts and loading progress in “All accounts” mode.
- [x] 3.2 Surface per-account failures in aggregated mode (inline alert/list of failed accounts) and provide a retry action.
- [x] 3.3 Ensure Add Token behavior is correct in aggregated mode (open dialog without preselect so user chooses a target account).
- [x] 3.4 Verify per-token actions (copy/export/edit/delete) operate on owning account in both single-account and aggregated modes.

## 4. i18n + Tests

- [x] 4.1 Add/update i18n strings for “All accounts”, aggregated loading/progress, and per-account error messaging.
- [x] 4.2 Add unit/component tests for collision safety (duplicate token IDs across accounts), per-account failure isolation, and secret-handling behavior (masked by default; explicit reveal/copy).
- [x] 4.3 Run `pnpm -s test -- <relevant tests>` (and fix only failures caused by this change).
