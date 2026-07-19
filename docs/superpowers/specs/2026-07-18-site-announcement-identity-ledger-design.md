# Site Announcement Identity Ledger Design

Date: 2026-07-18

## Purpose

Prevent a previously seen site announcement from becoming new again when the
bounded content cache evicts it. Keep the immediate change within the existing
`storage.local` architecture and do not add or request the `unlimitedStorage`
permission.

## Current Problem

Site announcement content and identity state currently live in the same
persisted record. Each site retains only ten records. When a provider returns
more than the retention limit, an evicted record loses the only evidence that
it was seen. A later poll recreates that announcement as unread and can notify
the user again.

Raising the content limit to 100 reduces the trigger frequency but does not fix
the boundary: the same failure returns at record 101.

## Goals

- Retain up to 100 complete announcement records per site.
- Persist compact identity state for every accepted provider item, including
  items outside the content cache.
- Preserve both seen and read state when complete content is evicted.
- Migrate existing schema-v1 records without discarding content or state.
- Never notify a provider-supplied read item as newly created.
- Bound long-term identity growth by entry count and oldest-use eviction, not
  by age.
- Remove a site's content and identity state only after no stored account,
  enabled or disabled, references its site key.
- Keep correctness independent of `unlimitedStorage`.

## Non-Goals

- Do not add required or optional storage permissions, permission prompts, or
  browser-specific permission branches.
- Do not add storage-usage telemetry in this change.
- Do not split announcement state across multiple storage keys yet.
- Do not change Sub2API upstream mark-read behavior.
- Do not redefine the existing announcement fingerprint contract.
- Do not make account storage depend on the announcement feature.

## Alternatives Considered

### Raise The Record Limit Only

Changing ten records to 100 covers known payload sizes but moves the bug to
record 101. Content retention and identity retention remain incorrectly
coupled.

### Read-Only Ledger

Keeping markers only for read records protects previously read cached content,
but it still fails when one initial response contains more records than the
content limit. The uncached item has neither a record nor a marker, so every
later response looks new. A read-only ledger is therefore insufficient.

### Seen Identity Ledger

Keep complete content bounded while retaining a compact marker for every seen
identity. Marker presence answers whether the item is new; optional `readAt`
answers whether it is read. This is the selected approach.

## Persisted Model

Upgrade `SiteAnnouncementStoreState` to schema version 2:

```ts
interface SiteAnnouncementIdentityMarker {
  firstSeenAt: number
  lastSeenAt: number
  readAt?: number
}

interface SiteAnnouncementStoreState {
  schemaVersion: 2
  sites: Record<string, SiteAnnouncementSiteState>
  identityLedger: Record<
    string,
    Record<string, SiteAnnouncementIdentityMarker>
  >
}
```

The outer ledger key is the existing `siteKey`. The inner key is a fixed-size
digest of the existing raw fingerprint. Complete records continue to retain
their raw fingerprint and projected `read` / `readAt` fields for rendering.
The ledger is the durable source for identity and read state.

Use SHA-256 over the UTF-8 bytes of the existing fingerprint through WebCrypto,
serialized as lowercase hexadecimal. This is asynchronous but fits the
existing asynchronous storage flow, requires no dependency or permission, and
avoids an underspecified custom hash. Add fixed test vectors so the persisted
identity contract cannot drift between browsers or refactors.

## Migration And Self-Healing

`sanitizeStore` must accept schema versions 1 and 2 instead of resetting data
whenever the version differs.

For every sanitized schema-v1 record, whether read or unread:

1. Compute its fingerprint digest.
2. Create a marker with the record's `firstSeenAt` and `lastSeenAt`.
3. Set marker `readAt` only when the record is read, using
   `readAt ?? lastSeenAt ?? firstSeenAt`.
4. Return schema version 2 and persist it during the next normal write.

Schema-v2 sanitization ignores malformed markers without dropping valid site
content. It also self-heals the two projections during a normal write:

- a marker with `readAt` forces a matching cached record to read;
- a cached record missing a marker recreates the marker from its timestamps;
- a cached read record enriches a marker whose `readAt` is missing.

A missing storage key is a legitimate empty schema-v2 store. An unknown or
future schema, a malformed root object, or a digest failure must remain
distinguishable from that empty state: mutation reads throw and perform no
write. Best-effort UI reads may return an empty display projection, but that
projection must never feed a mutation.

## Polling And Read Flow

### Poll Upsert

Compute input fingerprint digests before entering the storage write lock. For
every accepted provider item inside the update:

`createRecordInput` must pass the provider's `readAt` through to storage; the
current implementation drops that field.

1. If its marker exists, refresh `lastSeenAt`. Marker presence means the item
   is already known and it is never returned in `createdRecords`.
2. If its complete record exists but its marker does not, recreate the marker
   from that record and treat the item as already known.
3. If neither exists, create a marker and a complete record. Return the record
   in `createdRecords` only when the provider did not supply `readAt`.
4. If provider `readAt` exists, set marker `readAt`, project the record as read,
   and exclude it from notifications.
5. If a known evicted item returns, reconstruct its complete record using the
   marker's `firstSeenAt` and read projection.
6. Sort complete records by `(firstSeenAt descending, fingerprint ascending)` and
   retain the first 100 for the site. This stabilizes cache membership when a
   single response gives many items the same first-seen timestamp.

All accepted items receive markers before the content slice is applied. Thus a
response containing 101 items produces 101 identities even though only 100
complete records remain.

### Mark One Read

Mark the cached record and its identity marker with the same `readAt`. A record
id can address only cached content, so a missing cached record remains a
failure as today.

### Mark All Read

Mark every ledger identity in the requested site scope, not only the complete
records still cached, and update matching cached projections. Return the number
of marker entries that changed from unread to read. This makes “mark all” true
for all identities the extension has seen, including the 101st uncached item.

## Capacity Policy

Complete content is limited to 100 records per site.

There is no time-based identity expiry. Identity markers have two count bounds:

- at most 1,000 markers per site, preventing one provider from consuming the
  entire ledger;
- at most 10,000 markers globally across retained sites.

Normalize and self-heal records and markers first, then apply the per-site
limit and global limit exactly once before persistence. Evict the oldest marker
by the deterministic order `(lastSeenAt, siteKey, digest)`. Reject or normalize
non-finite timestamps during sanitization. A subsequent normal write must
remain within both limits even when cached records recreate missing markers.
Skip persistence when reconciliation or pruning made no change.

These are capacity boundaries, not an absolute promise of infinite dedupe.
After an identity is evicted from both the ledger and content cache, a provider
may make it appear new again. Active provider results refresh `lastSeenAt`, and
site-level isolation prevents one large site from evicting every other site's
state. The 10,000 global limit is a conservative unmeasured starting point, not
evidence that worst-case content and markers fit the browser quota. Actual
bytes and write duration must be measured before raising it.

## Account Lifecycle

Account enabled state controls fetching, not retention:

- A common-provider site key is retained while any stored account, enabled or
  disabled, resolves to the same normalized site type and origin.
- A Sub2API site key is retained while its exact account still exists because
  the account id is part of the key.
- Disabling an account stops polling but does not remove announcement state.
- Deleting the last account, changing its URL, changing its site type, importing
  a replacement set, or intentionally clearing all accounts removes orphaned
  site content and ledger entries.

### Account Change Event

Register a background `storage.onChanged` listener for
`ACCOUNT_STORAGE_KEYS.ACCOUNTS`. This is the repository's exhaustive account
change event: it covers ordinary account service mutations, imports, WebDAV,
clear-all, and storage migrations without coupling those modules to site
announcements.

Use `oldValue` and `newValue` from the event and the existing account config
normalizer to derive retained site-key sets. Reconcile only when those sets
differ; balance refreshes, disabled-state changes, ordering, pinning, and other
same-site account updates become no-ops. A missing `newValue` is an intentional
account-store removal and therefore means an empty retained-key set.

Do not defer the work through a plain `setTimeout`: an MV3 service worker may
suspend before an untracked timer fires. Compare the key sets synchronously in
the event callback. When they differ, request reconciliation immediately. If
an announcement operation is already running, retain only the newest pending
account snapshot and consume it before the operation queue becomes idle.

The current scheduler's `isRunning` flag is not a queue; it drops overlapping
checks. Add one explicit serialized operation queue shared by checks and
lifecycle reconciliation so an older account snapshot cannot prune state
created after a newer account change.

### Startup And Poll Repair

The event is the primary cleanup trigger. Add two repair points:

- reconcile once when the site-announcement scheduler initializes;
- before a poll, read all accounts once, reconcile from that successful
  snapshot, then filter the same snapshot to enabled accounts for network
  fetches.

Do not perform cleanup from status or list getters. Read-only UI queries must
not mutate storage.

If the startup or poll account read fails, abort both that reconciliation and
that poll without writing announcement state. This throwing read is a
data-loss guard, not a recovery mechanism: the next account event, startup, or
poll retries naturally. A stale orphan is harmless between retries; deleting
valid history because a transient read looked empty is not. A persistent
corruption may not recover naturally and must remain visible as an error while
the original bytes stay untouched.

### Live Manual Check Scope

Stored common-site `accountId` is provenance, not a durable routing target.
When the representative account is deleted or disabled, another enabled
account may still represent the same common site.

Change manual-check selection to optional `siteKeys`. Resolve each requested
site key against the same live enabled-account snapshot and choose its current
representative. This avoids silently skipping a shared site because the cached
record points at a stale account id. Sub2API remains exact-account scoped
through its account-specific site key.

## Storage Failure Safety

The current announcement `updateStore()` calls a read method that converts a
storage error into an empty store. A transient read failure can therefore be
followed by a successful write that replaces all announcement data.

Add an internal throwing `getStoreOrThrow()` and require every mutation to use
it under the existing announcement storage lock. It returns an empty store only
when the storage key is absent; storage failures, unknown schemas, malformed
roots, and digest failures reject. A failed read performs no `storage.set`.
Public best-effort read methods may keep their current fallback behavior for
display, but that fallback must never feed a mutation.

A failed write continues to reject the runtime operation. The single-store
schema preserves atomic content/ledger updates for this focused fix.

## Testing

Focused storage tests must cover:

- every schema-v1 record migrates to an identity marker, preserving read state;
- provider `readAt` creates a read marker and no notification candidate;
- 11-item and 101-item responses produce no duplicates on the second poll;
- mark-all covers ledger entries outside the 100-record content cache;
- marker and cached-record self-healing works in both directions;
- SHA-256 digest test vectors are stable;
- per-site and global `limit + 1` eviction uses deterministic oldest order;
- a normal write after pruning remains within both limits;
- malformed ledger values and timestamps do not drop valid site content;
- missing storage creates an empty store, while unknown schema, malformed root,
  and digest failure perform no write;
- announcement-store read failure performs no write;
- no-op reconciliation and pruning perform no write.

Lifecycle and scheduler tests must cover:

- account change events prune only when retained site keys change;
- disabled accounts retain state without being fetched;
- deleting one shared common account retains the site;
- deleting the last shared account prunes the site;
- Sub2API deletion prunes only its exact account site key;
- imports, URL/site-type changes, and clear-all reconcile correctly;
- startup/poll account-read failure leaves announcement state untouched;
- manual site-key checks resolve a live enabled representative;
- two checks returning the same over-limit set, with mark-all between them,
  produce no second notification.

Use Vitest service tests. Playwright is not required because the risk is
persistence, event handling, and scheduler behavior rather than browser layout
or a cross-entrypoint interaction.

## Delivery Boundaries

Implement and validate the approved design as two independently reviewable
slices:

1. Core issue fix: schema-v2 identity ledger, content limit 100, migration,
   deterministic pruning, provider `readAt`, mark-read behavior, stable content
   ordering, and fail-closed announcement-store mutations.
2. Account lifecycle: account-key change handling, retained-site-key
   reconciliation, explicit operation queue, startup/poll repair, and live
   `siteKeys` manual-check routing.

The second slice is included because account deletion and shared-site routing
were explicitly selected product semantics, but the core #1189 regression does
not depend on it. Keeping the slices separate limits review and rollback risk.

## Known Residual Risks

- The existing fingerprint contract treats a changed fingerprint as a new
  identity. If a provider edits fields included in the fingerprint, the item
  may legitimately appear new even though its upstream concept is unchanged.
- The finite identity limits intentionally provide bounded, not infinite,
  deduplication.
- Sub2API mark-all still does not synchronize every local ledger identity to
  upstream; changing that provider contract remains out of scope.
- The issue report does not identify the provider or include a raw payload, so
  cache-eviction reproduction is confirmed but provider-specific fingerprint
  drift cannot be ruled out.

## Maintainability

Reuse the existing site-key factory, fingerprint, account config normalizer,
storage-change wrapper, and announcement storage lock. Add one feature-local
operation queue because the current scheduler has no serialization primitive.
Extract focused helpers for digesting, ledger normalization/pruning, and
retained-site-key derivation. Do not add provider-specific retention logic or a
parallel account event bus.

## Future Capacity Work

`unlimitedStorage` is explicitly deferred and is not part of the current
implementation or permission surface. Before reconsidering capacity, measure
feature bytes and total extension bytes with `storage.local.getBytesInUse()`
where supported. Any future telemetry must use only byte buckets, site counts,
record counts, marker counts, and quota-failure categories.

If measured usage or single-object rewrite cost becomes material, evaluate
per-site storage keys before adding permissions. Storage permission must remain
a capacity enhancement rather than a correctness dependency.

The current single-key design rewrites the whole announcement object when poll
status or marker timestamps change. Accept that as the focused implementation
tradeoff at the initial 10,000-marker cap, then use measured bytes and write
duration to decide whether per-site sharding is warranted.
