# Temporary Page Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove scheduler-level account batching and limit active temporary-page operations to three globally and one per origin.

**Architecture:** Add a feature-owned `p-queue` scheduler beside the background temp-window pool. Each self-contained page handler enters its per-origin queue before the global queue, while API-only check-in and post-checkin refresh work dispatch without scheduler batch barriers and remain protected by the existing API transport limiter.

**Tech Stack:** TypeScript, WXT, Manifest V3 background service worker, `p-queue` 9.x, Vitest, pnpm.

---

## File Map

- Create `src/entrypoints/background/tempPageTaskScheduler.ts`: own the global
  page-operation queue, per-origin queues, concurrency constant, and idle queue
  cleanup.
- Create `tests/entrypoints/background/tempPageTaskScheduler.test.ts`: prove
  global admission, continuous refill, same-origin serialization, failure
  release, and non-blocking behavior across origins.
- Modify `src/entrypoints/background/tempWindowPool.ts`: route the five
  self-contained temporary-page handlers through the shared scheduler without
  changing manual `OpenTempWindow`/`CloseTempWindow` semantics.
- Modify
  `tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts`: prove the
  real temp-window handler boundary is globally limited and update existing
  same-origin overlap expectations to the new serialized contract.
- Modify `src/services/checkin/autoCheckin/scheduler.ts`: remove both fixed
  account batches and the 250 ms batch delay while preserving error isolation
  and post-checkin refresh.
- Modify `tests/services/autoCheckin/scheduler.test.ts`: replace batch-shape
  assertions with orchestration and best-effort behavior assertions.
- Modify `package.json` and `pnpm-lock.yaml`: add the direct `p-queue`
  dependency.

### Task 1: Build the page-task scheduler with TDD

**Files:**

- Create: `tests/entrypoints/background/tempPageTaskScheduler.test.ts`
- Create: `src/entrypoints/background/tempPageTaskScheduler.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Confirm the worktree and index are safe**

Run:

```powershell
git status --porcelain
```

Expected: no output. If there is output, preserve unrelated state and stop if it
overlaps any task-scoped file.

- [ ] **Step 2: Add the queue dependency**

Run:

```powershell
pnpm add p-queue@9.3.1
```

Expected: `package.json` gains a direct `p-queue` dependency and
`pnpm-lock.yaml` records `p-queue` plus its transitive dependencies. Do not
modify WXT or manifest configuration.

- [ ] **Step 3: Write the failing scheduler tests**

Create `tests/entrypoints/background/tempPageTaskScheduler.test.ts` with a
local deferred helper and these behaviors:

```ts
import { describe, expect, it, vi } from "vitest"

import { createTempPageTaskScheduler } from "~/entrypoints/background/tempPageTaskScheduler"

const createDeferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

describe("tempPageTaskScheduler", () => {
  it("runs at most three page tasks and refills the first available slot", async () => {
    const scheduler = createTempPageTaskScheduler(3)
    const gates = Array.from({ length: 4 }, () => createDeferred())
    const started: number[] = []

    const tasks = gates.map((gate, index) =>
      scheduler.run(`https://site-${index}.example.invalid`, async () => {
        started.push(index)
        await gate.promise
        return index
      }),
    )

    await vi.waitFor(() => expect(started).toEqual([0, 1, 2]))

    gates[1].resolve()
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3]))

    gates[0].resolve()
    gates[2].resolve()
    gates[3].resolve()
    await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2, 3])
  })

  it("serializes tasks for one origin without occupying another global slot", async () => {
    const scheduler = createTempPageTaskScheduler(3)
    const firstOriginGate = createDeferred()
    const secondOriginGate = createDeferred()
    const otherOriginGate = createDeferred()
    const started: string[] = []

    const first = scheduler.run("https://same.example.invalid", async () => {
      started.push("same-1")
      await firstOriginGate.promise
    })
    const second = scheduler.run("https://same.example.invalid", async () => {
      started.push("same-2")
      await secondOriginGate.promise
    })
    const other = scheduler.run("https://other.example.invalid", async () => {
      started.push("other")
      await otherOriginGate.promise
    })

    await vi.waitFor(() => expect(started).toEqual(["same-1", "other"]))

    firstOriginGate.resolve()
    await vi.waitFor(() =>
      expect(started).toEqual(["same-1", "other", "same-2"]),
    )

    secondOriginGate.resolve()
    otherOriginGate.resolve()
    await Promise.all([first, second, other])
  })

  it("releases global and origin capacity when a task rejects", async () => {
    const scheduler = createTempPageTaskScheduler(1)
    const started: string[] = []

    const failed = scheduler.run("https://example.invalid", async () => {
      started.push("failed")
      throw new Error("page failed")
    })
    const recovered = scheduler.run("https://example.invalid", async () => {
      started.push("recovered")
      return "ok"
    })

    await expect(failed).rejects.toThrow("page failed")
    await expect(recovered).resolves.toBe("ok")
    expect(started).toEqual(["failed", "recovered"])
  })
})
```

- [ ] **Step 4: Run the test and verify RED**

Run:

```powershell
pnpm vitest run tests/entrypoints/background/tempPageTaskScheduler.test.ts
```

Expected: FAIL because
`~/entrypoints/background/tempPageTaskScheduler` does not exist.

- [ ] **Step 5: Implement the minimal scheduler**

Create `src/entrypoints/background/tempPageTaskScheduler.ts`:

```ts
import PQueue from "p-queue"

export const TEMP_PAGE_TASK_CONCURRENCY = 3

export interface TempPageTaskScheduler {
  run<T>(originKey: string, task: () => Promise<T>): Promise<T>
}

function enqueue<T>(queue: PQueue, task: () => Promise<T>): Promise<T> {
  return queue.add(task, { throwOnTimeout: true })
}

/**
 * Creates a scheduler that limits active page work globally and serializes
 * work that may reuse the same origin-scoped tab.
 */
export function createTempPageTaskScheduler(
  concurrency = TEMP_PAGE_TASK_CONCURRENCY,
): TempPageTaskScheduler {
  const globalQueue = new PQueue({ concurrency })
  const originQueues = new Map<string, PQueue>()

  return {
    async run<T>(originKey: string, task: () => Promise<T>): Promise<T> {
      const originQueue =
        originQueues.get(originKey) ?? new PQueue({ concurrency: 1 })
      originQueues.set(originKey, originQueue)

      try {
        return await enqueue(originQueue, () => enqueue(globalQueue, task))
      } finally {
        if (
          originQueue.pending === 0 &&
          originQueue.size === 0 &&
          originQueues.get(originKey) === originQueue
        ) {
          originQueues.delete(originKey)
        }
      }
    },
  }
}

export const tempPageTaskScheduler = createTempPageTaskScheduler()
```

The per-origin queue must be entered before the global queue. Reversing the
order allows several same-origin tasks to consume all global slots while they
wait for one tab.

- [ ] **Step 6: Run the scheduler tests and verify GREEN**

Run:

```powershell
pnpm vitest run tests/entrypoints/background/tempPageTaskScheduler.test.ts
```

Expected: all three tests PASS with no unhandled rejection warnings.

- [ ] **Step 7: Validate and commit the scheduler slice**

Run:

```powershell
git add -- package.json pnpm-lock.yaml src/entrypoints/background/tempPageTaskScheduler.ts tests/entrypoints/background/tempPageTaskScheduler.test.ts
pnpm run validate:staged
git diff --cached --check
git commit -m "feat(temp-window): add page task scheduler"
```

Expected: staged validation passes and the commit contains only the dependency,
scheduler, and focused scheduler test.

### Task 2: Route temporary-page handlers through the scheduler

**Files:**

- Modify: `src/entrypoints/background/tempWindowPool.ts`
- Modify:
  `tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts`

- [ ] **Step 1: Replace same-origin overlap expectations with the desired serialized contract**

In
`tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts`, replace
`"defers same-origin cleanup while a reused temp tab is still busy"` with a
test that keeps the first content fetch pending, starts a second same-origin
fetch, and verifies the second does not enter content work until the first
finishes:

```ts
it("serializes complete operations that reuse a same-origin temp tab", async () => {
  tempContextMode = "tab"
  createTabMock.mockResolvedValueOnce({ id: 608 })

  const firstFetch = createDeferred<any>()
  const secondFetch = createDeferred<any>()
  let fetchAttempt = 0
  sendMessageMock.mockImplementation(
    async (_tabId: number, message: { action: string }) => {
      if (
        message.action === RuntimeActionIds.ContentCheckCapGuard ||
        message.action === RuntimeActionIds.ContentCheckCloudflareGuard
      ) {
        return { success: true, passed: true }
      }
      if (message.action === RuntimeActionIds.ContentShowShieldBypassUi) {
        return undefined
      }
      if (message.action === RuntimeActionIds.ContentPerformTempWindowFetch) {
        fetchAttempt += 1
        return fetchAttempt === 1 ? firstFetch.promise : secondFetch.promise
      }
      throw new Error(`Unexpected action: ${message.action}`)
    },
  )

  const { handleTempWindowFetch } = await import(
    "~/entrypoints/background/tempWindowPool"
  )
  const response = {
    success: true,
    data: { success: true, message: "", data: "ok" },
  }

  const first = handleTempWindowFetch(
    {
      originUrl: "https://example.invalid/one",
      fetchUrl: "https://example.invalid/api/one",
      fetchOptions: { method: "GET" },
      requestId: "same-origin-1",
    },
    vi.fn(),
  )
  await vi.advanceTimersByTimeAsync(500)

  const second = handleTempWindowFetch(
    {
      originUrl: "https://example.invalid/two",
      fetchUrl: "https://example.invalid/api/two",
      fetchOptions: { method: "GET" },
      requestId: "same-origin-2",
    },
    vi.fn(),
  )
  await vi.advanceTimersByTimeAsync(500)
  expect(fetchAttempt).toBe(1)

  firstFetch.resolve(response)
  await first
  await vi.advanceTimersByTimeAsync(500)
  expect(fetchAttempt).toBe(2)

  secondFetch.resolve(response)
  await second
  expect(createTabMock).toHaveBeenCalledTimes(1)
})
```

Replace the existing force-close overlap test with this serialized equivalent.
It proves the queued request is not attached to the active tab and creates a
fresh context after the first operation settles:

```ts
it("recreates a context for queued same-origin work after force close", async () => {
  tempContextMode = "tab"
  createTabMock
    .mockResolvedValueOnce({ id: 650 })
    .mockResolvedValueOnce({ id: 651 })

  const firstFetch = createDeferred<any>()
  let fetchAttempt = 0
  sendMessageMock.mockImplementation(
    async (_tabId: number, message: { action: string }) => {
      if (
        message.action === RuntimeActionIds.ContentCheckCapGuard ||
        message.action === RuntimeActionIds.ContentCheckCloudflareGuard
      ) {
        return { success: true, passed: true }
      }
      if (message.action === RuntimeActionIds.ContentShowShieldBypassUi) {
        return undefined
      }
      if (message.action === RuntimeActionIds.ContentPerformTempWindowFetch) {
        fetchAttempt += 1
        if (fetchAttempt === 1) return firstFetch.promise
        return {
          success: true,
          data: { success: true, message: "", data: "recovered" },
        }
      }
      throw new Error(`Unexpected action: ${message.action}`)
    },
  )

  const { handleCloseTempWindow, handleTempWindowFetch } = await import(
    "~/entrypoints/background/tempWindowPool"
  )
  const firstResponse = vi.fn()
  const first = handleTempWindowFetch(
    {
      originUrl: "https://example.invalid/one",
      fetchUrl: "https://example.invalid/api/one",
      fetchOptions: { method: "GET" },
      requestId: "force-close-1",
    },
    firstResponse,
  )
  await vi.advanceTimersByTimeAsync(500)

  const secondResponse = vi.fn()
  const second = handleTempWindowFetch(
    {
      originUrl: "https://example.invalid/two",
      fetchUrl: "https://example.invalid/api/two",
      fetchOptions: { method: "GET" },
      requestId: "force-close-2",
    },
    secondResponse,
  )
  await vi.advanceTimersByTimeAsync(500)
  expect(fetchAttempt).toBe(1)

  const closeResponse = vi.fn()
  await handleCloseTempWindow(
    { requestId: "force-close-1" },
    closeResponse,
  )
  await vi.advanceTimersByTimeAsync(2000)
  expect(closeResponse).toHaveBeenCalledWith({ success: true })
  expect(removeTabMock).toHaveBeenCalledWith(650)

  firstFetch.reject(new Error("active temp tab was force-closed"))
  await first
  await vi.advanceTimersByTimeAsync(500)
  await second

  expect(createTabMock).toHaveBeenCalledTimes(2)
  expect(fetchAttempt).toBe(2)
  expect(firstResponse).toHaveBeenCalledWith({
    success: false,
    error: "active temp tab was force-closed",
    code: undefined,
  })
  expect(secondResponse).toHaveBeenCalledWith({
    success: true,
    data: { success: true, message: "", data: "recovered" },
  })
})
```

- [ ] **Step 2: Add a failing real-handler global concurrency test**

Add a test using four different reserved example origins. Make each
`ContentPerformTempWindowFetch` call return a separate deferred response:

```ts
it("limits active temp-page handlers to three and continuously refills capacity", async () => {
  tempContextMode = "tab"
  createTabMock.mockImplementation(async () => ({
    id: 700 + createTabMock.mock.calls.length,
  }))

  const fetches = Array.from({ length: 4 }, () => createDeferred<any>())
  let fetchAttempt = 0
  sendMessageMock.mockImplementation(
    async (_tabId: number, message: { action: string }) => {
      if (
        message.action === RuntimeActionIds.ContentCheckCapGuard ||
        message.action === RuntimeActionIds.ContentCheckCloudflareGuard
      ) {
        return { success: true, passed: true }
      }
      if (message.action === RuntimeActionIds.ContentShowShieldBypassUi) {
        return undefined
      }
      if (message.action === RuntimeActionIds.ContentPerformTempWindowFetch) {
        const current = fetchAttempt
        fetchAttempt += 1
        return fetches[current].promise
      }
      throw new Error(`Unexpected action: ${message.action}`)
    },
  )

  const { handleTempWindowFetch } = await import(
    "~/entrypoints/background/tempWindowPool"
  )
  const requests = fetches.map((_fetch, index) =>
    handleTempWindowFetch(
      {
        originUrl: `https://site-${index}.example.invalid`,
        fetchUrl: `https://site-${index}.example.invalid/api/account`,
        fetchOptions: { method: "GET" },
        requestId: `global-page-${index}`,
      },
      vi.fn(),
    ),
  )

  await vi.advanceTimersByTimeAsync(1000)
  expect(fetchAttempt).toBe(3)

  const response = {
    success: true,
    data: { success: true, message: "", data: "ok" },
  }
  fetches[0].resolve(response)
  await vi.advanceTimersByTimeAsync(1000)
  expect(fetchAttempt).toBe(4)

  fetches.slice(1).forEach((fetch) => fetch.resolve(response))
  await Promise.all(requests)
})
```

- [ ] **Step 3: Run the two targeted tests and verify RED**

Run:

```powershell
pnpm vitest run tests/entrypoints/background/tempPageTaskScheduler.test.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts
```

Expected:

- the scheduler unit tests remain green;
- the new real-handler test FAILS because all four different-origin handlers
  currently enter page work;
- the rewritten same-origin test FAILS because the current origin lock covers
  acquisition only and both operations can use one tab concurrently.

- [ ] **Step 4: Add one shared handler wrapper and route all five operations**

Import the scheduler in `src/entrypoints/background/tempWindowPool.ts`:

```ts
import { tempPageTaskScheduler } from "./tempPageTaskScheduler"
```

Add a small helper near the temp-window logging/policy helpers:

```ts
async function runTempPageHandler(
  url: string,
  options: { incognito?: boolean },
  task: () => Promise<void>,
): Promise<void> {
  const originKey = buildTempContextOriginKey(normalizeOrigin(url), options)
  await tempPageTaskScheduler.run(originKey, task)
}
```

Mechanically rename only the five existing function declarations, leaving each
current function body unchanged:

```ts
handleTempWindowGetRenderedTitle -> executeTempWindowGetRenderedTitle
handleAutoDetectSite -> executeAutoDetectSite
handleTempWindowFetch -> executeTempWindowFetch
handleTempWindowCheckinPageAction -> executeTempWindowCheckinPageAction
handleTempWindowTurnstileFetch -> executeTempWindowTurnstileFetch
```

Remove `export` from those five renamed declarations. Then add these queued
public wrappers after their corresponding implementations:

```ts
export async function handleTempWindowGetRenderedTitle(
  request: TempWindowRenderedTitleParams,
  sendResponse: (response?: any) => void,
) {
  await runTempPageHandler(request.originUrl, {}, () =>
    executeTempWindowGetRenderedTitle(request, sendResponse),
  )
}

export async function handleAutoDetectSite(
  request: any,
  sendResponse: (response?: any) => void,
) {
  await runTempPageHandler(
    request.url,
    { incognito: Boolean(request.useIncognito) },
    () => executeAutoDetectSite(request, sendResponse),
  )
}

export async function handleTempWindowFetch(
  request: TempWindowFetchParams,
  sendResponse: (response?: any) => void,
) {
  await runTempPageHandler(
    request.originUrl,
    { incognito: Boolean(request.useIncognito) },
    () => executeTempWindowFetch(request, sendResponse),
  )
}

export async function handleTempWindowCheckinPageAction(
  request: TempWindowCheckinPageActionParams,
  sendResponse: (response?: TempWindowCheckinPageAction) => void,
) {
  await runTempPageHandler(
    request.pageUrl || request.originUrl,
    {},
    () => executeTempWindowCheckinPageAction(request, sendResponse),
  )
}

export async function handleTempWindowTurnstileFetch(
  request: TempWindowTurnstileFetchParams,
  sendResponse: (response?: any) => void,
) {
  await runTempPageHandler(
    request.pageUrl || request.originUrl,
    { incognito: Boolean(request.useIncognito) },
    () => executeTempWindowTurnstileFetch(request, sendResponse),
  )
}
```

Do not route `handleOpenTempWindow` or `handleCloseTempWindow` through this
helper. Do not move `acquireTempContext`, `releaseTempContext`, or their existing
cleanup timers.

- [ ] **Step 5: Run the temp-page tests and verify GREEN**

Run:

```powershell
pnpm vitest run tests/entrypoints/background/tempPageTaskScheduler.test.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts tests/entrypoints/background/tempWindowPoolNativeCheckin.test.ts tests/entrypoints/background/tempWindowPoolProtectionGuards.test.ts tests/entrypoints/background/tempWindowPoolSuspendCleanup.test.ts
```

Expected: all tests PASS. The global test starts the fourth different-origin
task when any one slot completes, and the same-origin test never overlaps
content fetches.

- [ ] **Step 6: Run related validation and commit the integration slice**

Run:

```powershell
pnpm vitest related --run src/entrypoints/background/tempWindowPool.ts src/entrypoints/background/tempPageTaskScheduler.ts
git add -- src/entrypoints/background/tempWindowPool.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts
pnpm run validate:staged
git diff --cached --check
git commit -m "refactor(temp-window): bound active page tasks"
```

Expected: related tests and staged validation pass. The commit does not include
scheduler changes.

### Task 3: Remove both scheduler batch barriers

**Files:**

- Modify: `tests/services/autoCheckin/scheduler.test.ts`
- Modify: `src/services/checkin/autoCheckin/scheduler.ts`

- [ ] **Step 1: Rewrite the daily-run test to require immediate account dispatch**

Replace `"limits concurrent account check-ins during daily runs"` with a test
that holds all five provider promises open and proves all five have started
without advancing a 250 ms batch timer:

```ts
it("dispatches every eligible account without a scheduler batch barrier", async () => {
  const accounts = Array.from({ length: 5 }, (_, index) => ({
    id: `account-${index + 1}`,
    disabled: false,
    site_name: `Site ${index + 1}`,
    site_type: SITE_TYPES.VELOERA,
    account_info: { username: `user-${index + 1}` },
    checkIn: { enableDetection: true, autoCheckInEnabled: true },
  }))
  mockedAccountStorage.getAllAccounts.mockResolvedValue(accounts)

  const completions = accounts.map(() => createDeferred<{ status: "success" }>())
  const provider = {
    canCheckIn: vi.fn(() => true),
    checkIn: vi.fn(
      (_account: unknown, _context: unknown) =>
        completions[provider.checkIn.mock.calls.length - 1].promise,
    ),
  }
  mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider as any)

  const runPromise = autoCheckinScheduler.runCheckins({
    runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
  })

  await vi.waitFor(() => expect(provider.checkIn).toHaveBeenCalledTimes(5))
  completions.forEach((completion) => completion.resolve({ status: "success" }))
  await runPromise

  expect(storedStatus.summary).toMatchObject({
    executed: 5,
    successCount: 5,
    failedCount: 0,
  })
})
```

Add this typed deferred helper near the scheduler test's existing shared test
helpers, then keep the full preferences setup from the current daily-run test
so the test reaches the real scheduler seam:

```ts
const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}
```

- [ ] **Step 2: Rewrite the unexpected-rejection test without batch timing**

Rename `"continues later check-in batches when one account task rejects
unexpectedly"` to `"isolates an unexpected account rejection without aborting
the run"`. Keep the `runAccountCheckin` spy that rejects account 2, remove fake
timer advancement, await the run directly, and preserve these assertions:

```ts
expect(runAccountCheckinSpy).toHaveBeenCalledTimes(4)
expect(storedStatus.lastRunResult).toBe("partial")
expect(storedStatus.summary).toMatchObject({
  executed: 4,
  successCount: 3,
  failedCount: 1,
})
expect(storedStatus.perAccount["account-2"]).toMatchObject({
  status: "failed",
  rawMessage: "Error: unexpected task failure",
})
```

- [ ] **Step 3: Make post-checkin refresh prove best-effort concurrent dispatch**

Update the private-helper refresh test to use four unique account IDs and four
deferred refresh results. Start the refresh and assert all four calls occur
before resolving any result:

```ts
const refreshes = Array.from({ length: 4 }, () => createDeferred<any>())
mockedAccountStorage.refreshAccount.mockImplementation(
  (_accountId: string) =>
    refreshes[mockedAccountStorage.refreshAccount.mock.calls.length - 1].promise,
)

const refreshPromise = (autoCheckinScheduler as any)
  .refreshAccountsAfterSuccessfulCheckins({
    accountIds: ["a", "a", " ", "b", "c", "d"],
    force: false,
    tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
  })

await vi.waitFor(() =>
  expect(mockedAccountStorage.refreshAccount).toHaveBeenCalledTimes(4),
)

refreshes[0].resolve({ refreshed: true })
refreshes[1].resolve(null)
refreshes[2].reject(new Error("refresh failed"))
refreshes[3].resolve({ refreshed: false })
await expect(refreshPromise).resolves.toBeUndefined()
```

Retain assertions that the source and `force: false` are passed to every
refresh. Delete the test that directly calls `processInBatches`, because that
private helper will no longer exist.

- [ ] **Step 4: Run the scheduler test and verify RED**

Run:

```powershell
pnpm vitest run tests/services/autoCheckin/scheduler.test.ts
```

Expected: the new immediate-dispatch tests FAIL because the fourth account is
still held behind the first fixed batch and its timer.

- [ ] **Step 5: Replace batching with concurrency-neutral orchestration**

In `src/services/checkin/autoCheckin/scheduler.ts`, delete:

```ts
private static readonly CHECKIN_EXECUTION_BATCH_SIZE = 3
private static readonly CHECKIN_EXECUTION_BATCH_DELAY_MS = 250
```

Delete `processInBatches`, `delay`, and `runAccountCheckinsInBatches`. Add a
concurrency-neutral account runner that preserves the existing result shape:

```ts
private async runAccountCheckins(params: {
  accounts: SiteAccount[]
  accountDisplayNameById: Map<string, string>
  tempWindowRequestSource: TempWindowRequestSource
}): Promise<
  Array<{
    result: CheckinAccountResult
    successful: boolean
  }>
> {
  return await Promise.all(
    params.accounts.map(async (account) => {
      const accountName =
        params.accountDisplayNameById.get(account.id) ?? account.id

      try {
        return await this.runAccountCheckin(
          account,
          accountName,
          params.tempWindowRequestSource,
        )
      } catch (error) {
        return {
          result: {
            accountId: account.id,
            accountName,
            status: CHECKIN_RESULT_STATUS.FAILED,
            rawMessage: getErrorMessage(error),
            timestamp: Date.now(),
          },
          successful: false,
        }
      }
    }),
  )
}
```

Rename the call site from `runAccountCheckinsInBatches` to
`runAccountCheckins` and change its comment to state that API and page resources
are limited by their owning lower layers.

Replace the refresh `processInBatches` call with a best-effort `Promise.all`
that normalizes each account independently:

```ts
const results = await Promise.all(
  uniqueAccountIds.map(async (accountId): Promise<PostCheckinRefreshOutcome> => {
    try {
      const result = params.tempWindowRequestSource
        ? await accountStorage.refreshAccount(accountId, force, {
            tempWindowRequestSource: params.tempWindowRequestSource,
          })
        : await accountStorage.refreshAccount(accountId, force)

      if (result?.refreshed === true) return "refreshed"
      if (result == null) return "failed"
      return "unchanged"
    } catch {
      return "failed"
    }
  }),
)
```

Keep deduplication, empty-input return, result counts, logging, forced refresh,
source propagation, and the outer best-effort catch unchanged.

- [ ] **Step 6: Run scheduler tests and verify GREEN**

Run:

```powershell
pnpm vitest run tests/services/autoCheckin/scheduler.test.ts
```

Expected: the entire scheduler suite PASSes without advancing an inter-batch
timer, and the post-checkin refresh tests still prove source propagation,
deduplication, default force behavior, empty input, and failure isolation.

- [ ] **Step 7: Run related validation and commit the scheduler slice**

Run:

```powershell
pnpm vitest related --run src/services/checkin/autoCheckin/scheduler.ts
git add -- src/services/checkin/autoCheckin/scheduler.ts tests/services/autoCheckin/scheduler.test.ts
pnpm run validate:staged
git diff --cached --check
git commit -m "refactor(checkin): move limits to resource layers"
```

Expected: related tests and staged validation pass. No batching constants or
batch helper references remain.

### Task 4: Final integration and cross-browser verification

**Files:**

- Inspect all task-scoped files from Tasks 1–3.
- Modify only task-scoped files if validation exposes a real integration issue.

- [ ] **Step 1: Verify obsolete batching and accidental bypasses are absent**

Run:

```powershell
rg -n "CHECKIN_EXECUTION_BATCH|processInBatches|runAccountCheckinsInBatches" src tests
rg -n "tempPageTaskScheduler|runTempPageHandler" src/entrypoints/background tests/entrypoints/background
```

Expected:

- the first command returns no matches;
- the second shows the scheduler module plus all five self-contained page
  handlers and their focused tests;
- manual open/close handlers do not call `runTempPageHandler`.

- [ ] **Step 2: Run focused regression suites**

Run:

```powershell
pnpm vitest run tests/entrypoints/background/tempPageTaskScheduler.test.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts tests/entrypoints/background/tempWindowPoolNativeCheckin.test.ts tests/entrypoints/background/tempWindowPoolProtectionGuards.test.ts tests/entrypoints/background/tempWindowPoolSuspendCleanup.test.ts tests/services/autoCheckin/scheduler.test.ts tests/utils/tempWindowFetch.background.test.ts tests/utils/tempWindowFetch.fallback.test.ts
```

Expected: all focused suites PASS with no unhandled promise rejection or fake
timer leak.

- [ ] **Step 3: Run repository push validation**

Run:

```powershell
pnpm run validate:push
```

Expected: TypeScript compilation and `knip` both PASS. In particular, the new
factory and singleton exports are both considered used.

- [ ] **Step 4: Build every supported browser target**

Run:

```powershell
pnpm run build:all
```

Expected: Chromium, Firefox, and Safari WXT builds PASS, proving `p-queue` is
bundled correctly for each target and does not introduce a Node runtime import.

- [ ] **Step 5: Inspect final repository state and task diff**

Run:

```powershell
git status --porcelain
git log -4 --oneline
git diff HEAD~3..HEAD --check
git diff HEAD~3..HEAD --stat
```

Expected: worktree and index are clean; the three implementation commits are
present after the design/plan commits; diff check reports no whitespace errors;
only the dependency, page scheduler, temp-window integration, scheduler, and
focused tests changed.
