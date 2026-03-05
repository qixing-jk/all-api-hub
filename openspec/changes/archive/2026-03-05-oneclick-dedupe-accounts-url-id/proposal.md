## Why

Importing/syncing accounts across devices (or accidental repeated imports) can create duplicate accounts that point to the same upstream user on the same site. This leads to inaccurate statistics, duplicated check-ins, and confusing operations.

We need a safe, explainable cleanup flow that can identify duplicates deterministically and help users remove redundant entries without accidentally deleting the wrong one.

## What Changes

- Add a “Scan duplicate accounts” entry in the account management UI.
- Detect duplicates using **normalized site URL (origin)** + **upstream user id** (as returned by the site backend).
- Present scan results grouped by duplicate set, highlighting a recommended “keep” account (strategy-based).
- Exclude accounts that cannot be scanned (invalid URL origin or missing/non-numeric upstream user id) and surface them as “unscannable” in the scan UI.
- Provide a pre-delete preview modal showing: what will be deleted, what will be kept, and user-facing warnings about potential side effects (pin/order changes).
- Support one-click bulk deletion of duplicates after confirmation (no breaking changes).

## Capabilities

### New Capabilities

- `account-duplicate-cleanup`

### Modified Capabilities

- (none)

## Impact

- Options UI: add scan entry, grouped results view, and confirmation/preview modal.
- Services/storage: implement a deterministic dedupe scanner and a safe bulk-delete flow (with storage write locking).
- Account model: rely on the stored upstream user id (`account_info.id`) for dedupe; accounts without a usable id are excluded from auto-grouping.
- i18n: add localized strings for scan results and confirmation UX.
- Tests: add unit tests for URL normalization + grouping and integration tests for the cleanup workflow where feasible.

