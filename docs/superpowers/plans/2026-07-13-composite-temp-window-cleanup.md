# Composite Temp Window Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close an extension-owned composite window explicitly when its final temp tab finishes, preserve other tabs and concurrent opens, and warn when an unknown browser handle falls back from window removal to tab removal.

**Architecture:** Preserve the actual temp-context mode and composite owner window ID instead of collapsing all composite contexts to an untyped tab handle. Route known handles through explicit `removeWindow` and `removeTab` adapters, serialize composite window creation/removal with a global operation queue, and reserve `removeTabOrWindow` for genuinely unknown legacy handles with warning-level fallback logging.

**Tech Stack:** TypeScript, WXT Manifest V3 background service worker, WebExtension `windows`/`tabs` APIs, Vitest browser API mocks.

---

### Task 1: Make Browser Removal APIs Explicit and Observable

**Files:**

- Modify: `src/utils/browser/browserApi.ts:149-173`
- Test: `tests/utils/browserApi.test.ts:1-85`
- Test: `tests/utils/browserApi.test.ts:1218-1264`

- [ ] **Step 1: Write failing adapter and warning tests**

Import `removeTab` and `removeWindow` beside `removeTabOrWindow`, then replace the existing fallback test with the following assertions and add direct adapter tests:

```ts
it("warns before falling back to tab removal", async () => {
  const error = new Error("not a window")
  const removeWindowMock = vi.fn().mockRejectedValueOnce(error)
  const removeTabMock = vi.fn().mockResolvedValue(undefined)
  ;(globalThis as any).browser.windows.remove = removeWindowMock
  ;(globalThis as any).browser.tabs.remove = removeTabMock

  await removeTabOrWindow(42)

  expect(removeWindowMock).toHaveBeenCalledWith(42)
  expect(loggerMock.warn).toHaveBeenCalledWith(
    "removeTabOrWindow: Failed to remove as window, falling back to tab",
    { id: 42, error },
  )
  expect(removeTabMock).toHaveBeenCalledWith(42)
  expect(removeWindowMock.mock.invocationCallOrder[0]).toBeLessThan(
    removeTabMock.mock.invocationCallOrder[0],
  )
})

it("removes a known tab without probing the windows API", async () => {
  const removeTabMock = vi.fn().mockResolvedValue(undefined)
  const removeWindowMock = vi.fn().mockResolvedValue(undefined)
  ;(globalThis as any).browser.tabs.remove = removeTabMock
  ;(globalThis as any).browser.windows.remove = removeWindowMock

  await removeTab(43)

  expect(removeTabMock).toHaveBeenCalledWith(43)
  expect(removeWindowMock).not.toHaveBeenCalled()
  expect(loggerMock.warn).not.toHaveBeenCalled()
})

it("removes a known window without probing the tabs API", async () => {
  const removeTabMock = vi.fn().mockResolvedValue(undefined)
  const removeWindowMock = vi.fn().mockResolvedValue(undefined)
  ;(globalThis as any).browser.tabs.remove = removeTabMock
  ;(globalThis as any).browser.windows.remove = removeWindowMock

  await removeWindow(44)

  expect(removeWindowMock).toHaveBeenCalledWith(44)
  expect(removeTabMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
pnpm exec vitest run tests/utils/browserApi.test.ts -t "warns before falling back|removes a known"
```

Expected: failure because `removeTab` and `removeWindow` are not exported and the fallback currently logs at debug level.

- [ ] **Step 3: Implement explicit adapters and warning-level fallback**

Replace the ambiguous removal block with:

```ts
export async function removeTab(tabId: number): Promise<void> {
  await browser.tabs.remove(tabId)
}

export async function removeWindow(windowId: number): Promise<void> {
  if (!hasWindowsAPI()) {
    throw new Error("browser.windows.remove is unavailable")
  }

  await browser.windows.remove(windowId)
}

export async function removeTabOrWindow(id: number): Promise<void> {
  if (hasWindowsAPI()) {
    try {
      await removeWindow(id)
      return
    } catch (error) {
      logger.warn(
        "removeTabOrWindow: Failed to remove as window, falling back to tab",
        { id, error },
      )
    }
  }

  await removeTab(id)
}
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command again.

Expected: all selected tests pass and the warning assertion contains the original error object.

- [ ] **Step 5: Commit the adapter slice**

```powershell
git add -- src/utils/browser/browserApi.ts tests/utils/browserApi.test.ts
git commit -m "fix(browser): warn on cleanup fallback"
```

### Task 2: Preserve Typed Temp Handles and Close the Final Composite Window

**Files:**

- Modify: `src/entrypoints/background/tempWindowPool.ts:428-447`
- Modify: `src/entrypoints/background/tempWindowPool.ts:687-702`
- Modify: `src/entrypoints/background/tempWindowPool.ts:788-985`
- Modify: `src/entrypoints/background/tempWindowPool.ts:2012-2316`
- Modify: `src/entrypoints/background/tempWindowPool.ts:2547-2712`
- Test: `tests/entrypoints/background/tempWindowPoolOpenClose.test.ts`
- Test: `tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts`

- [ ] **Step 1: Add failing final-window and multi-tab tests**

Extend the browser API mocks in both test files with `removeTabMock` and `removeWindowMock`. In the open/close test, add:

```ts
it("closes the owner window for the final manual composite tab", async () => {
  tempContextMode = "composite"
  createWindowMock.mockResolvedValueOnce({ id: 901 })
  tabsQueryMock.mockResolvedValue([{ id: 902 }])

  const { handleCloseTempWindow, handleOpenTempWindow } = await import(
    "~/entrypoints/background/tempWindowPool"
  )
  await handleOpenTempWindow(
    {
      requestId: "req-composite-final",
      url: "https://example.invalid/composite/final",
    },
    vi.fn(),
  )

  const closeResponse = vi.fn()
  await handleCloseTempWindow(
    { requestId: "req-composite-final" },
    closeResponse,
  )

  expect(removeWindowMock).toHaveBeenCalledWith(901)
  expect(removeTabMock).not.toHaveBeenCalled()
  expect(removeTabOrWindowMock).not.toHaveBeenCalled()
  expect(closeResponse).toHaveBeenCalledWith({ success: true })
})

it("removes only the completed composite tab when another tab exists", async () => {
  tempContextMode = "composite"
  createWindowMock.mockResolvedValueOnce({ id: 911 })
  tabsQueryMock
    .mockResolvedValueOnce([{ id: 912 }])
    .mockResolvedValueOnce([{ id: 912 }, { id: 913 }])

  const { handleCloseTempWindow, handleOpenTempWindow } = await import(
    "~/entrypoints/background/tempWindowPool"
  )
  await handleOpenTempWindow(
    {
      requestId: "req-composite-shared",
      url: "https://example.invalid/composite/shared",
    },
    vi.fn(),
  )

  await handleCloseTempWindow(
    { requestId: "req-composite-shared" },
    vi.fn(),
  )

  expect(removeTabMock).toHaveBeenCalledWith(912)
  expect(removeWindowMock).not.toHaveBeenCalled()
  expect(removeTabOrWindowMock).not.toHaveBeenCalled()
})
```

Add a pooled-context regression in `tempWindowPoolWindowFallback.test.ts` by adapting the existing composite fetch cleanup scenario to assert that `windowId=305` is removed when `tabId=306` is the only tab:

```ts
await vi.advanceTimersByTimeAsync(2500)
expect(removeWindowMock).toHaveBeenCalledWith(305)
expect(removeTabMock).not.toHaveBeenCalledWith(306)
expect(removeTabOrWindowMock).not.toHaveBeenCalledWith(306)
```

- [ ] **Step 2: Run the three selected tests and verify RED**

Run:

```powershell
pnpm exec vitest run tests/entrypoints/background/tempWindowPoolOpenClose.test.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts -t "final manual composite|another tab exists|continues composite temp-window fetches"
```

Expected: the current code calls `removeTabOrWindow(tabId)` and does not retain the composite owner window ID.

- [ ] **Step 3: Add typed handles and preserve actual open mode**

Introduce these shapes near the existing temp context types:

```ts
type TempWindowHandle =
  | { kind: "window"; windowId: number }
  | { kind: "tab"; tabId: number }
  | { kind: "composite"; tabId: number; windowId: number }

type TempContext = {
  id: number
  tabId: number
  origin: string
  type: "window" | "tab"
  mode: TempContextOpenMode
  ownerWindowId?: number
  currentUrl?: string
  activeRequestIds: Set<string>
  lastUsed: number
  downloadBlockRuleId?: number | null
  firefoxDownloadBlockTabId?: number | null
  releaseTimer?: ReturnType<typeof setTimeout>
}

type TempContextOpenResult = {
  id: number
  tabId: number
  type: "window" | "tab"
  mode: TempContextOpenMode
  ownerWindowId?: number
}
```

Change `tempWindows` to `Map<string, TempWindowHandle>`. Make popup, plain-tab,
and composite open paths save the matching discriminated handle. Return
`mode: "window"`, `mode: "tab"`, or `mode: "composite"` from the actual open
path so a window-creation rollback records `tab`.

- [ ] **Step 4: Add a shared known-handle cleanup helper**

Add a composite-aware removal function and route both manual handles and pooled
contexts through it:

```ts
async function removeCompositeTab(windowId: number, tabId: number) {
  let tabs: browser.tabs.Tab[]

  try {
    tabs = await queryTabs({ windowId })
  } catch (error) {
    logger.warn("Failed to inspect composite temp window; removing tab only", {
      windowId,
      tabId,
      error,
    })
    await removeTab(tabId)
    return
  }

  const isOnlyTab = tabs.length === 1 && tabs[0]?.id === tabId
  if (!isOnlyTab) {
    await removeTab(tabId)
    return
  }

  if (compositeWindowId === windowId) {
    compositeWindowId = null
  }

  try {
    await removeWindow(windowId)
  } catch (error) {
    logger.warn(
      "Failed to remove final composite temp window; falling back to tab",
      { windowId, tabId, error },
    )
    await removeTab(tabId)
  }
}

async function removeTempWindowHandle(handle: TempWindowHandle) {
  switch (handle.kind) {
    case "window":
      await removeWindow(handle.windowId)
      return
    case "composite":
      await removeCompositeTab(handle.windowId, handle.tabId)
      return
    case "tab":
      await removeTab(handle.tabId)
  }
}
```

Update listener comparisons to inspect the discriminated fields and remove all
manual handles belonging to a removed composite window. Replace known-ID
creation-error and stale-window cleanup calls with explicit window/tab helpers.

- [ ] **Step 5: Run the selected tests and verify GREEN**

Run the Step 2 command again.

Expected: sole composite tabs close their owner window, shared windows keep
other tabs, and no known-handle path calls `removeTabOrWindow`.

- [ ] **Step 6: Commit the ownership slice**

```powershell
git add -- src/entrypoints/background/tempWindowPool.ts tests/entrypoints/background/tempWindowPoolOpenClose.test.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts
git commit -m "fix(background): close final composite temp window"
```

### Task 3: Serialize Composite Open and Close Operations

**Files:**

- Modify: `src/entrypoints/background/tempWindowPool.ts:698-702`
- Modify: `src/entrypoints/background/tempWindowPool.ts:2366-2545`
- Modify: `src/entrypoints/background/tempWindowPool.ts` composite cleanup helper from Task 2
- Test: `tests/entrypoints/background/tempWindowPoolOpenClose.test.ts`

- [ ] **Step 1: Write the failing open-versus-close race test**

Add a test that holds final-window inspection pending while another composite
open begins:

```ts
it("serializes final composite cleanup with a concurrent open", async () => {
  tempContextMode = "composite"
  createWindowMock
    .mockResolvedValueOnce({ id: 921 })
    .mockResolvedValueOnce({ id: 925 })
  tabsQueryMock.mockResolvedValueOnce([{ id: 922 }])

  let resolveCleanupQuery!: (tabs: browser.tabs.Tab[]) => void
  tabsQueryMock.mockReturnValueOnce(
    new Promise<browser.tabs.Tab[]>((resolve) => {
      resolveCleanupQuery = resolve
    }),
  )
  tabsQueryMock.mockResolvedValueOnce([{ id: 926 }])

  const { handleCloseTempWindow, handleOpenTempWindow } = await import(
    "~/entrypoints/background/tempWindowPool"
  )
  await handleOpenTempWindow(
    {
      requestId: "req-composite-race-old",
      url: "https://example.invalid/composite/race/old",
    },
    vi.fn(),
  )

  const closePromise = handleCloseTempWindow(
    { requestId: "req-composite-race-old" },
    vi.fn(),
  )
  const nextResponse = vi.fn()
  const nextOpenPromise = handleOpenTempWindow(
    {
      requestId: "req-composite-race-new",
      url: "https://example.invalid/composite/race/new",
    },
    nextResponse,
  )

  expect(createWindowMock).toHaveBeenCalledTimes(1)
  resolveCleanupQuery([{ id: 922 } as browser.tabs.Tab])
  await Promise.all([closePromise, nextOpenPromise])

  expect(removeWindowMock).toHaveBeenCalledWith(921)
  expect(createWindowMock).toHaveBeenCalledTimes(2)
  expect(nextResponse).toHaveBeenCalledWith({
    success: true,
    windowId: 925,
    tabId: 926,
  })
})
```

- [ ] **Step 2: Run the race test and verify RED**

Run:

```powershell
pnpm exec vitest run tests/entrypoints/background/tempWindowPoolOpenClose.test.ts -t "serializes final composite cleanup"
```

Expected: the second open reuses or races with window `921` before cleanup has
finished because only initial window creation is currently coordinated.

- [ ] **Step 3: Implement the composite operation queue**

Replace the creation-only promise with a queue that survives rejected
operations:

```ts
let compositeWindowOperationQueue: Promise<void> = Promise.resolve()

async function withCompositeWindowLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = compositeWindowOperationQueue.then(operation, operation)
  compositeWindowOperationQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return await result
}
```

Move the existing body of `openTabInCompositeWindow()` into
`openTabInCompositeWindowLocked()` and make the public helper call it through
`withCompositeWindowLock`. Run `removeCompositeTab()` through the same lock.
Keep partial-window cleanup inside the already-locked function so it never
recursively acquires the queue.

- [ ] **Step 4: Run the race and existing concurrency tests**

Run:

```powershell
pnpm exec vitest run tests/entrypoints/background/tempWindowPoolOpenClose.test.ts -t "serializes final composite cleanup|shares an in-flight composite window creation|surfaces a concurrent composite-tab creation failure"
```

Expected: all selected tests pass; concurrent opens still share one window,
while an open that begins during final cleanup waits and uses the next window.

- [ ] **Step 5: Commit the synchronization slice**

```powershell
git add -- src/entrypoints/background/tempWindowPool.ts tests/entrypoints/background/tempWindowPoolOpenClose.test.ts
git commit -m "fix(background): serialize composite window cleanup"
```

### Task 4: Validate the Integrated Fix

**Files:**

- Verify: `src/utils/browser/browserApi.ts`
- Verify: `src/entrypoints/background/tempWindowPool.ts`
- Verify: `tests/utils/browserApi.test.ts`
- Verify: `tests/entrypoints/background/tempWindowPoolOpenClose.test.ts`
- Verify: `tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts`

- [ ] **Step 1: Run all affected tests**

```powershell
pnpm exec vitest run tests/utils/browserApi.test.ts tests/entrypoints/background/tempWindowPoolOpenClose.test.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts
```

Expected: all tests in the three files pass.

- [ ] **Step 2: Run related-test discovery for production changes**

```powershell
pnpm exec vitest related --run src/utils/browser/browserApi.ts src/entrypoints/background/tempWindowPool.ts
```

Expected: all discovered related tests pass.

- [ ] **Step 3: Stage only implementation files and run the commit gate**

```powershell
git add -- src/utils/browser/browserApi.ts src/entrypoints/background/tempWindowPool.ts tests/utils/browserApi.test.ts tests/entrypoints/background/tempWindowPoolOpenClose.test.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts
pnpm run validate:staged
```

Expected: lint-staged, focused Vitest, formatting, and staged i18n checks pass.

- [ ] **Step 4: Run the shared-runtime push gate**

```powershell
pnpm run validate:push
```

Expected: `compile` and `knip` pass.

- [ ] **Step 5: Inspect the final diff and commit any validation-only formatting**

```powershell
git diff --check
git status --short
git diff --cached --stat
git commit -m "test(background): cover composite cleanup compatibility"
```

Expected: no debug artifacts, temporary Playwright specs, unrelated files, or
unstaged task changes remain. Skip the final commit if the preceding task
commits already contain every validated change.
