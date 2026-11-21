# Coverage feedback worklist

Source report: Codecov commit 3054935de7d3691f8e5cd88e5ab114441f28afe7. The full provider line report was intersected with all PR file patches, including every implicated file; there were 24 files, 77 misses and 118 partial lines. Raw evidence is in artifacts/coverage-tree.json and artifacts/coverage-gaps.json. Final remote reconciliation must use the published repair SHA.

| Implicated source | Behavior groups and local outcome |
| --- | --- |
| popup/ApiCredentialProfilesStatsSection.tsx | Native summaries, absent data, preference conversion and duplicate warnings: component tests and Chinese/Sub2API Chromium flows. Optional formatting defaults are low-risk presentation fallback. |
| allowance/ApiCredentialProfileTelemetryDetails.tsx | Independent component funding labels, stale times, exact/unknown native cost: component tests plus inspected narrow/desktop views. Missing optional old timestamps omit the timestamp without inventing one. |
| allowance/apiCredentialAllowance.ts | Matching crypto/quota units, coherent reporting windows, stale exclusion and full-day runway: financialReview, allowance and dev-fixture tests. Legacy compatibility remains gated by same source/time/scope. |
| allowance/apiCredentialTelemetryFormatting.ts | Unknown/missing units, invalid legacy currency fallback, budgets and exact scaled/crypto costs: formatter, component and browser tests. Generic label fallbacks are low-risk presentation. |
| allowance/credentialFinancialStats.ts | Quota/crypto/historical units, invalid day/timezone, restricted scope, distinct pools and overflow: dedicated behavior tests. Captured scale has a tested default for old units. |
| editor/ApiCredentialTelemetryFields.tsx | Supported asset, role and scope selections: existing dialog creation and preservation tests. Unrecognized select values cannot be emitted by the owned option list; defensive fallback needs no synthetic UI option. |
| editor/useApiCredentialProfileEditor.ts | Mapping creation, validation, preserved quota/crypto metadata, absent legacy mapping: existing dialog tests. Redundant optional-chain alternatives after a discriminant check are defensive invariants. |
| accounts/balanceSnapshot.ts | Complete enumeration with missing amounts: Kimi console component tests and credential native parsers verify partial coverage without invented amounts. |
| accounts/metrics/balanceProjection.ts | Roles, assets, nature, scope, validity, parent relations, collection conflicts, wallet identity, duplicates and overflow: 21 public aggregation/schema tests. Private Card/History branches are unreachable through aggregateBalances' two-purpose contract; post-filter unknown observations/assets are also invariants. |
| accounts/refresh/allowanceAcceptance.ts | Missing finite state and per-field amounts, unlimited/unconfigured transition: refresh tests preserve separate original clocks. |
| accounts/refresh/balanceAcceptance.ts | Partial/unavailable/not-requested collections, scope/identity changes, empty completion and source mismatch: direct and storage-refresh tests. Original timestamps are asserted. |
| amounts/balance.ts | Duplicate IDs, mismatched subject, missing/cyclic relationships and coherent parent traversal: schema behavior tests. |
| amounts/budgets.ts | Known/stale amounts and finite/unbounded states: budget and refresh tests. Impossible corrupt stale observations are rejected at canonical codec boundaries. |
| amounts/decimal.ts | Invalid exponent/scale, precise conversion and overflow: decimal and booster tests. |
| storage/configCodec.ts | Invalid local admission generation: read and restore tests. Supported current/legacy configuration remains covered. |
| storage/profiles.ts | Invalid/overflowed counters, replacement admission, missing profile and context races: storage and refresh tests. |
| telemetry/acceptance.ts | Legacy migration, independent budget fields, omitted quota operands and reset changes: repeated refresh, codec and component tests. |
| telemetry/adapters.ts | Subscription-only success, error diagnostics, zero/native Sub2API balances and custom financial roles: adapter and end-to-end refresh tests. |
| telemetry/facts.ts | Duplicate identities, native unit selection, unverified legacy balance, crypto/quota amounts and independent grant/availability counters: normalization/persistence tests. |
| telemetry/index.ts | Superseded acceptance, absent stored snapshot and failed/partial refresh: storage/controller tests. An accepted write with no snapshot is prevented by the storage method's codec/save contract. |
| telemetry/parsers.ts | Unknown identities, missing financial values, valid zero, over-limit windows and booster conversion: parser, codec and refresh tests. |
| telemetry/snapshotCodec.ts | Invalid canonical balances/budgets, old unknown units, crypto/scales, retained operands and finite clocks: malformed and round-trip behavior tests. |
| apiService/kimiOpenPlatform/balance.ts | Console/inference envelopes, missing operands, exact native values and components: cross-consumer parity and console partial tests. |
| preferences/currencyDisplay.ts | Original versus selected/fallback currency: money and Sub2API browser preference checks. Missing optional preference falls back to the existing selected currency. |

All material acquisition, persistence, concurrency, migration, recovery and data-integrity groups above received behavior evidence. No such group was deferred or waived from a green percentage. Any remaining low-risk formatting/default branch can use policy tolerance only after the current-head Codecov gate is successful; repository policy is codecov.yml's patch auto target with 1% threshold and vitest.config.ts's explicit diagnostic thresholds. Remote missed/partial patch lines will be recollected before final closure.
