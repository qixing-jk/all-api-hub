## 1. Managed-Site Status Service

- [x] 1.1 Add a managed-site token status service under `src/services/managedSites/**` that wraps the existing provider matching flow and returns `added`, `not-added`, or `unknown` with reason metadata.
- [x] 1.2 Reuse `prepareChannelFormData(...)` and provider matching helpers to distinguish exact matches from weak base-url/models and base-url-only matches without breaking existing import-time duplicate checks.
- [x] 1.3 Normalize config-missing, input-preparation gaps, unusable backend-search responses, and unexpected failures into `unknown` results and ensure status diagnostics do not expose raw token or admin secrets.

## 2. Key Management State And Refresh Flow

- [x] 2.1 Extend `useKeyManagement` to store per-token managed-site status state, loading metadata, cache keys, and invalidation markers keyed by token identity plus managed-site configuration.
- [x] 2.2 Trigger bounded-concurrency status checks after token inventories load for the current selection, and reuse in-memory results until a refresh or invalidation event occurs.
- [x] 2.3 Invalidate and refresh affected status entries when tokens reload, tokens are edited or deleted, or managed-site preferences change.

## 3. Key Management UI And Localization

- [x] 3.1 Render managed-site status feedback in the Key Management token UI, including transient checking state, final `added` / `not added` / `unknown` states, inline reason text, and matched-channel follow-up affordances where available.
- [x] 3.2 Add a Key Management refresh action that reruns managed-site status checks for the current selection and replaces prior results when the refresh completes.
- [x] 3.3 Update `src/locales/**/keyManagement.json` with localized labels and explanations for status outcomes, unknown reasons, and refresh-related feedback.
- [x] 3.4 Refresh the affected token status after a successful managed-site import from Key Management so the UI can flip to the latest result without a full page reload.

## 4. Tests And Validation

- [x] 4.1 Add service-level tests for exact matches, exact non-matches, weak-match `unknown` outcomes, config-missing and Veloera-unsupported `unknown` states, DoneHub exact-match fallbacks, and failure-path secret-safe reporting.
- [x] 4.2 Add Key Management UI or hook tests covering automatic checks, session-cache reuse, manual refresh, invalidation after token or managed-site changes, and targeted refresh after managed-site import success.
- [x] 4.3 Run the smallest affected validation set for the new service and Key Management flows, then record any environment-limited gaps before handoff.
