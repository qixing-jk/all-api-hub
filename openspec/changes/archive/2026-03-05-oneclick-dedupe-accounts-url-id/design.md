## Context

All API Hub stores multiple “accounts” that represent a (site URL + credentials) combination. Users can import/sync accounts across devices; repeated imports or mistakes can create duplicated entries that actually point to the same upstream user on the same site. This creates duplicated operations (e.g., check-in) and makes statistics and navigation confusing.

This change adds a deterministic duplicate detection mechanism and a safe bulk cleanup flow, designed to be explainable (grouped preview) and resilient to multi-context storage writes.

Constraints:
- Runs in a WebExtension (WXT) across Chromium MV3 + Firefox MV2.
- Sensitive data (tokens/keys) must never be logged.
- Storage writes may occur concurrently from popup/options/background; use the existing storage write lock.

## Goals / Non-Goals

**Goals:**
- Identify duplicates using normalized URL origin + upstream user id.
- Provide a scan UI that groups duplicate sets and recommends a “keep” account.
- Provide a pre-delete preview and explicit confirmation for one-click bulk deletion.
- Ensure deletion is safe/atomic with storage write locking.

**Non-Goals:**
- A full “undo” system with multi-step history and UI restore flows.
- Automatically deduping without user confirmation.
- Changing upstream/site APIs or detection logic beyond what’s required to obtain a stable user id.

## Decisions

1) **Deduplication key = `origin + upstreamUserId`**
- Rationale: matches the intended semantics from the feature request; `origin` avoids path/query noise and is stable for a deployment. `upstreamUserId` distinguishes users sharing the same site.
- Alternative: full base URL normalization (including path) was rejected because many deployments expose multiple UI paths under the same origin.

2) **Scan uses stored upstream user id only (no network fetch)**
- The scan reads the upstream user id from the stored account record (`account_info.id`).
- Accounts with missing/non-numeric user id are treated as “unscannable” and excluded from duplicate grouping.
- Rationale: keeps the scan instant and offline-friendly, and avoids per-account rate limits.

3) **Recommendation strategy is explicit and deterministic**
- Provide a small set of strategies aligned with the request (keep pinned / keep enabled / keep most recently updated).
- The UI selects one strategy (default) and shows which account would be kept per group.
- Alternative: “smart” heuristics without transparency were rejected because users need explainability before deletion.

4) **Bulk deletion is a single locked read-modify-write**
- Use the existing storage write lock to avoid races and partial state across extension contexts.
- Deleting accounts also reconciles in-storage references to deleted account ids:
  - Removes deleted ids from pinned and ordered entry lists.
  - Best-effort prunes per-account auto check-in status so retry schedulers/UI don’t retain stale entries.
- The confirmation UI warns when the deletion set includes pinned entries or entries referenced by manual ordering.

## Risks / Trade-offs

- **[Risk] Missing/incorrect upstream user id** → Mitigation: scan UI surfaces “unscannable” accounts and excludes them from auto-dedupe; users can refresh/re-verify accounts first to repopulate stored account info.
- **[Risk] URL parsing inconsistencies** → Mitigation: normalize via `new URL()`; clearly define behavior for invalid URLs; add unit tests for normalization and grouping.
- **[Risk] Deleting pinned/ordered accounts surprises users** → Mitigation: confirmation step warns about pin/order impact; deletion reconciles pin/order lists automatically.
- **[Risk] Concurrent writes** → Mitigation: enforce storage write lock for deletion.

## Migration Plan

- No schema-breaking migration is required.
- The implementation relies on the existing stored upstream user id (`account_info.id`) and does not introduce a new persisted field for dedupe.
- Rollback: since this is UI + a storage deletion action, rollback is simply removing the feature; users should be advised to export settings/back up before deletion.

## Resolved Notes

- Upstream user id is sourced from the stored `account_info.id` field; the scan does not perform network calls.
- Account deletion reconciles pinned/ordered lists in account storage and best-effort prunes auto check-in status entries for deleted accounts.

