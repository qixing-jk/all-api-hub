# Site Announcement Account Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retain announcement state while any account still references a site, prune orphaned sites after authoritative account changes, and route manual checks through live site keys instead of stale cached account ids.

**Architecture:** Treat changes to `ACCOUNT_STORAGE_KEYS.ACCOUNTS` as the repository-wide account event because imports, WebDAV, tag migration, and ordinary mutations all write that key. Derive retained site keys from event snapshots, serialize reconciliation with announcement checks, and reuse one fail-closed all-account snapshot for pre-poll cleanup and enabled-account selection.

**Tech Stack:** TypeScript, WXT storage events, existing site-announcement providers/storage, React, Vitest, Testing Library.

---

## Preconditions

Complete `2026-07-18-site-announcement-identity-ledger.md` first. This plan expects schema-v2 `identityLedger`, `mutateStore` no-op support, and the 100/1,000/10,000 limits to exist.

## File Map

- Create `src/services/siteAnnouncements/accountLifecycle.ts`: account snapshot validation and retained-site-key derivation.
- Create `tests/services/siteAnnouncements/accountLifecycle.test.ts`: common/Sub2API/disabled account key semantics.
- Create `src/services/siteAnnouncements/operationQueue.ts`: feature-local serialized operation primitive.
- Create `tests/services/siteAnnouncements/operationQueue.test.ts`: ordering and rejection recovery.
- Modify `src/services/siteAnnouncements/storage.ts`: prune orphaned content and ledger state without no-op writes.
- Modify `tests/services/siteAnnouncements/storage.test.ts`: common and Sub2API pruning behavior.
- Modify `src/services/siteAnnouncements/scheduler.ts`: account listener, latest pending snapshot, startup/poll repair, and live manual routing.
- Modify `tests/services/siteAnnouncements/scheduler.test.ts`: event, queue, failure, and live representative behavior.
- Modify `src/services/siteAnnouncements/messaging.ts`: prefer `siteKeys` while retaining `accountIds` compatibility.
- Modify `src/features/SiteAnnouncements/SiteAnnouncements.tsx`: send visible site keys.
- Modify `tests/entrypoints/options/SiteAnnouncementsPage.test.tsx`: assert the new request contract.

### Task 1: Retained Site-Key Derivation

**Files:**

- Create: `src/services/siteAnnouncements/accountLifecycle.ts`
- Create: `tests/services/siteAnnouncements/accountLifecycle.test.ts`

- [ ] **Step 1: Write failing common/Sub2API lifecycle tests**

```ts
import { describe, expect, it } from "vitest"

import {
  deriveRetainedSiteKeys,
  readAccountsFromStorageChangeValue,
} from "~/services/siteAnnouncements/accountLifecycle"

describe("site announcement account lifecycle", () => {
  it("dedupes common sites and retains disabled accounts", () => {
    const keys = deriveRetainedSiteKeys([
      createAccount({ id: "common-1", disabled: true }),
      createAccount({ id: "common-2" }),
    ])
    expect([...keys]).toEqual(["notice:new-api:https://example.invalid"])
  })

  it("keeps Sub2API identities account scoped", () => {
    const keys = deriveRetainedSiteKeys([
      createAccount({ id: "sub-1", site_type: "sub2api" }),
      createAccount({ id: "sub-2", site_type: "sub2api" }),
    ])
    expect([...keys].sort()).toEqual([
      "sub2api:sub-1:https://example.invalid",
      "sub2api:sub-2:https://example.invalid",
    ])
  })

  it("distinguishes intentional removal from malformed event data", () => {
    expect(readAccountsFromStorageChangeValue(undefined)).toEqual([])
    expect(() => readAccountsFromStorageChangeValue({ accounts: "broken" })).toThrow(
      "Malformed account storage change",
    )
  })
})
```

Use the scheduler test's existing account factory shape but reserved `example.invalid` domains.

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `pnpm exec vitest run tests/services/siteAnnouncements/accountLifecycle.test.ts`

Expected: FAIL because `accountLifecycle.ts` does not exist.

- [ ] **Step 3: Implement strict event parsing and key derivation**

```ts
import { normalizeAccountStorageConfigForRead } from "~/services/accounts/accountDefaults"
import { getSiteAnnouncementProvider } from "~/services/siteAnnouncements/providers"
import type { AccountStorageConfig, SiteAccount } from "~/types"
import { isPlainObject } from "~/utils/core/object"

export function readAccountsFromStorageChangeValue(value: unknown): SiteAccount[] {
  if (value === undefined) return []
  if (!isPlainObject(value) || !Array.isArray(value.accounts)) {
    throw new Error("Malformed account storage change")
  }
  return normalizeAccountStorageConfigForRead(value as AccountStorageConfig).accounts
}

export function deriveRetainedSiteKeys(accounts: readonly SiteAccount[]) {
  const keys = new Set<string>()
  for (const account of accounts) {
    const provider = getSiteAnnouncementProvider(account.site_type)
    keys.add(
      provider.createSiteKey({
        accountId: account.id,
        siteType: account.site_type,
        baseUrl: account.site_url,
      }),
    )
  }
  return keys
}

export function haveEqualSiteKeys(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && [...left].every((key) => right.has(key))
}
```

Disabled state is deliberately ignored by key derivation.

- [ ] **Step 4: Run focused tests and compile**

Run:

```bash
pnpm exec vitest run tests/services/siteAnnouncements/accountLifecycle.test.ts
pnpm compile
```

Expected: PASS.

- [ ] **Step 5: Commit the pure lifecycle boundary**

```bash
git add src/services/siteAnnouncements/accountLifecycle.ts tests/services/siteAnnouncements/accountLifecycle.test.ts
pnpm run validate:staged
git commit -m "feat(site-announcements): derive retained account site keys"
```

### Task 2: Orphaned State Pruning

**Files:**

- Modify: `src/services/siteAnnouncements/storage.ts`
- Modify: `tests/services/siteAnnouncements/storage.test.ts`

- [ ] **Step 1: Write failing lifecycle pruning tests**

Seed two common-site records and two account-scoped Sub2API records. Assert:

```ts
await expect(
  siteAnnouncementStorage.pruneOrphanedSites(
    new Set(["notice:new-api:https://example.invalid"]),
  ),
).resolves.toBe(true)

const store = await siteAnnouncementStorage.getStore()
expect(Object.keys(store.sites)).toEqual([
  "notice:new-api:https://example.invalid",
])
expect(Object.keys(store.identityLedger)).toEqual([
  "notice:new-api:https://example.invalid",
])
```

Call the same method again with the same set, spy on storage `set`, and assert it returns `false` without another write. Add a throwing-read case and assert no write.

- [ ] **Step 2: Run the storage test and verify the missing-method failure**

Run: `pnpm exec vitest run tests/services/siteAnnouncements/storage.test.ts`

Expected: FAIL because `pruneOrphanedSites` does not exist.

- [ ] **Step 3: Implement atomic content/ledger pruning**

```ts
async pruneOrphanedSites(retainedSiteKeys: ReadonlySet<string>): Promise<boolean> {
  return await this.mutateStore((store) => {
    let changed = false
    const storedSiteKeys = new Set([
      ...Object.keys(store.sites),
      ...Object.keys(store.identityLedger),
    ])

    for (const siteKey of storedSiteKeys) {
      if (retainedSiteKeys.has(siteKey)) continue
      if (siteKey in store.sites) {
        delete store.sites[siteKey]
        changed = true
      }
      if (siteKey in store.identityLedger) {
        delete store.identityLedger[siteKey]
        changed = true
      }
    }

    return { changed, result: changed }
  })
}
```

- [ ] **Step 4: Run storage tests and compile**

Run:

```bash
pnpm exec vitest run tests/services/siteAnnouncements/storage.test.ts
pnpm compile
```

Expected: PASS.

- [ ] **Step 5: Commit lifecycle pruning**

```bash
git add src/services/siteAnnouncements/storage.ts tests/services/siteAnnouncements/storage.test.ts
pnpm run validate:staged
git commit -m "feat(site-announcements): prune orphaned account sites"
```

### Task 3: Serialized Event And Poll Reconciliation

**Files:**

- Create: `src/services/siteAnnouncements/operationQueue.ts`
- Create: `tests/services/siteAnnouncements/operationQueue.test.ts`
- Modify: `src/services/siteAnnouncements/scheduler.ts`
- Modify: `tests/services/siteAnnouncements/scheduler.test.ts`

- [ ] **Step 1: Write failing operation queue tests**

```ts
import { describe, expect, it, vi } from "vitest"

import { SiteAnnouncementOperationQueue } from "~/services/siteAnnouncements/operationQueue"

describe("SiteAnnouncementOperationQueue", () => {
  it("runs operations in insertion order", async () => {
    const queue = new SiteAnnouncementOperationQueue()
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const calls: string[] = []
    const first = queue.enqueue(async () => {
      calls.push("first-start")
      await released
      calls.push("first-end")
    })
    const second = queue.enqueue(async () => calls.push("second"))
    await Promise.resolve()
    expect(calls).toEqual(["first-start"])
    release()
    await Promise.all([first, second])
    expect(calls).toEqual(["first-start", "first-end", "second"])
  })

  it("continues after a rejected operation", async () => {
    const queue = new SiteAnnouncementOperationQueue()
    await expect(queue.enqueue(async () => { throw new Error("failed") })).rejects.toThrow("failed")
    await expect(queue.enqueue(async () => "recovered")).resolves.toBe("recovered")
  })
})
```

- [ ] **Step 2: Run the queue test and verify the missing-module failure**

Run: `pnpm exec vitest run tests/services/siteAnnouncements/operationQueue.test.ts`

Expected: FAIL because `operationQueue.ts` does not exist.

- [ ] **Step 3: Implement the feature-local queue**

```ts
export class SiteAnnouncementOperationQueue {
  private tail: Promise<void> = Promise.resolve()

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}
```

- [ ] **Step 4: Write failing scheduler lifecycle tests**

Extend the account storage mock with `getAllAccountsOrThrow`. Capture the callback registered through a mocked `onStorageChanged`. Add tests proving:

- same retained keys between `oldValue` and `newValue` cause no prune;
- deleting the last common account queues one prune;
- deleting one of two common accounts keeps the shared site;
- a pending newer snapshot replaces an older pending snapshot while a check runs;
- startup and each poll call `getAllAccountsOrThrow` once and reuse that snapshot;
- account read rejection returns `null`, performs no provider fetch, and performs no announcement write;
- disabled accounts remain in retained keys but are filtered before provider fetch.

Use this failure assertion:

```ts
getAllAccountsOrThrowMock.mockRejectedValueOnce(new Error("accounts unavailable"))
const response = await resolveSiteAnnouncementsCheckNowMessage({})
expect(response).toEqual({ success: true, data: null })
expect(providerFetchMock).not.toHaveBeenCalled()
expect(pruneOrphanedSitesSpy).not.toHaveBeenCalled()
```

- [ ] **Step 5: Register the account event before the first await**

Import `ACCOUNT_STORAGE_KEYS`, `onStorageChanged`, and the lifecycle helpers. During `initialize()`, register once before schedule initialization:

```ts
this.cleanupAccountChanges = onStorageChanged((changes, areaName) => {
  if (areaName !== "local") return
  const change = changes[ACCOUNT_STORAGE_KEYS.ACCOUNTS]
  if (!change) return
  try {
    const previous = readAccountsFromStorageChangeValue(change.oldValue)
    const next = readAccountsFromStorageChangeValue(change.newValue)
    if (haveEqualSiteKeys(deriveRetainedSiteKeys(previous), deriveRetainedSiteKeys(next))) return
    this.requestAccountReconciliation(next)
  } catch (error) {
    logger.error("Failed to process account storage change", error)
  }
})
```

Do not use `setTimeout`.

- [ ] **Step 6: Coalesce snapshots and serialize checks**

Add queue state to the scheduler:

```ts
private operationQueue = new SiteAnnouncementOperationQueue()
private pendingReconciliation: SiteAccount[] | null = null
private reconciliationScheduled = false
private checkQueuedOrRunning = false
```

`requestAccountReconciliation(accounts)` stores the newest array and drains it with:

```ts
private requestAccountReconciliation(accounts: SiteAccount[]) {
  this.pendingReconciliation = accounts
  if (this.reconciliationScheduled) return

  this.reconciliationScheduled = true
  void this.operationQueue
    .enqueue(async () => {
      while (this.pendingReconciliation !== null) {
        const snapshot = this.pendingReconciliation
        this.pendingReconciliation = null
        await siteAnnouncementStorage.pruneOrphanedSites(
          deriveRetainedSiteKeys(snapshot),
        )
      }
    })
    .catch((error) => {
      logger.error("Failed to reconcile site announcement accounts", error)
    })
    .finally(() => {
      this.reconciliationScheduled = false
      if (this.pendingReconciliation !== null) {
        this.requestAccountReconciliation(this.pendingReconciliation)
      }
    })
}
```

Wrap manual/alarm checks in the same queue. Preserve the current overlapping-check contract with:

```ts
private async runCheck(params: SiteAnnouncementCheckParams) {
  if (this.checkQueuedOrRunning) return null
  this.checkQueuedOrRunning = true
  try {
    return await this.operationQueue.enqueue(() => this.runCheckInternal(params))
  } finally {
    this.checkQueuedOrRunning = false
  }
}
```

- [ ] **Step 7: Reuse one successful account snapshot per poll**

At the start of the queued internal check:

```ts
const allAccounts = await accountStorage.getAllAccountsOrThrow()
await siteAnnouncementStorage.pruneOrphanedSites(
  deriveRetainedSiteKeys(allAccounts),
)
const enabledAccounts = allAccounts.filter((account) => account.disabled !== true)
```

Use `enabledAccounts` for dedupe/filter/fetch. Any read rejection exits the whole check before storage mutation or provider IO. Scheduler initialization performs the same reconciliation once as a repair point, then passes `enabledAccounts` into schedule calculation so initialization does not issue a second account read. Later settings/status schedule reconciliation obtains one new `getAllAccountsOrThrow()` snapshot and never calls the swallowing `getEnabledAccounts()` path.

- [ ] **Step 8: Run queue/scheduler tests and compile**

Run:

```bash
pnpm exec vitest run tests/services/siteAnnouncements/operationQueue.test.ts tests/services/siteAnnouncements/accountLifecycle.test.ts tests/services/siteAnnouncements/storage.test.ts tests/services/siteAnnouncements/scheduler.test.ts
pnpm compile
```

Expected: PASS.

- [ ] **Step 9: Commit event-driven reconciliation**

```bash
git add src/services/siteAnnouncements/operationQueue.ts src/services/siteAnnouncements/scheduler.ts tests/services/siteAnnouncements/operationQueue.test.ts tests/services/siteAnnouncements/scheduler.test.ts
pnpm run validate:staged
git commit -m "feat(site-announcements): reconcile account lifecycle events"
```

### Task 4: Live Site-Key Manual Checks

**Files:**

- Modify: `src/services/siteAnnouncements/messaging.ts`
- Modify: `src/services/siteAnnouncements/scheduler.ts`
- Modify: `src/features/SiteAnnouncements/SiteAnnouncements.tsx`
- Modify: `tests/services/siteAnnouncements/scheduler.test.ts`
- Modify: `tests/entrypoints/options/SiteAnnouncementsPage.test.tsx`

- [ ] **Step 1: Write failing UI and scheduler routing tests**

Update options tests to expect:

```ts
expect(sendSiteAnnouncementsMessage).toHaveBeenCalledWith(
  SiteAnnouncementsMessageTypes.CheckNow,
  { siteKeys: ["notice:new-api:https://example.invalid"] },
)
```

Add a scheduler test with a cached common site whose old representative account is absent, plus another enabled account resolving to the same site key. Send that `siteKey` and assert the provider receives the live account. Add a Sub2API test proving only the exact account-specific key is selected.

- [ ] **Step 2: Run the UI and scheduler tests and verify the contract failure**

Run:

```bash
pnpm exec vitest run tests/services/siteAnnouncements/scheduler.test.ts tests/entrypoints/options/SiteAnnouncementsPage.test.tsx
```

Expected: FAIL because the request and UI still use cached `accountIds`.

- [ ] **Step 3: Add the preferred request field with compatibility**

```ts
export interface SiteAnnouncementsCheckNowRequest {
  siteKeys?: string[]
  /** Compatibility for extension pages opened before a background update. */
  accountIds?: string[]
}
```

Change `runManualCheck` and `runCheck` to accept the request object. If `siteKeys` is present, create each enabled account's live provider site key and retain one representative per requested key. If only legacy `accountIds` is present, preserve the current enabled-id filter. If neither exists, check all enabled accounts.

- [ ] **Step 4: Send site keys from the options page**

Replace `manualCheckAccountIds` with:

```ts
const manualCheckSiteKeys = useMemo(
  () => [...new Set(filteredRecords.map((record) => record.siteKey))],
  [filteredRecords],
)
```

Use its length for `canRunManualCheck` and send `{ siteKeys: manualCheckSiteKeys }`. Do not derive routing from `record.accountId`; it remains provenance for rendering and Sub2API single-record upstream read synchronization.

- [ ] **Step 5: Run component, scheduler, and compile checks**

Run:

```bash
pnpm exec vitest run tests/services/siteAnnouncements/scheduler.test.ts tests/entrypoints/options/SiteAnnouncementsPage.test.tsx
pnpm compile
```

Expected: PASS.

- [ ] **Step 6: Commit live manual routing**

```bash
git add src/services/siteAnnouncements/messaging.ts src/services/siteAnnouncements/scheduler.ts src/features/SiteAnnouncements/SiteAnnouncements.tsx tests/services/siteAnnouncements/scheduler.test.ts tests/entrypoints/options/SiteAnnouncementsPage.test.tsx
pnpm run validate:staged
git commit -m "fix(site-announcements): route manual checks by live site"
```

### Task 5: Lifecycle Slice Validation

**Files:** Review all files changed by Tasks 1-4.

- [ ] **Step 1: Run focused service and options tests**

Run:

```bash
pnpm exec vitest run tests/services/siteAnnouncements tests/entrypoints/options/SiteAnnouncementsPage.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the push-equivalent gate**

Run: `pnpm run validate:push`

Expected: PASS for compile and `knip` because new executable modules and shared runtime contracts were added.

- [ ] **Step 3: Inspect scope**

Run:

```bash
git diff --check HEAD~4..HEAD
git status --short
```

Expected: only lifecycle files are committed; unrelated workspace files remain untouched.

Each task commit already runs `validate:staged`; inspect the index/worktree after every gate because formatting hooks may update staged files.

## Release Decisions

- **Telemetry:** Reuse existing manual-check analytics. The request changes routing identity but does not add a new action or setting.
- **E2E:** No Playwright test. The risk is account snapshot/event ordering and runtime payload mapping, covered by Vitest and Testing Library.
- **Settings discoverability:** No settings are added, renamed, moved, or removed.
- **Permissions:** No permission changes.
- **Compatibility:** Keep `accountIds` only as a narrow mixed-version runtime shim; route all new UI work through `siteKeys`.
