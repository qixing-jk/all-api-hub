## 1. Shared Matching Foundation

- [x] 1.1 Add shared managed-site channel match constants and types for ranked match levels/reasons plus key/model assessment reasons and the model-similarity threshold.
- [x] 1.2 Extend `src/services/managedSites/utils/channelMatching.ts` with ranked `url + models` evaluation that prefers exact equality, then containment, then thresholded similarity inside a normalized URL bucket.
- [x] 1.3 Add a shared resolver that performs normalized base-URL search, captures URL/key/model assessments, and falls back to provider-aware exact matching when local exact evidence is insufficient.

## 2. Account Channel Location Flow

- [x] 2.1 Refactor the account "Locate channel" action to consume the shared inspection flow and navigate with `channelId` only when the same channel satisfies both key matching and exact model equality; otherwise use `search`.
- [x] 2.2 Update account-side user feedback and localization so the UI explains secondary, fuzzy, unresolved, key-only, same-channel drift, conflicting-signal, multiple-key, no-key, config-missing, and fetch-failure fallbacks.

## 3. Key Management Status Flow

- [x] 3.1 Extend managed-site token status resolution to carry shared URL/key/model assessment metadata and keep `not added` limited to search-complete, no-signal, key-present cases while preserving explicit unknown reasons for unavailable exact verification.
- [x] 3.2 Update Key Management state and rendering so token rows show signal badges/tooltips, exact-channel or review-channel follow-up affordances, and backend-specific hidden-key guidance without exposing secrets.
- [x] 3.3 Refresh `src/locales/**/keyManagement.json` and any affected account locale files with the new ranked-match and signal-badge labels.

## 4. Tests And Validation

- [x] 4.1 Add service-level tests for ranked channel matching, including exact equality, model containment, model similarity, URL-only fallback, unresolved outcomes, key-only outcomes, and provider-specific guardrails.
- [x] 4.2 Add or update account and Key Management tests that cover exact channel focusing, search-based review flows, signal badges/tooltips, and follow-up channel affordances.
- [x] 4.3 Run the smallest affected validation set for the shared matching utilities and the two consuming UI flows, then record any environment-limited gaps before handoff.
