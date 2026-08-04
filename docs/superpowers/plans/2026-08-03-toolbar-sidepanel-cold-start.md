# Toolbar Side Panel Cold-Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a configured Chromium/Edge side panel open on the first toolbar click even when the Manifest V3 service worker is cold, while preserving popup, options, Firefox, and fallback behavior.

**Architecture:** Keep `actionClickBehavior` in extension storage as the source of truth and project it into browser-owned popup/side-panel configuration. Register one stable toolbar listener synchronously for extension-managed routes, use Chromium's native `openPanelOnActionClick` path for the reported mode, and serialize/await configuration changes so stale asynchronous work cannot win.

**Tech Stack:** TypeScript, WXT, Chrome/Firefox extension APIs, React context, Vitest, Playwright.

---

## File Map

- Modify `src/utils/browser/browserApi.ts`: expose a symmetric native Chromium side-panel action configuration helper.
- Modify `src/entrypoints/background/actionClickBehavior.ts`: own stable dispatch, native/manual routing, and serialized browser configuration.
- Modify `src/entrypoints/background/index.ts`: register the listener synchronously and reconcile toolbar behavior before unrelated services.
- Modify `src/services/preferences/runtimePreferencesService.ts`: await browser configuration before acknowledging a setting message.
- Modify `src/contexts/UserPreferencesContext.tsx`: wait for the background acknowledgement while retaining durable-write fallback semantics.
- Modify `tests/utils/browserApi.test.ts`: cover native enable, disable, unsupported, and rejected API calls.
- Modify `tests/entrypoints/background/actionClickBehavior.test.ts`: cover routing, native fallback, and serialization.
- Modify `tests/entrypoints/background/backgroundSuspendCleanup.test.ts`: prove synchronous listener registration and early reconciliation order.
- Modify `tests/services/runtimePreferencesService.test.ts`: prove async completion and rejection are reflected in the response.
- Modify `tests/contexts/UserPreferencesContext.test.tsx`: prove the provider update waits for runtime application.
- Modify `e2e/basicSettingsCommonFlows.spec.ts`: assert the browser-native side-panel projection in a real extension context.

### Task 1: Symmetric Chromium Native Side-Panel Configuration

**Files:**

- Modify: `tests/utils/browserApi.test.ts:15-75,1721-1752`
- Modify: `src/utils/browser/browserApi.ts:958-979`

- [ ] **Step 1: Write the failing browser API tests**

Replace the `disableNativeSidePanelActionClick` import and its three tests with assertions for a boolean-result helper:

```ts
import { setNativeSidePanelActionClick } from "~/utils/browser/browserApi"

it.each([true, false])(
  "sets native Chromium side-panel action clicks to %s when supported",
  async (enabled) => {
    const setPanelBehavior = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as any).chrome = { sidePanel: { setPanelBehavior } }

    await expect(setNativeSidePanelActionClick(enabled)).resolves.toBe(true)
    expect(setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: enabled,
    })
  },
)

it("reports unavailable native Chromium side-panel action behavior", async () => {
  ;(globalThis as any).chrome = { sidePanel: {} }

  await expect(setNativeSidePanelActionClick(true)).resolves.toBe(false)
})

it("reports rejected native Chromium side-panel action behavior", async () => {
  ;(globalThis as any).chrome = {
    sidePanel: {
      setPanelBehavior: vi.fn().mockRejectedValue(new Error("unsupported")),
    },
  }

  await expect(setNativeSidePanelActionClick(true)).resolves.toBe(false)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run tests/utils/browserApi.test.ts
```

Expected: FAIL because `setNativeSidePanelActionClick` is not exported.

- [ ] **Step 3: Implement the minimal symmetric helper**

Replace `disableNativeSidePanelActionClick` with:

```ts
/**
 * Projects toolbar clicks into Chromium's browser-owned side-panel behavior.
 * Returns false when the runtime cannot apply the requested behavior so callers
 * can retain an extension-managed fallback.
 */
export async function setNativeSidePanelActionClick(
  enabled: boolean,
): Promise<boolean> {
  const setPanelBehavior = (globalThis as any).chrome?.sidePanel
    ?.setPanelBehavior

  if (typeof setPanelBehavior !== "function") {
    return false
  }

  try {
    await setPanelBehavior({ openPanelOnActionClick: enabled })
    return true
  } catch (error) {
    logger.warn(
      `sidePanel.setPanelBehavior not available:\n${getErrorMessage(error)}`,
    )
    return false
  }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run `pnpm exec vitest run tests/utils/browserApi.test.ts`.

Expected: PASS with no new warnings other than the deliberately exercised logged rejection.

- [ ] **Step 5: Commit the browser API seam**

```bash
git add src/utils/browser/browserApi.ts tests/utils/browserApi.test.ts
git commit -m "refactor(browser): expose native sidepanel action control"
```

### Task 2: Stable Toolbar Dispatcher and Serialized Projection

**Files:**

- Modify: `tests/entrypoints/background/actionClickBehavior.test.ts`
- Modify: `src/entrypoints/background/actionClickBehavior.ts`

- [ ] **Step 1: Rewrite the action behavior tests for the desired public contract**

Extend the existing hoisted mocks with `userPreferences.getPreferences`, replace
the disable-native mock with `setNativeSidePanelActionClick`, and add focused
tests with these observable assertions:

```ts
it("registers one stable toolbar listener", async () => {
  const { setupActionClickBehaviorListener } = await import(
    "~/entrypoints/background/actionClickBehavior"
  )

  setupActionClickBehaviorListener()
  setupActionClickBehaviorListener()

  expect(addActionClickListener).toHaveBeenCalledTimes(2)
  expect(addActionClickListener.mock.calls[0]?.[0]).toBe(
    addActionClickListener.mock.calls[1]?.[0],
  )
})

it("uses Chromium native routing for sidepanel mode", async () => {
  getSidePanelSupport.mockReturnValue({
    supported: true,
    kind: "chromium-side-panel",
  })
  setNativeSidePanelActionClick.mockResolvedValue(true)
  const { applyActionClickBehavior } = await import(
    "~/entrypoints/background/actionClickBehavior"
  )

  await applyActionClickBehavior("sidepanel")

  expect(setActionPopup).toHaveBeenCalledWith("")
  expect(setNativeSidePanelActionClick).toHaveBeenCalledWith(true)
  expect(openSidePanelWithFallback).not.toHaveBeenCalled()
})

it("uses the stable dispatcher when Chromium native routing fails", async () => {
  getSidePanelSupport.mockReturnValue({
    supported: true,
    kind: "chromium-side-panel",
  })
  setNativeSidePanelActionClick.mockResolvedValue(false)
  const { applyActionClickBehavior, setupActionClickBehaviorListener } =
    await import("~/entrypoints/background/actionClickBehavior")
  setupActionClickBehaviorListener()
  await applyActionClickBehavior("sidepanel")

  const clickHandler = addActionClickListener.mock.calls[0]?.[0]
  const clickedTab = { id: 123, windowId: 456 } as browser.tabs.Tab
  const clickResult = clickHandler(clickedTab)

  expect(openSidePanelWithFallback).toHaveBeenCalledWith(clickedTab)

  await clickResult
})

it("routes a cold options click from the durable preference", async () => {
  userPreferences.getPreferences.mockResolvedValue({
    actionClickBehavior: "options",
  })
  getSidePanelSupport.mockReturnValue({
    supported: true,
    kind: "chromium-side-panel",
  })
  const { setupActionClickBehaviorListener } = await import(
    "~/entrypoints/background/actionClickBehavior"
  )
  setupActionClickBehaviorListener()

  const clickHandler = addActionClickListener.mock.calls[0]?.[0]
  await clickHandler({ id: 123, windowId: 456 } as browser.tabs.Tab)

  expect(openOptionsPage).toHaveBeenCalledTimes(1)
})

it("serializes browser action projections in request order", async () => {
  getSidePanelSupport.mockReturnValue({
    supported: true,
    kind: "chromium-side-panel",
  })
  let releaseFirstPopup!: () => void
  setActionPopup.mockImplementationOnce(
    () => new Promise<void>((resolve) => (releaseFirstPopup = resolve)),
  )
  const { applyActionClickBehavior } = await import(
    "~/entrypoints/background/actionClickBehavior"
  )

  const first = applyActionClickBehavior("sidepanel")
  const second = applyActionClickBehavior("options")
  await vi.waitFor(() => expect(setActionPopup).toHaveBeenCalledTimes(1))

  releaseFirstPopup()
  await Promise.all([first, second])

  expect(setActionPopup.mock.calls.map(([popup]) => popup)).toEqual(["", ""])
  expect(setNativeSidePanelActionClick.mock.calls.map(([enabled]) => enabled)).toEqual([
    true,
    false,
  ])
})
```

Retain and adapt the existing popup fallback, Firefox side-panel, options,
analytics-success, analytics-failure, and tracker-failure tests. Popup and
options must assert `setNativeSidePanelActionClick(false)`; Firefox must assert
manual dispatch; unsupported side-panel must still restore `POPUP_PAGE_PATH`.

- [ ] **Step 2: Run the focused action tests and verify RED**

Run:

```bash
pnpm exec vitest run tests/entrypoints/background/actionClickBehavior.test.ts
```

Expected: FAIL because the stable setup export, native enable path, durable
cold-dispatch path, and serialization do not exist.

- [ ] **Step 3: Implement a stable dispatcher and serialized reconciler**

In `actionClickBehavior.ts`, import `userPreferences`, replace listener removal
with one stable handler, and keep the existing analytics wrapper for manual
side-panel opens:

```ts
let appliedBehavior: ToolbarActionClickBehavior | null = null
let shouldManuallyOpenSidePanel = false
let actionBehaviorQueue: Promise<void> = Promise.resolve()

async function getEffectiveClickBehavior(): Promise<ToolbarActionClickBehavior> {
  if (appliedBehavior) return appliedBehavior

  const preferences = await userPreferences.getPreferences()
  return resolveToolbarActionClickBehavior(
    preferences.actionClickBehavior ?? TOOLBAR_ACTION_CLICK_BEHAVIORS.Popup,
    getSidePanelSupport().supported,
  )
}

const handleToolbarActionClick = async (tab: browser.tabs.Tab) => {
  const support = getSidePanelSupport()
  if (
    appliedBehavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.SidePanel &&
    (shouldManuallyOpenSidePanel ||
      (support.supported && support.kind === "firefox-sidebar-action"))
  ) {
    return handleOpenSidePanelActionClick(tab)
  }

  const wasUnreconciled = appliedBehavior === null
  const behavior = await getEffectiveClickBehavior()
  if (behavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.Options) {
    await openOptionsPage()
    return
  }

  if (behavior !== TOOLBAR_ACTION_CLICK_BEHAVIORS.SidePanel) return

  if (wasUnreconciled) {
    await handleOpenSidePanelActionClick(tab)
  }
}

export function setupActionClickBehaviorListener(): () => void {
  return addActionClickListener(handleToolbarActionClick)
}
```

Move existing projection code into an internal operation and serialize the
public function:

```ts
async function reconcileActionClickBehavior(
  behavior: ToolbarActionClickBehavior,
): Promise<void> {
  const support = getSidePanelSupport()
  const effectiveBehavior = resolveToolbarActionClickBehavior(
    behavior,
    support.supported,
  )
  const isSidePanel =
    effectiveBehavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.SidePanel
  const isChromiumSidePanel =
    isSidePanel && support.supported && support.kind === "chromium-side-panel"

  appliedBehavior = effectiveBehavior
  shouldManuallyOpenSidePanel = isSidePanel

  if (!isChromiumSidePanel) {
    await setNativeSidePanelActionClick(false)
  }

  try {
    await setActionPopup(
      isSidePanel || effectiveBehavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.Options
        ? ""
        : POPUP_PAGE_PATH,
    )
  } catch (error) {
    logger.warn(`action.setPopup not available:\n${getErrorMessage(error)}`)
  }

  if (isChromiumSidePanel) {
    shouldManuallyOpenSidePanel = !(await setNativeSidePanelActionClick(true))
  }
}

export function applyActionClickBehavior(
  behavior: ToolbarActionClickBehavior,
): Promise<void> {
  const operation = actionBehaviorQueue.then(() =>
    reconcileActionClickBehavior(behavior),
  )
  actionBehaviorQueue = operation.catch(() => undefined)
  return operation
}
```

Delete `removeActionClickListener`, both conditional listener registrations, and
the separate options click handler. Preserve the existing manual side-panel
analytics behavior unchanged. Reconciled Firefox and Chromium manual fallback
routes must call the side-panel helper before the listener crosses any `await`.
An unreconciled listener may read durable state for `options`, but if that read
resolves to `sidepanel`, it preserves the previous best-effort side-panel open;
the shared helper falls back to Basic settings if the browser rejects the call.
Chromium normally consumes a genuine cold side-panel click through its persisted
native action configuration.

- [ ] **Step 4: Run the focused action tests and verify GREEN**

Run `pnpm exec vitest run tests/entrypoints/background/actionClickBehavior.test.ts`.

Expected: all action projection, fallback, dispatcher, serialization, and
analytics tests PASS.

- [ ] **Step 5: Commit the background action behavior**

```bash
git add src/entrypoints/background/actionClickBehavior.ts tests/entrypoints/background/actionClickBehavior.test.ts
git commit -m "fix(background): make sidepanel clicks cold-start safe"
```

### Task 3: Synchronous Registration and Early Startup Reconciliation

**Files:**

- Modify: `tests/entrypoints/background/backgroundSuspendCleanup.test.ts`
- Modify: `src/entrypoints/background/index.ts:40,63-78,205-220`

- [ ] **Step 1: Write the failing background entrypoint ordering test**

Hoist named mocks for `setupActionClickBehaviorListener`,
`applyActionClickBehavior`, `getPreferences`, and `initializeServices`, then add:

```ts
it("registers toolbar clicks before asynchronous startup reconciliation", async () => {
  await import("~/entrypoints/background/index")

  await vi.waitFor(() => {
    expect(applyActionClickBehaviorMock).toHaveBeenCalledWith("popup")
  })
  expect(setupActionClickBehaviorListenerMock).toHaveBeenCalledTimes(1)
  expect(
    setupActionClickBehaviorListenerMock.mock.invocationCallOrder[0],
  ).toBeLessThan(getPreferencesMock.mock.invocationCallOrder[0])
  expect(
    applyActionClickBehaviorMock.mock.invocationCallOrder[0],
  ).toBeLessThan(initializeServicesMock.mock.invocationCallOrder[0])
})
```

Update the action behavior mock in both
`backgroundSuspendCleanup.test.ts` and `changelogOnUpdate.test.ts` to export both
functions:

```ts
vi.doMock("~/entrypoints/background/actionClickBehavior", () => ({
  applyActionClickBehavior: applyActionClickBehaviorMock,
  setupActionClickBehaviorListener: setupActionClickBehaviorListenerMock,
}))
```

- [ ] **Step 2: Run the entrypoint test and verify RED**

Run:

```bash
pnpm exec vitest run tests/entrypoints/background/backgroundSuspendCleanup.test.ts
```

Expected: FAIL because `index.ts` does not call the setup function and currently
initializes services before applying toolbar behavior.

- [ ] **Step 3: Register synchronously and reorder `main`**

Update the import and entrypoint body:

```ts
import {
  applyActionClickBehavior,
  setupActionClickBehaviorListener,
} from "./actionClickBehavior"

export default defineBackground(() => {
  logger.debug("Hello background", { id: getRuntimeId() })
  setupActionClickBehaviorListener()
  // existing synchronous listener setup follows
  // ...
})
```

Move toolbar reconciliation ahead of unrelated service initialization:

```ts
async function main() {
  const prefs = await userPreferences.getPreferences()
  await applyActionClickBehavior(prefs.actionClickBehavior ?? "popup")

  await initializeServices()
  await initializeCookieInterceptors()
  triggerStartupSiteEcosystemSnapshot()
  triggerStartupSettingsSnapshot()
  triggerStartupShieldBypassDailySummary()
  triggerStartupSponsorRecommendationsDailySummary()
}
```

- [ ] **Step 4: Run affected background tests and verify GREEN**

Run:

```bash
pnpm exec vitest run tests/entrypoints/background/backgroundSuspendCleanup.test.ts tests/entrypoints/background/changelogOnUpdate.test.ts
```

Expected: PASS. Do not weaken the new order assertion.

- [ ] **Step 5: Commit startup wiring**

```bash
git add src/entrypoints/background/index.ts tests/entrypoints/background/backgroundSuspendCleanup.test.ts tests/entrypoints/background/changelogOnUpdate.test.ts
git commit -m "fix(background): reconcile toolbar behavior before services"
```

### Task 4: Await Setting Application End to End

**Files:**

- Modify: `tests/services/runtimePreferencesService.test.ts:59-83`
- Modify: `src/services/preferences/runtimePreferencesService.ts:33-45`
- Modify: `tests/contexts/UserPreferencesContext.test.tsx:928-967`
- Modify: `src/contexts/UserPreferencesContext.tsx:650-672`

- [ ] **Step 1: Write the failing runtime message tests**

Add a deferred completion test and convert the synchronous failure assertion to
an asynchronous rejection:

```ts
it("waits for action behavior application before acknowledging", async () => {
  let finishApply!: () => void
  mocks.applyActionClickBehavior.mockReturnValueOnce(
    new Promise<void>((resolve) => (finishApply = resolve)),
  )
  const { setupPreferencesMessagingListeners } = await importService()
  setupPreferencesMessagingListeners()
  const handler = mocks.handlers.get(
    PreferencesMessageTypes.UpdateActionClickBehavior,
  )

  let settled = false
  const response = handler?.({ data: { behavior: "sidepanel" } }).then((value) => {
    settled = true
    return value
  })
  await Promise.resolve()
  expect(settled).toBe(false)

  finishApply()
  await expect(response).resolves.toEqual({ success: true, data: undefined })
})

it("reports asynchronous action behavior failures", async () => {
  mocks.applyActionClickBehavior.mockRejectedValueOnce(new Error("action failed"))
  const { setupPreferencesMessagingListeners } = await importService()
  setupPreferencesMessagingListeners()
  const handler = mocks.handlers.get(
    PreferencesMessageTypes.UpdateActionClickBehavior,
  )

  await expect(handler?.({ data: { behavior: "popup" } })).resolves.toEqual({
    success: false,
    error: "action failed",
  })
})
```

- [ ] **Step 2: Run the service test and verify RED**

Run `pnpm exec vitest run tests/services/runtimePreferencesService.test.ts`.

Expected: the deferred handler settles early and the rejected promise is not
converted into a failure response.

- [ ] **Step 3: Await the background application**

Change the handler body to:

```ts
try {
  await applyActionClickBehavior(request.behavior)
  return { success: true, data: undefined }
} catch (error) {
  return createRuntimeMessageFailure(getErrorMessage(error))
}
```

- [ ] **Step 4: Verify the runtime service GREEN**

Run `pnpm exec vitest run tests/services/runtimePreferencesService.test.ts`.

Expected: PASS.

- [ ] **Step 5: Write the failing provider wait test**

Add beside the existing action behavior provider tests:

```ts
it("waits for background action behavior application before settling", async () => {
  let finishNotification!: (
    value: { success: true; data: undefined },
  ) => void
  mockedSendPreferencesMessage.mockReturnValueOnce(
    new Promise((resolve) => (finishNotification = resolve)),
  )
  const context = await renderProvider()

  let settled = false
  const update = context.updateActionClickBehavior("sidepanel").then((value) => {
    settled = true
    return value
  })
  await act(async () => Promise.resolve())
  expect(settled).toBe(false)

  finishNotification({ success: true, data: undefined })
  await act(async () => {
    await expect(update).resolves.toMatchObject({ ok: true })
  })
})
```

In the shared `beforeEach`, replace the current undefined default with the typed
success response so every existing provider call sees the real protocol shape:

```ts
mockedSendPreferencesMessage.mockResolvedValue({
  success: true,
  data: undefined,
})
```

- [ ] **Step 6: Run the provider test and verify RED**

Run `pnpm exec vitest run tests/contexts/UserPreferencesContext.test.tsx`.

Expected: FAIL because `updateActionClickBehavior` currently starts the message
as fire-and-forget work and settles immediately.

- [ ] **Step 7: Await the notification without rolling back durable storage**

Replace the fire-and-forget block with:

```ts
try {
  const response = await sendPreferencesMessage(
    PreferencesMessageTypes.UpdateActionClickBehavior,
    { behavior },
  )
  if (!response.success) {
    logger.warn(
      "Failed to apply action click behavior update",
      new Error(response.error),
    )
  }
} catch (error) {
  logger.warn("Failed to notify action click behavior update", error)
}
```

Keep returning the successful storage `result`. This preserves the existing
contract tested by “keeps action behavior writes successful when the runtime
notification fails”; the next background load retries from durable storage.

- [ ] **Step 8: Run the provider and service tests and verify GREEN**

Run:

```bash
pnpm exec vitest run tests/services/runtimePreferencesService.test.ts tests/contexts/UserPreferencesContext.test.tsx
```

Expected: PASS, including both delayed acknowledgement and notification-failure
fallback behavior.

- [ ] **Step 9: Commit awaited settings projection**

```bash
git add src/services/preferences/runtimePreferencesService.ts src/contexts/UserPreferencesContext.tsx tests/services/runtimePreferencesService.test.ts tests/contexts/UserPreferencesContext.test.tsx
git commit -m "fix(preferences): await toolbar behavior application"
```

### Task 5: Real Extension-State Regression Coverage and Final Validation

**Files:**

- Modify: `e2e/basicSettingsCommonFlows.spec.ts:36-88,196-232`

- [ ] **Step 1: Extend the existing E2E flow with native behavior inspection**

Add a helper that uses the real Chromium extension API:

```ts
async function getNativeSidePanelActionClickState(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<boolean | null> {
  return await serviceWorker.evaluate(async () => {
    const sidePanel = (globalThis as any).chrome?.sidePanel
    if (typeof sidePanel?.getPanelBehavior !== "function") return null
    const behavior = await sidePanel.getPanelBehavior()
    return behavior.openPanelOnActionClick === true
  })
}

async function expectNativeSidePanelActionClickState(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  expected: boolean,
) {
  await expect
    .poll(async () => getNativeSidePanelActionClickState(serviceWorker))
    .toBe(expected)
}
```

Update `updates toolbar action behavior from settings into the live extension
action` so the Chromium-supported side-panel transition asserts:

```ts
await expectConfiguredActionPopup(serviceWorker, "")
await expectActionClickListenerState(serviceWorker, true)
await expectNativeSidePanelActionClickState(serviceWorker, true)
```

After switching back to popup, assert:

```ts
await expectConfiguredActionPopup(serviceWorker, POPUP_PAGE_PATH)
await expectActionClickListenerState(serviceWorker, true)
await expectNativeSidePanelActionClickState(serviceWorker, false)
```

Keep the unsupported-runtime branch limited to the popup fallback and skip the
native assertion when `getPanelBehavior` returns `null`.

- [ ] **Step 2: Run the focused browser E2E**

Run:

```bash
pnpm exec playwright test e2e/basicSettingsCommonFlows.spec.ts --grep "updates toolbar action behavior"
```

Expected: PASS in the Chromium extension harness. This proves the persisted
setting is projected into the real browser-owned side-panel behavior.

- [ ] **Step 3: Run all focused unit regressions**

Run:

```bash
pnpm exec vitest run tests/utils/browserApi.test.ts tests/entrypoints/background/actionClickBehavior.test.ts tests/entrypoints/background/backgroundSuspendCleanup.test.ts tests/entrypoints/background/changelogOnUpdate.test.ts tests/services/runtimePreferencesService.test.ts tests/contexts/UserPreferencesContext.test.tsx
```

Expected: PASS with no unhandled rejection or unexpected warning.

- [ ] **Step 4: Run TypeScript validation**

Run `pnpm compile`.

Expected: exit code 0.

- [ ] **Step 5: Inspect maintainability and telemetry scope**

Run:

```bash
git diff --check
git diff --stat HEAD~4..HEAD
rg -n "disableNativeSidePanelActionClick|removeActionClickListener" src tests
```

Expected: no whitespace errors; no stale use of the replaced helper or dynamic
toolbar listener removal. Confirm the existing analytics helper is reused only
for manual Firefox/fallback opens, no new event payload or privacy allow-list is
needed, and settings search/i18n files are unchanged.

- [ ] **Step 6: Run the staged and push-equivalent gates**

Stage only the remaining task-scoped E2E change and run:

```bash
git add e2e/basicSettingsCommonFlows.spec.ts
pnpm run validate:staged
pnpm run validate:push
```

Expected: all staged checks, compile, and knip gates PASS. Inspect the index
after hooks in case formatting changed the E2E file.

- [ ] **Step 7: Commit E2E coverage**

```bash
git commit -m "test(e2e): verify native sidepanel action routing"
```

- [ ] **Step 8: Perform the manual Edge cold-worker check**

Build/load the extension in Edge, choose **Side panel**, close the panel, let the
MV3 worker become inactive from `edge://extensions`, and click the toolbar icon
once. Expected: the side panel opens on the first click. Repeat after an Edge
restart and after reloading the unpacked extension to verify startup
reconciliation. Record browser version and which lifecycle cases were observed;
do not describe unperformed cases as passing.

- [ ] **Step 9: Final diff and status audit**

Run:

```bash
git status --porcelain
git log -5 --oneline
git diff HEAD~5..HEAD --check
```

Expected: clean worktree, only the design/plan and task-scoped implementation
commits, no temporary tests, build outputs, or unrelated files.
