## 1. Recon And Shared Persistence Design

- [x] 1.1 Inspect and reuse the existing verification result types, dialog probe state shape, and storage-service patterns in `src/services/verification/aiApiVerification/**`, `src/services/apiCredentialProfiles/apiCredentialProfilesStorage.ts`, and related UI components before adding new abstractions.
- [x] 1.2 Add the dedicated verification-history storage key, typed persisted summary models, and a storage service with read/write/clear/query/subscribe helpers for profile-scoped and model-scoped verification targets.

## 2. Verification History Persistence

- [x] 2.1 Add a sanitized persistence mapper that converts live `ApiVerificationProbeResult` state into bounded persisted summaries without storing raw secrets or transient diagnostics.
- [x] 2.2 Wire `VerifyApiDialog` and `VerifyApiCredentialProfileDialog` to load persisted summaries on open, save updated summaries after probe runs, and expose a clear-history action for the current target.

## 3. Status Surfacing In Existing UI

- [x] 3.1 Extend API credential profile list rows to show `last verified` status and timestamp from persisted verification history, including the unverified fallback state.
- [x] 3.2 Extend Model Management model rows to show model-scoped verification status and timestamp for account-backed and profile-backed sources, reusing existing badge/presentation patterns where possible.

## 4. Verification And Regression Coverage

- [x] 4.1 Add or update targeted Vitest coverage for the verification-history storage service and dialog/list rendering paths affected by persisted history.
- [x] 4.2 Run the repo’s staged-validation equivalent for the touched files, then run the smallest related automated test command for verification-history and verification-dialog behavior, and document any blockers if a command cannot run.
