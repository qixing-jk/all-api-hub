# Site Announcement Identity Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent cached site announcements from becoming new again after content eviction by persisting bounded seen/read identity state independently from complete content.

**Architecture:** Upgrade the existing single-key announcement store to schema v2 with a SHA-256 keyed identity ledger. Keep 100 complete records per site, retain up to 1,000 identities per site and 10,000 globally, and make mutation reads fail closed so storage failures or unsupported schemas cannot overwrite valid bytes.

**Tech Stack:** TypeScript, WXT, `@plasmohq/storage`, WebCrypto SHA-256, Vitest.

---

## File Map

- Create `src/services/siteAnnouncements/identity.ts`: fingerprint digest and deterministic ledger pruning.
- Create `tests/services/siteAnnouncements/identity.test.ts`: digest vectors and pruning contracts.
- Modify `src/types/siteAnnouncements.ts`: schema-v2 marker/store types.
- Modify `src/services/siteAnnouncements/constants.ts`: schema and retention limits.
- Modify `src/services/siteAnnouncements/storage.ts`: migration, fail-closed writes, identity-aware upsert, and read projection.
- Modify `src/services/siteAnnouncements/scheduler.ts`: preserve provider `readAt` and notification semantics.
- Modify `tests/services/siteAnnouncements/storage.test.ts`: persistence regressions.
- Modify `tests/services/siteAnnouncements/scheduler.test.ts`: provider and two-poll regressions.

### Task 1: Identity Contract And Digest

**Files:**

- Create: `src/services/siteAnnouncements/identity.ts`
- Create: `tests/services/siteAnnouncements/identity.test.ts`
- Modify: `src/types/siteAnnouncements.ts`
- Modify: `src/services/siteAnnouncements/constants.ts`

- [ ] **Step 1: Write the failing digest tests**

```ts
import { describe, expect, it } from "vitest"

import {
  compareIdentityEntriesOldestFirst,
  digestAnnouncementFingerprint,
} from "~/services/siteAnnouncements/identity"

describe("site announcement identities", () => {
  it("uses lowercase SHA-256 over UTF-8 fingerprints", async () => {
    await expect(digestAnnouncementFingerprint("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
  })

  it("breaks equal timestamps by site key and digest", () => {
    const entries = [
      { siteKey: "site-b", digest: "a", marker: { firstSeenAt: 1, lastSeenAt: 5 } },
      { siteKey: "site-a", digest: "b", marker: { firstSeenAt: 1, lastSeenAt: 5 } },
      { siteKey: "site-a", digest: "a", marker: { firstSeenAt: 1, lastSeenAt: 5 } },
    ]
    expect(entries.sort(compareIdentityEntriesOldestFirst).map(({ siteKey, digest }) => `${siteKey}:${digest}`)).toEqual([
      "site-a:a",
      "site-a:b",
      "site-b:a",
    ])
  })
})
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `pnpm exec vitest run tests/services/siteAnnouncements/identity.test.ts`

Expected: FAIL because `identity.ts` does not exist.

- [ ] **Step 3: Add schema-v2 types and limits**

```ts
export interface SiteAnnouncementIdentityMarker {
  firstSeenAt: number
  lastSeenAt: number
  readAt?: number
}

export interface SiteAnnouncementStoreState {
  schemaVersion: 2
  sites: Record<string, SiteAnnouncementSiteState>
  identityLedger: Record<string, Record<string, SiteAnnouncementIdentityMarker>>
}
```

Set `SITE_ANNOUNCEMENTS_STORE_SCHEMA_VERSION` to `2`, then set `recordsPerSite: 100`, `identitiesPerSite: 1_000`, and `identitiesTotal: 10_000` without changing `summaryLength`.

- [ ] **Step 4: Implement the digest and comparator**

```ts
import type { SiteAnnouncementIdentityMarker } from "~/types/siteAnnouncements"

export interface SiteAnnouncementIdentityEntry {
  siteKey: string
  digest: string
  marker: SiteAnnouncementIdentityMarker
}

export async function digestAnnouncementFingerprint(fingerprint: string) {
  const bytes = new TextEncoder().encode(fingerprint)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

export function compareIdentityEntriesOldestFirst(
  left: SiteAnnouncementIdentityEntry,
  right: SiteAnnouncementIdentityEntry,
) {
  return (
    left.marker.lastSeenAt - right.marker.lastSeenAt ||
    left.siteKey.localeCompare(right.siteKey) ||
    left.digest.localeCompare(right.digest)
  )
}
```

Let missing WebCrypto or digest rejection propagate.

- [ ] **Step 5: Run the focused test**

Run: `pnpm exec vitest run tests/services/siteAnnouncements/identity.test.ts`

Expected: PASS. Do not commit until Task 2 restores repo compile after the schema change.

### Task 2: Migration And Fail-Closed Mutations

**Files:**

- Modify: `src/services/siteAnnouncements/storage.ts`
- Modify: `tests/services/siteAnnouncements/storage.test.ts`
- Include all Task 1 files in the commit.

- [ ] **Step 1: Write failing migration and no-overwrite tests**

Add a schema-v1 fixture containing one unread and one read record. Assert `getStore()` returns schema 2, two marker entries, and preserves the read record's `readAt`. Add mutation tests with storage `get` rejection, schema `999`, and malformed root data; call `markAllRead()` and assert rejection plus no `storage.set` call.

Use this mutation assertion for each invalid source:

```ts
const storageApi = (siteAnnouncementStorage as any).storage
const setSpy = vi.spyOn(storageApi, "set")
vi.spyOn(storageApi, "get").mockResolvedValueOnce({ schemaVersion: 999, sites: {} })

await expect(siteAnnouncementStorage.markAllRead()).rejects.toThrow(
  "Unsupported site announcement store schema",
)
expect(setSpy).not.toHaveBeenCalled()
```

- [ ] **Step 2: Run the storage tests and verify failure**

Run: `pnpm exec vitest run tests/services/siteAnnouncements/storage.test.ts`

Expected: FAIL because schema mismatches currently become empty stores and mutation reads swallow failures.

- [ ] **Step 3: Make store sanitization asynchronous and migrate v1**

Keep the existing record/site normalization, but force every sanitized record's `siteKey` to its outer map key. Implement this store-level control flow:

```ts
function createEmptyStore(): SiteAnnouncementStoreState {
  return { schemaVersion: 2, sites: {}, identityLedger: {} }
}

async function sanitizeStore(value: unknown): Promise<SiteAnnouncementStoreState> {
  if (value === undefined) return createEmptyStore()
  if (!isPlainObject(value)) throw new Error("Malformed site announcement store")
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) {
    throw new Error("Unsupported site announcement store schema")
  }

  const sites = sanitizeSites(value.sites)
  const identityLedger =
    value.schemaVersion === 2 ? sanitizeIdentityLedger(value.identityLedger) : {}

  for (const [siteKey, site] of Object.entries(sites)) {
    const markers = (identityLedger[siteKey] ??= {})
    for (const record of site.records) {
      record.siteKey = siteKey
      const digest = await digestAnnouncementFingerprint(record.fingerprint)
      const current = markers[digest]
      const nextMarker = {
        firstSeenAt: current?.firstSeenAt ?? record.firstSeenAt,
        lastSeenAt: Math.max(current?.lastSeenAt ?? 0, record.lastSeenAt),
        readAt: current?.readAt ?? (record.read ? (record.readAt ?? record.lastSeenAt) : undefined),
      }
      markers[digest] = nextMarker
      if (nextMarker.readAt !== undefined) {
        record.read = true
        record.readAt = nextMarker.readAt
      }
    }
  }

  return { schemaVersion: 2, sites, identityLedger }
}
```

`sanitizeIdentityLedger` must accept only nested plain objects with finite `firstSeenAt`, `lastSeenAt`, and optional finite `readAt`. Tighten the existing record sanitizer to use `Number.isFinite` for `firstSeenAt`, `lastSeenAt`, and optional record timestamps so `NaN` and `Infinity` never enter sorting or pruning.

- [ ] **Step 4: Separate display fallback from mutation reads**

```ts
private async getStoreOrThrow() {
  const stored = await this.storage.get(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE)
  return await sanitizeStore(stored)
}

async getStore() {
  try {
    return await this.getStoreOrThrow()
  } catch (error) {
    logger.error("Failed to load site announcement store", error)
    return createEmptyStore()
  }
}

private async mutateStore<T>(
  mutation: (
    store: SiteAnnouncementStoreState,
  ) =>
    | { changed: boolean; result: T }
    | Promise<{ changed: boolean; result: T }>,
): Promise<T> {
  return await this.withStorageWriteLock(async () => {
    const store = await this.getStoreOrThrow()
    const { changed, result } = await mutation(store)
    if (changed && !(await this.setStore(store))) {
      throw new Error("Failed to persist site announcement store")
    }
    return result
  })
}
```

Adapt every existing mutator to return `{ changed, result }`; unknown ids, empty id arrays, and already-read records use `changed: false`.

- [ ] **Step 5: Run tests and compile**

Run:

```bash
pnpm exec vitest run tests/services/siteAnnouncements/identity.test.ts tests/services/siteAnnouncements/storage.test.ts
pnpm compile
```

Expected: PASS.

- [ ] **Step 6: Commit the persisted contract**

```bash
git add src/types/siteAnnouncements.ts src/services/siteAnnouncements/constants.ts src/services/siteAnnouncements/identity.ts src/services/siteAnnouncements/storage.ts tests/services/siteAnnouncements/identity.test.ts tests/services/siteAnnouncements/storage.test.ts
pnpm run validate:staged
git commit -m "feat(site-announcements): add durable identity ledger"
```

### Task 3: Identity-Aware Upsert And Capacity

**Files:**

- Modify: `src/services/siteAnnouncements/identity.ts`
- Modify: `src/services/siteAnnouncements/storage.ts`
- Modify: `tests/services/siteAnnouncements/identity.test.ts`
- Modify: `tests/services/siteAnnouncements/storage.test.ts`

- [ ] **Step 1: Write the 101-item and pruning tests**

Insert 101 unique fingerprints at one timestamp, repeat them in reverse order, and assert:

```ts
expect(firstCreated).toHaveLength(101)
expect(await siteAnnouncementStorage.listRecords()).toHaveLength(100)
expect(secondCreated).toHaveLength(0)
expect(Object.keys((await siteAnnouncementStorage.getStore()).identityLedger[siteKey]!)).toHaveLength(101)
```

Test `pruneIdentityLedger` with explicit test limits `{ identitiesPerSite: 2, identitiesTotal: 3 }`, including equal timestamps. Assert the oldest deterministic entries disappear and pruning the result again produces an equal ledger.

- [ ] **Step 2: Run tests and verify the old cache-boundary failure**

Run: `pnpm exec vitest run tests/services/siteAnnouncements/identity.test.ts tests/services/siteAnnouncements/storage.test.ts`

Expected: FAIL because complete records still establish all identity state.

- [ ] **Step 3: Implement bounded deterministic pruning**

In `identity.ts`, clone the ledger, prune each site oldest-first to `identitiesPerSite`, flatten the survivors, then prune globally oldest-first to `identitiesTotal`. Use `compareIdentityEntriesOldestFirst` for both passes and remove empty site maps.

The function signature is:

```ts
export function pruneIdentityLedger(
  ledger: SiteAnnouncementStoreState["identityLedger"],
  limits: { identitiesPerSite: number; identitiesTotal: number },
): SiteAnnouncementStoreState["identityLedger"]
```

- [ ] **Step 4: Establish identity before slicing content**

Before acquiring the lock, compute each input digest:

```ts
const inputs = await Promise.all(
  params.records.map(async (record) => ({
    record,
    digest: await digestAnnouncementFingerprint(record.fingerprint),
  })),
)
```

Inside `mutateStore`, treat either a marker or cached raw fingerprint as known. New identities create a marker and complete record; known evicted identities reconstruct content using marker `firstSeenAt`; cached identities refresh timestamps and read projection. Only a record with neither prior marker nor cached record and no provider `readAt` enters `createdRecords`.

After all inputs, apply:

```ts
records.sort(
  (left, right) =>
    right.firstSeenAt - left.firstSeenAt ||
    left.fingerprint.localeCompare(right.fingerprint),
)
site.records = records.slice(0, SITE_ANNOUNCEMENTS_LIMITS.recordsPerSite)
store.identityLedger = pruneIdentityLedger(store.identityLedger, {
  identitiesPerSite: SITE_ANNOUNCEMENTS_LIMITS.identitiesPerSite,
  identitiesTotal: SITE_ANNOUNCEMENTS_LIMITS.identitiesTotal,
})
```

- [ ] **Step 5: Run tests and compile**

Run:

```bash
pnpm exec vitest run tests/services/siteAnnouncements/identity.test.ts tests/services/siteAnnouncements/storage.test.ts
pnpm compile
```

Expected: PASS.

- [ ] **Step 6: Commit retention behavior**

```bash
git add src/services/siteAnnouncements/identity.ts src/services/siteAnnouncements/storage.ts tests/services/siteAnnouncements/identity.test.ts tests/services/siteAnnouncements/storage.test.ts
pnpm run validate:staged
git commit -m "fix(site-announcements): retain identities beyond content cache"
```

### Task 4: Read Projection And Notification Regression

**Files:**

- Modify: `src/services/siteAnnouncements/scheduler.ts`
- Modify: `src/services/siteAnnouncements/storage.ts`
- Modify: `tests/services/siteAnnouncements/storage.test.ts`
- Modify: `tests/services/siteAnnouncements/scheduler.test.ts`

- [ ] **Step 1: Write failing provider-read and mark-all tests**

Add a storage test inserting 101 items, marking the site read, and expecting `markAllRead(siteKey)` to return `101`. Repeat the same inputs and expect zero created records.

Add a scheduler test returning one provider item with `readAt: 1234` and assert:

```ts
expect(response).toMatchObject({ success: true, data: { created: 0, notified: 0 } })
expect(notifySiteAnnouncementsMock).not.toHaveBeenCalled()
expect(await siteAnnouncementStorage.listRecords()).toEqual([
  expect.objectContaining({ read: true, readAt: 1234 }),
])
```

Add a scheduler test returning the same 101 items on two checks with `markAllRead` between them; expect the second result to contain `{ created: 0, notified: 0 }`.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm exec vitest run tests/services/siteAnnouncements/storage.test.ts tests/services/siteAnnouncements/scheduler.test.ts`

Expected: FAIL because scheduler drops provider `readAt` and mark-all visits only cached content.

- [ ] **Step 3: Pass provider `readAt` through `createRecordInput`**

Add `readAt: params.announcement.readAt` beside `createdAt` and `updatedAt` in the returned record input.

- [ ] **Step 4: Make ledger read state authoritative**

`markRead(recordId)` must use an async `mutateStore` callback, locate the cached record under the lock, compute its fingerprint digest, and update both record and marker with one timestamp. `markAllRead(siteKey?)` must visit every selected ledger marker, set missing `readAt`, count marker transitions, then update matching cached projections. Return `{ changed: changedCount > 0, result: changedCount }` from the mutation.

Use this loop for the ledger source:

```ts
for (const selectedSiteKey of selectedSiteKeys) {
  for (const marker of Object.values(store.identityLedger[selectedSiteKey] ?? {})) {
    if (marker.readAt === undefined) {
      marker.readAt = now
      changedCount += 1
    }
  }
}
```

- [ ] **Step 5: Run all affected tests and compile**

Run:

```bash
pnpm exec vitest run tests/services/siteAnnouncements tests/services/apiAdapters/sub2api/siteAnnouncements.test.ts tests/services/apiService/newApiFamily/siteAnnouncements.test.ts
pnpm compile
```

Expected: PASS.

- [ ] **Step 6: Commit read-state behavior**

```bash
git add src/services/siteAnnouncements/scheduler.ts src/services/siteAnnouncements/storage.ts tests/services/siteAnnouncements/storage.test.ts tests/services/siteAnnouncements/scheduler.test.ts
pnpm run validate:staged
git commit -m "fix(site-announcements): preserve read state beyond cached content"
```

### Task 5: Core Slice Validation

**Files:** Review all files changed by Tasks 1-4.

- [ ] **Step 1: Run the focused service suite**

Run: `pnpm exec vitest run tests/services/siteAnnouncements tests/services/apiAdapters/sub2api/siteAnnouncements.test.ts tests/services/apiService/newApiFamily/siteAnnouncements.test.ts`

Expected: PASS.

- [ ] **Step 2: Run the push-equivalent gate**

Run: `pnpm run validate:push`

Expected: PASS for compile and `knip` because persisted types and exports changed.

- [ ] **Step 3: Inspect scope**

Run:

```bash
git diff --check HEAD~3..HEAD
git status --short
```

Expected: only task-scoped files are committed; unrelated workspace files remain untouched.

Each task commit already runs `validate:staged`; inspect the index/worktree after every gate because formatting hooks may update staged files.

## Release Decisions

- **Telemetry:** Reuse existing check and mark-read analytics; identity persistence adds no new user action.
- **E2E:** No Playwright test. Vitest directly covers persistence and scheduler notification behavior.
- **Permissions:** Do not add `unlimitedStorage` or another optional permission.
- **Next slice:** Run the account-lifecycle plan only after this core slice passes independently.
