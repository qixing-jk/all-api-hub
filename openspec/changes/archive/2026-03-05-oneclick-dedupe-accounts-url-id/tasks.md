## 1. Discovery / Data Model

- [x] 1.1 Locate current account storage model and identify fields for base URL, enabled state, pin state, and last-updated timestamp
- [x] 1.2 Confirm upstream user id is obtained from stored `account_info.id` (no scan-time fetch)
- [x] 1.3 Identify related stores that reference account ids (pin/order lists + auto check-in status) and decide reconciliation behavior on delete

## 2. Core Dedupe Logic

- [x] 2.1 Implement URL-origin normalization utility with invalid-URL handling
- [x] 2.2 Implement duplicate grouping by `origin + upstreamUserId`
- [x] 2.3 Implement deterministic “recommended keep” selection with strategy + tie-break rules

## 3. UI: Scan + Grouped Results

- [x] 3.1 Add “Scan duplicate accounts” entry to the options account management UI
- [x] 3.2 Build grouped results UI (duplicate sets, dedupe key, member accounts, recommended keep)
- [x] 3.3 Add strategy selector (keep pinned / keep enabled / keep most recently updated) and re-compute recommendations
- [x] 3.4 Allow manually selecting the keep account per duplicate set

## 4. UI: Preview + Bulk Delete

- [x] 4.1 Implement pre-delete preview modal (keep vs delete per group + impact warnings)
- [x] 4.2 Implement bulk delete action with storage write lock and outcome summary
- [x] 4.3 Warn about pinned/manual-order impact; reconcile pin/order lists on delete; best-effort prune auto check-in status

## 5. i18n + Tests

- [x] 5.1 Add i18n strings for scan, grouping, preview, and deletion results (at least zh + en if required by project conventions)
- [x] 5.2 Add unit tests for URL normalization, grouping, and recommendation selection
- [x] 5.3 Add a UI/service test covering “scan → preview → delete” happy path (mock storage and dependencies)
