## Context

All API Hub currently models “site entries” exclusively as `SiteAccount` records stored under `site_accounts`. These accounts power:

- Stats (total balance / consumption / income) and the popup balance section
- Key/Model management pages (account selectors)
- Account refresh, check-in, and other automation

For users who only need quick access to a site console/docs page, the closest workaround is creating a disabled account as a pseudo-bookmark. This is noisy because the account form requires username/userId/token and the entry still participates in account-only flows (search scoring, selectors, etc.) unless carefully gated.

This change introduces a first-class Bookmark entry type that:

- Stores only “bookmark-like” data (`name + url` with optional `tags + notes`)
- Appears in both Options and Popup UIs
- Supports pin/unpin and manual reorder
- Is included in Import/Export backups and WebDAV auto-sync
- Does not affect existing account flows, aggregates, or selectors

Key constraints:

- Extension runs in multiple contexts (options/popup/background); storage updates must be race-safe.
- Global tags are shared across entities; deleting a tag must remove references from all entities.
- Backups/WebDAV must remain tolerant of older payloads.

## Goals / Non-Goals

**Goals:**

- Add a separate persisted entity `SiteBookmark` with CRUD, tags, notes.
- Provide a bookmark list UI (Options + Popup) with:
  - Search + highlight
  - Tag filter (reusing global tags)
  - Pin/unpin and manual drag reorder
  - Row actions: open, copy URL, edit, delete
- Include bookmarks in Import/Export + WebDAV sync, including pinned and ordered metadata.
- Keep `SiteAccount` behaviors unchanged; bookmarks must not show up where an “account” is required (keys/models, stats, auto-checkin, etc.).
- Store bookmarks inside `AccountStorageConfig` (parallel to `accounts`) and share the existing `pinnedAccountIds` / `orderedAccountIds` arrays so accounts+bookmarks can be mixed in a single list in the future.

**Non-Goals:**

- Per-account “quick links” (Type-2 bookmarks) or nested folders.
- Bookmark sync compatibility with older extension versions via WebDAV (older clients may drop unknown fields when re-uploading).
- Favicon fetching, page title auto-detection, or link health checks.

## Decisions

### 1) Persist bookmarks inside `AccountStorageConfig` (no new storage key)

**Decision:** Extend the existing `site_accounts` payload (`AccountStorageConfig`) with a new parallel field:

- `bookmarks: SiteBookmark[]`

`SiteBookmark` contains only bookmark-like data:

- `id: string` (generated; MUST be unique across accounts+bookmarks)
- `name: string`
- `url: string`
- `tagIds: string[]` (global tag ids)
- `notes: string` (always present; default `""`)
- `created_at: number`
- `updated_at: number`

Backward compatibility:

- Missing `bookmarks` MUST be treated as an empty list, but the system MUST persist `bookmarks` as an array (default `[]`) on subsequent writes.
- Import/WebDAV merge MUST tolerate missing bookmark fields and keep older payloads valid.

**Alternatives considered:**

- Reuse disabled `SiteAccount` records as bookmarks → rejected because it forces account-only fields (username/userId/token), risks polluting account selectors/pages, and complicates behavior gating.
- Use a separate storage key (e.g. `site_bookmarks`) → rejected because we want pinned/manual ordering metadata to be shareable with accounts for a future mixed list, and cross-entity operations (tag delete, sync merges) are simpler with a single config blob.

### 2) Share pinned + manual order id lists across “entries”

**Decision:** Reuse the existing arrays in `AccountStorageConfig`:

- `pinnedAccountIds: string[]` → now means **pinned entry ids** (accounts and/or bookmarks), ordered (newest pinned first).
- `orderedAccountIds?: string[]` → now means **manual entry order** for the full set of entries.

Rationale:

- Avoids a second, parallel pin/order system for bookmarks.
- Enables a future UI where accounts and bookmarks can appear in the same mixed list with a single shared ordering model.

Behavior notes (important for later implementation):

- Account-only UIs continue to render accounts only; bookmark-only UIs render bookmarks only.
- Each view computes its order by filtering the shared id lists to the ids of that view’s entity type.
- Reorder operations in one view MUST NOT drop or reorder ids belonging to the other entity type.

### 3) Use the existing cross-context storage write lock

**Decision:** Reuse `STORAGE_LOCKS.ACCOUNT_STORAGE` for bookmark read-modify-write sequences.

Rationale:

- Tag deletion must update both global tag store and all tag-referencing entities (accounts + bookmarks) atomically.
- WebDAV merge/import flows may need to persist accounts, bookmarks, and tag store together.
- A single stable lock avoids multi-lock ordering issues and deadlocks across contexts.

**Alternatives considered:**

- Add a dedicated bookmark lock → increases complexity for cross-entity operations (tag delete / merge) because it would require acquiring multiple locks safely.

### 4) Tag deletion removes references from bookmarks too

**Decision:** Extend `tagStorage.deleteTag()` semantics so deleting a tag removes the tag id from:

- `site_accounts` (`SiteAccount.tagIds`)
- `site_accounts.bookmarks` (`SiteBookmark.tagIds`)

This keeps TagStore referential integrity consistent across all tag consumers.

**Alternatives considered:**

- Leave bookmark references intact → rejected because it creates “dangling” tag ids and inconsistent UI.

### 5) UI separation: add a dedicated Bookmarks view, not a polymorphic “entry list”

**Decision:** Implement a separate Bookmark list + dialog components (parallel to account list) and expose them as a first-class view in each UI surface:

- Options: add a dedicated sidebar route `#bookmark` (`MENU_ITEM_IDS.BOOKMARK`) that renders `entrypoints/options/pages/BookmarkManagement`.
- Popup: add an `Accounts | Bookmarks` switch (tabs). When “Bookmarks” is selected, hide account-only sections (balance + refresh shortcuts), swap in bookmark stats, and show bookmark-focused actions instead.
- Popup: keep one shared action button group where only the primary CTA switches between “Add Account” and “Add Bookmark”.

Rationale: account rows display balance/usage and have account-only actions; bookmarks should stay lightweight and not share the `DisplaySiteData` shape.

**Alternatives considered:**

- A single unified list with a union type and conditional rendering → possible but higher risk of regressions in existing `AccountList` behaviors (sorting, stats, action menus, and selectors).
- Options internal tabs inside `AccountManagement` (`#account`) → rejected because Options already has a stable sidebar router, and keeping Bookmarks as a dedicated page makes deep-linking and provider composition simpler.

### 6) Sorting behavior for bookmarks is independent from account sorting settings

**Decision:** Bookmark ordering uses a simple deterministic scheme:

1. Pinned bookmarks first, ordered by filtering `pinnedAccountIds` to bookmark ids.
2. Then manual order for the remaining items, using `orderedAccountIds` (filtered to bookmark ids).
3. Fallback tie-breaker: name (case-insensitive).

Rationale: account sorting criteria (balance/consumption/current tab match) do not apply to bookmarks; pin + manual reorder must always be available.

### 7) Extend backup + WebDAV payloads (without changing `BACKUP_VERSION`)

**Decision:** Keep `BACKUP_VERSION = "2.0"` and extend the V2 `accounts` payload (`AccountStorageConfig`) with bookmark + ordering data:

- Full backup: `{ accounts: AccountStorageConfig, tagStore, preferences, channelConfigs }`
- Accounts-only backup: `{ type: "accounts", accounts: AccountStorageConfig, tagStore? }`

WebDAV merge/download/upload will:

- Tolerate missing `bookmarks` / `pinnedAccountIds` / `orderedAccountIds` and treat them as empty arrays.
- Merge bookmarks by id using `updated_at` (latest wins).
- Merge pinned ids as a union (remote-first) filtered to ids that exist as either an account or a bookmark.
- Choose `orderedAccountIds` by “latest config wins” using `accounts.last_updated` (and always append missing ids at the end in a stable way).

**Alternatives considered:**

- Bump backup version (e.g. `3.0`) → rejected because existing code intentionally falls back to tolerant import for unknown versions; version bump does not improve cross-version WebDAV safety.

## Risks / Trade-offs

- **[Cross-version WebDAV data loss]** Older clients may drop `bookmarks` when re-uploading. → Mitigation: document requirement that devices participating in WebDAV bookmark sync must run the updated extension; keep payload optional and tolerant.
- **[Tag delete atomicity]** Tag deletion now updates multiple storage blobs. → Mitigation: reuse `STORAGE_LOCKS.ACCOUNT_STORAGE` and update both configs in one critical section.
- **[UI complexity in popup]** Adding a new tab changes popup layout and action buttons. → Mitigation: keep default tab as Accounts; isolate bookmark UI components and reuse existing styling patterns.
- **[Ordering merge ambiguity]** Manual order is hard to merge. → Mitigation: “latest wins” for `orderedAccountIds` plus stable append of missing ids.
- **[Ordered list now syncs]** Manual order becomes part of backups/WebDAV payloads. → Mitigation: user explicitly accepts this behavior; keep merge rules deterministic and tolerant of missing fields.

## Migration Plan

- Storage: `AccountStorageConfig.bookmarks` defaults to empty when missing; no migration required for existing installs.
- Backup import:
  - V2 importers treat missing bookmarks/order fields as empty arrays.
  - Legacy (V1) imports may only provide accounts; local bookmarks and ordering metadata remain intact (pruned only when ids become invalid).
  - New import logic persists bookmarks/order when present.
- WebDAV:
- Merge strategy supports bookmarks when present and keeps local bookmarks when remote lacks them (and vice versa depending on strategy).
- Rollback:
- Rolling back to an older version keeps bookmarks in storage but they become unused; they may be dropped by older WebDAV clients if sync continues.

## Open Questions

- Should bookmark search scoring/prioritization match account search semantics exactly, or remain a simpler match (name/url/tags only)?
