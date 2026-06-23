# Native Page Auto Check-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in native-page New API check-in strategy that clicks the site page's own check-in action only after confirming the temporary page is logged in as the target saved account.

**Architecture:** Extract the existing Turnstile pre-trigger click path into a neutral content-script page-action helper, then expose it through a new content runtime action and a background temp-window helper. The New API provider keeps direct API and Turnstile replay behavior intact, and only uses native-page clicking for narrow dynamic-signature failures after a hard page-login identity check and server-side `checked_in_today` confirmation.

**Tech Stack:** TypeScript, WXT extension runtime messaging, browser temp-window helpers, Vitest/jsdom, pnpm.

**Spec:** `docs/superpowers/specs/2026-06-23-native-page-auto-checkin-design.md`

---

## File Structure

Create:

- `tests/entrypoints/background/tempWindowPoolNativeCheckin.test.ts`
  - Focused background temp-window tests for identity resolution, mismatch refusal, successful page trigger, target-not-found mapping, invalid request rejection, and cleanup.

Modify:

- `src/types/turnstile.ts`
  - Add JSON-serializable `CheckinPageActionTriggerStatus` and `CheckinPageActionTriggerResult` contracts shared by content, background, and provider code.
- `src/types/tempWindowFetch.ts`
  - Add `TempWindowCheckinPageActionParams`, `TempWindowCheckinPageActionFailureReason`, `TempWindowPageAccountIdentity`, and `TempWindowCheckinPageAction`.
- `src/constants/runtimeActions.ts`
  - Add `TempWindowCheckinPageAction` and `ContentTriggerCheckinPageAction` action IDs.
- `src/entrypoints/content/messageHandlers/utils/turnstileGuard.ts`
  - Extract `triggerCheckinPageAction(...)` from the existing pre-trigger click implementation while preserving Turnstile wait behavior.
- `src/entrypoints/content/messageHandlers/handlers/turnstileGuard.ts`
  - Add `handleTriggerCheckinPageAction(...)`.
- `src/entrypoints/content/messageHandlers/handlers/index.ts`
  - Export the new handler.
- `src/entrypoints/content/messageHandlers/index.ts`
  - Route `RuntimeActionIds.ContentTriggerCheckinPageAction`.
- `src/entrypoints/background/tempWindowPool.ts`
  - Add `resolveTempPageAccountIdentity(...)` and `handleTempWindowCheckinPageAction(...)`.
- `src/entrypoints/background/runtimeMessages.ts`
  - Route `RuntimeActionIds.TempWindowCheckinPageAction`.
- `src/utils/browser/tempWindowFetch.ts`
  - Add `tempWindowTriggerCheckinPageAction(...)`, mirroring `tempWindowTurnstileFetch(...)`.
- `src/services/checkin/autoCheckin/providers/newApi.ts`
  - Add narrow dynamic-signature classification and native-page strategy.
- `src/locales/en/autoCheckin.json`
- `src/locales/zh-CN/autoCheckin.json`
- `src/locales/zh-TW/autoCheckin.json`
- `src/locales/ja/autoCheckin.json`
- `src/locales/vi/autoCheckin.json`
  - Add native-page manual-required fallback messages.
- `tests/entrypoints/content/messageHandlers/utils/turnstileGuard.test.ts`
  - Cover `triggerCheckinPageAction(...)` directly and verify `waitForTurnstileToken(...)` still uses the same click path.
- `tests/entrypoints/content/messageHandlers/handlers/turnstileGuard.test.ts`
  - Cover the content handler response shapes.
- `tests/entrypoints/content/messageHandlers/cloudflareGuard.test.tsx`
  - Update content message routing coverage for the new action.
- `tests/utils/tempWindowFetch.background.test.ts`
- `tests/utils/tempWindowFetch.fallback.test.ts`
  - Cover background-direct and runtime-message wrapper behavior for `tempWindowTriggerCheckinPageAction(...)`.
- `tests/entrypoints/background/runtimeMessages.test.ts` or `tests/entrypoints/background/runtimeMessages.more.test.ts`
  - Cover background runtime routing if existing tests own temp-window routes there.
- `tests/services/autoCheckin/providers/newApi.test.ts`
  - Cover dynamic-signature classification, identity gates, native click confirmation polling, and Turnstile replay non-regression.

Do not modify:

- `src/services/apiService/common/**` request signing or header construction.
- Concrete site adapters other than the New API auto-checkin provider.
- Settings search, deep-link targets, or options UI.
- Playwright E2E tests in this slice.

---

## Implementation Notes

Preserve these existing behaviors:

- Direct `POST /api/user/checkin` remains the first attempt.
- Turnstile replay still uses `tempWindowTurnstileFetch(...)` and does not require page-login identity matching.
- The page-native strategy never replays `POST /api/user/checkin` from extension-built request options.
- Native-page clicking is only attempted after the temporary page identity matches `account.account_info.id`.
- Success is confirmed with the target account API through `fetchCheckedInTodayStatus(...)`; page toasts and visible text are not authoritative.

Telemetry decision: reuse existing auto-checkin run/result reporting. Add no analytics fields in this slice because the provider result already records status/message category for UI, and adding telemetry would require privacy allow-list changes unrelated to the protocol fix.

Settings search decision: none. No settings UI, anchors, deep links, or search definitions change.

E2E decision: no Playwright E2E by default. The risky contracts are message routing, identity gating, and provider branching; the plan covers them with Vitest and mocked extension APIs. A real deployment smoke test can be done separately when a target deployment URL and account are available.

---

### Task 1: Extract Shared Content Page Action Trigger

**Files:**

- Modify: `src/types/turnstile.ts`
- Modify: `src/entrypoints/content/messageHandlers/utils/turnstileGuard.ts`
- Modify: `tests/entrypoints/content/messageHandlers/utils/turnstileGuard.test.ts`

- [ ] **Step 1: Add failing page-action utility tests**

Append these tests inside `describe("turnstileGuard", () => { ... })` in `tests/entrypoints/content/messageHandlers/utils/turnstileGuard.test.ts`:

```ts
  describe("triggerCheckinPageAction", () => {
    it("clicks the default check-in button and returns a serializable clicked result", async () => {
      const button = createMockElement("button", (el) => {
        el.textContent = "签到"
        el.click = vi.fn()
      })
      document.body.appendChild(button)

      const { triggerCheckinPageAction } = await import(
        "~/entrypoints/content/messageHandlers/utils/turnstileGuard"
      )

      const result = triggerCheckinPageAction({
        requestId: "req-native-click",
        trigger: { kind: "checkinButton" },
      })

      expect(result).toMatchObject({
        status: "clicked",
        clicked: true,
        reason: "clicked",
      })
      expect(result.target?.text).toBe("签到")
      expect(result.detection.hasTurnstile).toBe(false)
      expect(button.click).toHaveBeenCalledTimes(1)
    })

    it("returns target_not_found when no configured trigger exists", async () => {
      const { triggerCheckinPageAction } = await import(
        "~/entrypoints/content/messageHandlers/utils/turnstileGuard"
      )

      const result = triggerCheckinPageAction({
        requestId: "req-native-missing",
        trigger: {
          kind: "clickSelector",
          selector: ".missing-checkin-button",
        },
      })

      expect(result).toMatchObject({
        status: "target_not_found",
        clicked: false,
        reason: "noTarget",
      })
    })

    it("returns throttled when the same request clicks too frequently", async () => {
      const button = createMockElement("button", (el) => {
        el.textContent = "Check in"
        el.click = vi.fn()
      })
      document.body.appendChild(button)

      const { triggerCheckinPageAction } = await import(
        "~/entrypoints/content/messageHandlers/utils/turnstileGuard"
      )

      const trigger = {
        kind: "checkinButton",
        throttle: { maxAttempts: 2, minIntervalMs: 1200 },
      } as const

      const first = triggerCheckinPageAction({
        requestId: "req-native-throttle",
        trigger,
      })
      const second = triggerCheckinPageAction({
        requestId: "req-native-throttle",
        trigger,
      })

      expect(first.status).toBe("clicked")
      expect(second).toMatchObject({
        status: "throttled",
        clicked: false,
        reason: "throttled",
      })
      expect(button.click).toHaveBeenCalledTimes(1)
    })

    it("keeps the default negative label filter for completed buttons", async () => {
      const completed = createMockElement("button", (el) => {
        el.textContent = "已签到"
        el.click = vi.fn()
      })
      const actionable = createMockElement("button", (el) => {
        el.textContent = "签到"
        el.click = vi.fn()
      })
      document.body.appendChild(completed)
      document.body.appendChild(actionable)

      const { triggerCheckinPageAction } = await import(
        "~/entrypoints/content/messageHandlers/utils/turnstileGuard"
      )

      const result = triggerCheckinPageAction({
        requestId: "req-native-negative-filter",
        trigger: { kind: "checkinButton" },
      })

      expect(result.status).toBe("clicked")
      expect(completed.click).not.toHaveBeenCalled()
      expect(actionable.click).toHaveBeenCalledTimes(1)
    })
  })
```

Also update the import at the top of the file:

```ts
import {
  detectTurnstileWidget,
  maybeAutoStartTurnstile,
  triggerCheckinPageAction,
  waitForTurnstileToken,
} from "~/entrypoints/content/messageHandlers/utils/turnstileGuard"
```

- [ ] **Step 2: Run tests to verify the missing export**

Run:

```powershell
pnpm vitest run tests/entrypoints/content/messageHandlers/utils/turnstileGuard.test.ts
```

Expected: FAIL with an error that `triggerCheckinPageAction` is not exported.

- [ ] **Step 3: Add shared result types**

Modify `src/types/turnstile.ts` after `TurnstilePreTrigger`:

```ts
export type CheckinPageActionTriggerStatus =
  | "clicked"
  | "target_not_found"
  | "throttled"
  | "error"

export type CheckinPageActionTriggerReason =
  | "clicked"
  | "disabled"
  | "maxAttempts"
  | "missingRequestId"
  | "noTarget"
  | "throttled"
  | "unexpectedError"

export type CheckinPageActionTriggerResult = {
  status: CheckinPageActionTriggerStatus
  clicked: boolean
  reason: CheckinPageActionTriggerReason
  detection: TurnstileWidgetDetection
  target?: {
    tagName: string
    text: string
  }
  error?: string
}
```

- [ ] **Step 4: Export `triggerCheckinPageAction(...)`**

Modify imports in `src/entrypoints/content/messageHandlers/utils/turnstileGuard.ts`:

```ts
import type {
  CheckinPageActionTriggerResult,
  TurnstilePreTrigger,
  TurnstileTokenWaitResult,
  TurnstileWidgetDetection,
} from "~/types/turnstile"
```

Replace the current `maybePreTriggerTurnstileWidget(...)` function with these helpers:

```ts
function toActionTriggerResult(params: {
  status: CheckinPageActionTriggerResult["status"]
  clicked: boolean
  reason: CheckinPageActionTriggerResult["reason"]
  detection: TurnstileWidgetDetection
  target?: HTMLElement
  error?: string
}): CheckinPageActionTriggerResult {
  return {
    status: params.status,
    clicked: params.clicked,
    reason: params.reason,
    detection: params.detection,
    ...(params.target
      ? {
          target: {
            tagName: params.target.tagName.toLowerCase(),
            text: String(params.target.textContent ?? "")
              .trim()
              .slice(0, 80),
          },
        }
      : {}),
    ...(params.error ? { error: params.error } : {}),
  }
}

function resolveCheckinPageActionTarget(
  trigger: TurnstilePreTrigger,
): HTMLElement | null {
  if (trigger.kind === "clickSelector") {
    const selector = String(trigger.selector ?? "").trim()
    if (!selector) return null
    try {
      const el = document.querySelector(selector)
      return el instanceof HTMLElement ? el : null
    } catch {
      return null
    }
  }

  if (trigger.kind === "clickText") {
    const positive = compileCaseInsensitiveRegex(trigger.positivePattern, /$^/)
    const negative = compileOptionalCaseInsensitiveRegex(
      trigger.negativePattern,
    )
    const candidateSelector =
      typeof trigger.candidateSelector === "string" &&
      trigger.candidateSelector.trim()
        ? trigger.candidateSelector.trim()
        : DEFAULT_CHECKIN_TRIGGER_CANDIDATE_SELECTOR

    return findClickableByText({ candidateSelector, positive, negative })
  }

  if (trigger.kind === "checkinButton") {
    const positive = compileCaseInsensitiveRegex(
      trigger.positivePattern,
      new RegExp(DEFAULT_CHECKIN_TRIGGER_POSITIVE_PATTERN, "i"),
    )
    const negative = compileCaseInsensitiveRegex(
      trigger.negativePattern,
      new RegExp(DEFAULT_CHECKIN_TRIGGER_NEGATIVE_PATTERN, "i"),
    )
    const candidateSelector =
      typeof trigger.candidateSelector === "string" &&
      trigger.candidateSelector.trim()
        ? trigger.candidateSelector.trim()
        : DEFAULT_CHECKIN_TRIGGER_CANDIDATE_SELECTOR

    return findClickableByText({ candidateSelector, positive, negative })
  }

  return null
}

/**
 * Trigger the page's own check-in action using the same safe target selection
 * used by Turnstile pre-trigger waits. This helper never decides whether
 * check-in succeeded; callers must verify server-side account status.
 */
export function triggerCheckinPageAction(params: {
  requestId?: string | null
  trigger?: TurnstilePreTrigger
  detection?: TurnstileWidgetDetection
}): CheckinPageActionTriggerResult {
  const detection = params.detection ?? detectTurnstileWidget()
  const requestId = (params.requestId || "").trim()
  if (!requestId) {
    return toActionTriggerResult({
      status: "error",
      clicked: false,
      reason: "missingRequestId",
      detection,
    })
  }

  const trigger = params.trigger
  if (!trigger || trigger.kind === "none") {
    return toActionTriggerResult({
      status: "target_not_found",
      clicked: false,
      reason: "disabled",
      detection,
    })
  }

  const { maxAttempts, minIntervalMs } = resolvePreTriggerThrottle(trigger)
  const stateMap = getTurnstilePreTriggerStateMap()
  const now = Date.now()
  const current = stateMap.get(requestId) ?? { attempts: 0, lastAttemptAt: 0 }

  if (current.attempts >= maxAttempts) {
    return toActionTriggerResult({
      status: "throttled",
      clicked: false,
      reason: "maxAttempts",
      detection,
    })
  }

  if (now - current.lastAttemptAt < minIntervalMs) {
    return toActionTriggerResult({
      status: "throttled",
      clicked: false,
      reason: "throttled",
      detection,
    })
  }

  const target = resolveCheckinPageActionTarget(trigger)
  if (!target) {
    logger.debug("Check-in page action skipped: no target found", {
      requestId,
      kind: trigger.kind,
      label: getPreTriggerLabel(trigger),
      url: detection.url ? sanitizeUrlForLog(detection.url) : null,
    })
    return toActionTriggerResult({
      status: "target_not_found",
      clicked: false,
      reason: "noTarget",
      detection,
    })
  }

  stateMap.set(requestId, {
    attempts: current.attempts + 1,
    lastAttemptAt: now,
  })

  try {
    simulateClick(target)
    logger.debug("Check-in page action via click()", {
      requestId,
      kind: trigger.kind,
      label: getPreTriggerLabel(trigger),
      targetText: String(target.textContent ?? "").trim().slice(0, 80),
      url: detection.url ? sanitizeUrlForLog(detection.url) : null,
    })
    return toActionTriggerResult({
      status: "clicked",
      clicked: true,
      reason: "clicked",
      detection,
      target,
    })
  } catch (error) {
    return toActionTriggerResult({
      status: "error",
      clicked: false,
      reason: "unexpectedError",
      detection,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
```

- [ ] **Step 5: Update `waitForTurnstileToken(...)` to call the shared helper**

In `waitForTurnstileToken(...)`, replace the `maybePreTriggerTurnstileWidget(...)` call block with:

```ts
      const attempt = triggerCheckinPageAction({
        requestId: params.requestId,
        trigger: params.preTrigger,
        detection,
      })

      if (attempt.clicked) {
        await new Promise((resolve) =>
          setTimeout(resolve, PRETRIGGER_SETTLE_DELAY_MS),
        )
        continue
      }
```

Keep `maybeAutoStartTurnstile(...)` unchanged.

- [ ] **Step 6: Run content utility tests**

Run:

```powershell
pnpm vitest run tests/entrypoints/content/messageHandlers/utils/turnstileGuard.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the content utility extraction**

Run:

```powershell
git add src/types/turnstile.ts src/entrypoints/content/messageHandlers/utils/turnstileGuard.ts tests/entrypoints/content/messageHandlers/utils/turnstileGuard.test.ts
git commit -m "refactor(checkin): share page action trigger"
```

Expected: commit succeeds after `validate:staged`.

---

### Task 2: Add Content Runtime Action For Page-Native Triggering

**Files:**

- Modify: `src/constants/runtimeActions.ts`
- Modify: `src/entrypoints/content/messageHandlers/handlers/turnstileGuard.ts`
- Modify: `src/entrypoints/content/messageHandlers/handlers/index.ts`
- Modify: `src/entrypoints/content/messageHandlers/index.ts`
- Modify: `tests/entrypoints/content/messageHandlers/handlers/turnstileGuard.test.ts`
- Modify: `tests/entrypoints/content/messageHandlers/cloudflareGuard.test.tsx`

- [ ] **Step 1: Add failing handler tests**

Append these tests to `tests/entrypoints/content/messageHandlers/handlers/turnstileGuard.test.ts`:

```ts
  it("handles native page action trigger requests", async () => {
    const trigger = { kind: "checkinButton" } as const
    const triggerResult = {
      status: "clicked",
      clicked: true,
      reason: "clicked",
      detection: {
        hasTurnstile: false,
        reasons: [],
        score: 0,
        title: "Check in",
        url: "https://example.invalid/console/personal",
      },
    }

    triggerCheckinPageActionMock.mockReturnValueOnce(triggerResult)

    const response = await new Promise<any>((resolve) => {
      expect(
        handleTriggerCheckinPageAction(
          {
            requestId: "req-native-action",
            trigger,
          },
          resolve,
        ),
      ).toBe(true)
    })

    expect(triggerCheckinPageActionMock).toHaveBeenCalledWith({
      requestId: "req-native-action",
      trigger,
    })
    expect(response).toEqual({
      success: true,
      ...triggerResult,
    })
  })

  it("returns an error response when native page action triggering throws", async () => {
    triggerCheckinPageActionMock.mockImplementationOnce(() => {
      throw new Error("click failed")
    })

    const response = await new Promise<any>((resolve) => {
      expect(handleTriggerCheckinPageAction({}, resolve)).toBe(true)
    })

    expect(response).toEqual({
      success: false,
      error: "click failed",
    })
  })
```

Update the hoisted mocks at the top of the same file:

```ts
const { loggerMocks, triggerCheckinPageActionMock, waitForTurnstileTokenMock } =
  vi.hoisted(() => ({
    loggerMocks: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
    triggerCheckinPageActionMock: vi.fn(),
    waitForTurnstileTokenMock: vi.fn(),
  }))
```

Update the mocked utility module:

```ts
vi.mock("~/entrypoints/content/messageHandlers/utils/turnstileGuard", () => ({
  triggerCheckinPageAction: triggerCheckinPageActionMock,
  waitForTurnstileToken: waitForTurnstileTokenMock,
}))
```

Update the import:

```ts
import {
  handleTriggerCheckinPageAction,
  handleWaitForTurnstileToken,
} from "~/entrypoints/content/messageHandlers/handlers/turnstileGuard"
```

- [ ] **Step 2: Run handler tests to verify missing handler**

Run:

```powershell
pnpm vitest run tests/entrypoints/content/messageHandlers/handlers/turnstileGuard.test.ts
```

Expected: FAIL with an import error for `handleTriggerCheckinPageAction`.

- [ ] **Step 3: Add runtime action IDs**

Modify `src/constants/runtimeActions.ts`:

```ts
  TempWindowTurnstileFetch: "tempWindowTurnstileFetch",
  TempWindowCheckinPageAction: "tempWindowCheckinPageAction",
  TempWindowGetRenderedTitle: "tempWindowGetRenderedTitle",
```

and:

```ts
  ContentWaitForTurnstileToken: "waitForTurnstileToken",
  ContentTriggerCheckinPageAction: "triggerCheckinPageAction",
  ContentWaitAndGetUserInfo: "waitAndGetUserInfo",
```

- [ ] **Step 4: Add the content handler**

Modify `src/entrypoints/content/messageHandlers/handlers/turnstileGuard.ts`.

Update imports:

```ts
import {
  triggerCheckinPageAction,
  waitForTurnstileToken,
} from "~/entrypoints/content/messageHandlers/utils/turnstileGuard"
import type {
  CheckinPageActionTriggerResult,
  TurnstilePreTrigger,
  TurnstileTokenWaitResult,
} from "~/types/turnstile"
```

Add these types after `WaitForTurnstileTokenResponse`:

```ts
type TriggerCheckinPageActionRequest = {
  requestId?: string
  trigger?: TurnstilePreTrigger
}

type TriggerCheckinPageActionResponse =
  | ({ success: true } & CheckinPageActionTriggerResult)
  | { success: false; error: string }
```

Add this exported handler after `handleWaitForTurnstileToken(...)`:

```ts
/**
 * Handle native page check-in action trigger requests.
 *
 * This only clicks the page action. It deliberately does not decide whether the
 * account is checked in.
 */
export function handleTriggerCheckinPageAction(
  request: TriggerCheckinPageActionRequest,
  sendResponse: (res: TriggerCheckinPageActionResponse) => void,
) {
  try {
    const result = triggerCheckinPageAction({
      requestId: request.requestId,
      trigger: request.trigger,
    })

    logger.debug("Check-in page action trigger completed", {
      requestId: request.requestId ?? null,
      status: result.status,
      reason: result.reason,
      clicked: result.clicked,
    })

    sendResponse({ success: true, ...result })
  } catch (error) {
    logger.warn("Check-in page action trigger failed", {
      requestId: request.requestId ?? null,
      error: getErrorMessage(error),
    })
    sendResponse({ success: false, error: getErrorMessage(error) })
  }

  return true
}
```

- [ ] **Step 5: Export and route the handler**

Modify `src/entrypoints/content/messageHandlers/handlers/index.ts`:

```ts
export {
  handleTriggerCheckinPageAction,
  handleWaitForTurnstileToken,
} from "./turnstileGuard"
```

Modify the imports in `src/entrypoints/content/messageHandlers/index.ts`:

```ts
  handleTriggerCheckinPageAction,
  handleWaitForTurnstileToken,
```

Add the route immediately after `ContentWaitForTurnstileToken`:

```ts
    if (request.action === RuntimeActionIds.ContentTriggerCheckinPageAction) {
      return handleTriggerCheckinPageAction(request, sendResponse)
    }
```

- [ ] **Step 6: Update content routing test**

Modify the hoisted mocks in `tests/entrypoints/content/messageHandlers/cloudflareGuard.test.tsx`:

```ts
  triggerCheckinHandlerMock: vi.fn(() => "trigger-checkin"),
```

Add it to the mocked handlers:

```ts
  handleTriggerCheckinPageAction: triggerCheckinHandlerMock,
```

Add this assertion in `"registers and dispatches content message handlers by action id"` after the Turnstile token wait assertion:

```ts
    expect(
      listener(
        { action: RuntimeActionIds.ContentTriggerCheckinPageAction },
        null,
        sendResponse,
      ),
    ).toBe("trigger-checkin")
```

- [ ] **Step 7: Run content handler and routing tests**

Run:

```powershell
pnpm vitest run tests/entrypoints/content/messageHandlers/handlers/turnstileGuard.test.ts tests/entrypoints/content/messageHandlers/cloudflareGuard.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit the content runtime action**

Run:

```powershell
git add src/constants/runtimeActions.ts src/entrypoints/content/messageHandlers/handlers/turnstileGuard.ts src/entrypoints/content/messageHandlers/handlers/index.ts src/entrypoints/content/messageHandlers/index.ts tests/entrypoints/content/messageHandlers/handlers/turnstileGuard.test.ts tests/entrypoints/content/messageHandlers/cloudflareGuard.test.tsx
git commit -m "feat(checkin): expose native page action trigger"
```

Expected: commit succeeds after `validate:staged`.

---

### Task 3: Add Temp-Window Native Check-In Action Helper

**Files:**

- Modify: `src/types/tempWindowFetch.ts`
- Modify: `src/entrypoints/background/tempWindowPool.ts`
- Modify: `src/entrypoints/background/runtimeMessages.ts`
- Modify: `src/utils/browser/tempWindowFetch.ts`
- Create: `tests/entrypoints/background/tempWindowPoolNativeCheckin.test.ts`
- Modify: `tests/utils/tempWindowFetch.background.test.ts`
- Modify: `tests/utils/tempWindowFetch.fallback.test.ts`
- Modify: `tests/entrypoints/background/runtimeMessages.test.ts` or `tests/entrypoints/background/runtimeMessages.more.test.ts`

- [ ] **Step 1: Write background native helper tests**

Create `tests/entrypoints/background/tempWindowPoolNativeCheckin.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { AuthTypeEnum } from "~/types"

const originalBrowser = (globalThis as any).browser

describe("tempWindowPool native check-in page action", () => {
  let createTabMock: ReturnType<typeof vi.fn>
  let createWindowMock: ReturnType<typeof vi.fn>
  let removeTabOrWindowMock: ReturnType<typeof vi.fn>
  let hasWindowsApiMock: ReturnType<typeof vi.fn>
  let onTabRemovedMock: ReturnType<typeof vi.fn>
  let onWindowRemovedMock: ReturnType<typeof vi.fn>
  let sendMessageMock: ReturnType<typeof vi.fn>
  let tabsGetMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()

    createTabMock = vi.fn().mockResolvedValue({ id: 701 })
    createWindowMock = vi.fn()
    removeTabOrWindowMock = vi.fn().mockResolvedValue(undefined)
    hasWindowsApiMock = vi.fn(() => true)
    onTabRemovedMock = vi.fn(() => () => {})
    onWindowRemovedMock = vi.fn(() => () => {})
    tabsGetMock = vi.fn().mockResolvedValue({ status: "complete" })
    sendMessageMock = vi.fn(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentGetUserFromLocalStorage:
            return {
              success: true,
              data: {
                userId: "target-user",
                user: { id: "target-user", username: "Target" },
                siteTypeHint: SITE_TYPES.NEW_API,
              },
            }
          case RuntimeActionIds.ContentTriggerCheckinPageAction:
            return {
              success: true,
              status: "clicked",
              clicked: true,
              reason: "clicked",
              detection: {
                hasTurnstile: false,
                reasons: [],
                score: 0,
                title: "Check in",
                url: "https://example.invalid/console/personal",
              },
            }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    ;(globalThis as any).browser = {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      },
      tabs: {
        get: tabsGetMock,
        query: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue(undefined),
        sendMessage: sendMessageMock,
      },
      windows: {
        get: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
      },
    }

    vi.doMock("~/utils/browser/browserApi", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/browserApi")>()
      return {
        ...actual,
        createTab: createTabMock,
        createWindow: createWindowMock,
        hasWindowsAPI: hasWindowsApiMock,
        onTabRemoved: onTabRemovedMock,
        onWindowRemoved: onWindowRemovedMock,
        removeTabOrWindow: removeTabOrWindowMock,
      }
    })
    vi.doMock("~/services/preferences/userPreferences", () => ({
      DEFAULT_PREFERENCES: {
        tempWindowFallback: {
          tempContextMode: "tab",
        },
      },
      userPreferences: {
        getPreferences: vi.fn().mockResolvedValue({
          tempWindowFallback: {
            tempContextMode: "tab",
          },
        }),
      },
    }))
    vi.doMock("~/utils/i18n/core", () => ({
      t: vi.fn((key: string) => key),
    }))
  })

  afterEach(() => {
    ;(globalThis as any).browser = originalBrowser
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("refuses invalid native page action requests before opening a context", async () => {
    const { handleTempWindowCheckinPageAction } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
      },
      sendResponse,
    )

    expect(createTabMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      reason: "invalid_request",
      error: "messages:background.invalidFetchRequest",
    })
  })

  it("resolves page identity and triggers the page action when identity matches", async () => {
    const { handleTempWindowCheckinPageAction } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
        requestId: "req-native-match",
        authType: AuthTypeEnum.AccessToken,
        trigger: { kind: "checkinButton" },
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect(sendMessageMock).toHaveBeenCalledWith(
      701,
      expect.objectContaining({
        action: RuntimeActionIds.ContentGetUserFromLocalStorage,
        url: "https://example.invalid/console/personal",
        siteType: SITE_TYPES.NEW_API,
      }),
    )
    expect(sendMessageMock).toHaveBeenCalledWith(
      701,
      expect.objectContaining({
        action: RuntimeActionIds.ContentTriggerCheckinPageAction,
        requestId: "req-native-match",
        trigger: { kind: "checkinButton" },
      }),
    )
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        reason: "clicked",
        identity: {
          userId: "target-user",
          user: { id: "target-user", username: "Target" },
          siteTypeHint: SITE_TYPES.NEW_API,
        },
        trigger: expect.objectContaining({
          status: "clicked",
          clicked: true,
        }),
      }),
    )
  })

  it("does not click when page identity is missing", async () => {
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentGetUserFromLocalStorage:
            return { success: false, error: "not logged in" }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowCheckinPageAction } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
        requestId: "req-native-missing-identity",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect(sendMessageMock).not.toHaveBeenCalledWith(
      701,
      expect.objectContaining({
        action: RuntimeActionIds.ContentTriggerCheckinPageAction,
      }),
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      reason: "identity_missing",
      identity: null,
    })
  })

  it("does not click when page identity differs from the target account", async () => {
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentGetUserFromLocalStorage:
            return {
              success: true,
              data: {
                userId: "other-user",
                user: { id: "other-user" },
              },
            }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowCheckinPageAction } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
        requestId: "req-native-mismatch",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      reason: "identity_mismatch",
      identity: {
        userId: "other-user",
        user: { id: "other-user" },
      },
      expectedUserId: "target-user",
    })
  })

  it("maps a content trigger target miss without treating it as success", async () => {
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentGetUserFromLocalStorage:
            return {
              success: true,
              data: {
                userId: "target-user",
                user: { id: "target-user" },
              },
            }
          case RuntimeActionIds.ContentTriggerCheckinPageAction:
            return {
              success: true,
              status: "target_not_found",
              clicked: false,
              reason: "noTarget",
              detection: {
                hasTurnstile: false,
                reasons: [],
                score: 0,
                title: "Check in",
                url: "https://example.invalid/console/personal",
              },
            }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowCheckinPageAction } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
        requestId: "req-native-target-missing",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        reason: "target_not_found",
        trigger: expect.objectContaining({
          status: "target_not_found",
          clicked: false,
        }),
      }),
    )
  })
})
```

- [ ] **Step 2: Run the failing background test**

Run:

```powershell
pnpm vitest run tests/entrypoints/background/tempWindowPoolNativeCheckin.test.ts
```

Expected: FAIL with an import error for `handleTempWindowCheckinPageAction`.

- [ ] **Step 3: Add temp-window native action contracts**

Modify `src/types/tempWindowFetch.ts`.

Update imports:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import type { ApiErrorCode } from "~/services/apiTransport/errors"
import type { AuthTypeEnum } from "~/types/index"
import type {
  CheckinPageActionTriggerResult,
  TurnstilePreTrigger,
} from "~/types/turnstile"
```

Add these types after `TempWindowTurnstileFetchParams`:

```ts
export type TempWindowCheckinPageActionFailureReason =
  | "clicked"
  | "identity_missing"
  | "identity_mismatch"
  | "invalid_request"
  | "target_not_found"
  | "throttled"
  | "trigger_failed"

export interface TempWindowPageAccountIdentity {
  userId: string
  user: unknown
  siteTypeHint?: AccountSiteType
}

export interface TempWindowCheckinPageActionParams {
  originUrl: string
  pageUrl: string
  requestId?: string
  suppressMinimize?: boolean
  siteType: AccountSiteType
  expectedUserId: string
  trigger?: TurnstilePreTrigger
  accountId?: string
  authType?: AuthTypeEnum
  cookieAuthSessionCookie?: string
  cookieStoreId?: string
}
```

Add this response contract after `TempWindowTurnstileFetch`:

```ts
export interface TempWindowCheckinPageAction {
  success: boolean
  reason: TempWindowCheckinPageActionFailureReason
  identity?: TempWindowPageAccountIdentity | null
  expectedUserId?: string
  trigger?: CheckinPageActionTriggerResult
  error?: string
}
```

- [ ] **Step 4: Add background identity resolver and handler**

Modify imports in `src/entrypoints/background/tempWindowPool.ts`:

```ts
import { isAccountSiteType, type AccountSiteType } from "~/constants/siteType"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
```

Update the `~/types/tempWindowFetch` import:

```ts
  TempWindowCheckinPageAction,
  TempWindowCheckinPageActionParams,
  TempWindowPageAccountIdentity,
```

Add this helper above `handleTempWindowTurnstileFetch(...)`:

```ts
export async function resolveTempPageAccountIdentity(params: {
  tabId: number
  url: string
  siteType: AccountSiteType
}): Promise<TempWindowPageAccountIdentity | null> {
  const userResponse = await sendTabMessageWithRetry(params.tabId, {
    action: RuntimeActionIds.ContentGetUserFromLocalStorage,
    url: params.url,
    siteType: params.siteType,
  })

  if (!userResponse || !userResponse.success) {
    logger.warn("Temporary page account identity lookup failed", {
      reason: userResponse?.error ?? null,
    })
    return null
  }

  const userId = normalizeAccountIdentity(userResponse.data?.userId)
  if (!userId) return null

  const siteTypeHint = isAccountSiteType(userResponse.data?.siteTypeHint)
    ? userResponse.data.siteTypeHint
    : undefined

  return {
    userId,
    user: userResponse.data?.user ?? null,
    ...(siteTypeHint ? { siteTypeHint } : {}),
  }
}
```

Add this handler after `resolveTempPageAccountIdentity(...)`:

```ts
export async function handleTempWindowCheckinPageAction(
  request: TempWindowCheckinPageActionParams,
  sendResponse: (response?: TempWindowCheckinPageAction) => void,
) {
  const {
    originUrl,
    pageUrl,
    requestId,
    suppressMinimize,
    siteType,
    expectedUserId,
    trigger,
  } = request

  if (!originUrl || !pageUrl || !expectedUserId || !isAccountSiteType(siteType)) {
    sendResponse({
      success: false,
      reason: "invalid_request",
      error: t("messages:background.invalidFetchRequest"),
    })
    return
  }

  const tempRequestId =
    requestId || safeRandomUUID(`temp-checkin-page-action-${pageUrl}`)

  logTempWindow("tempWindowCheckinPageActionStart", {
    requestId: tempRequestId,
    origin: normalizeOrigin(originUrl),
    pageUrl: sanitizeUrlForLog(pageUrl),
    siteType,
  })

  try {
    const context = await acquireTempContext(
      pageUrl,
      tempRequestId,
      suppressMinimize,
    )
    const { tabId } = context

    await updateTab(tabId, { url: pageUrl })
    await waitForTabComplete(tabId, {
      requestId: tempRequestId,
      origin: normalizeOrigin(originUrl),
    })

    const identity = await resolveTempPageAccountIdentity({
      tabId,
      url: pageUrl,
      siteType,
    })

    const normalizedExpectedUserId = normalizeAccountIdentity(expectedUserId)
    if (!identity || !normalizedExpectedUserId) {
      sendResponse({
        success: false,
        reason: "identity_missing",
        identity,
      })
      return
    }

    if (identity.userId !== normalizedExpectedUserId) {
      sendResponse({
        success: false,
        reason: "identity_mismatch",
        identity,
        expectedUserId: normalizedExpectedUserId,
      })
      return
    }

    const triggerResponse = await sendTabMessageWithRetry(tabId, {
      action: RuntimeActionIds.ContentTriggerCheckinPageAction,
      requestId: tempRequestId,
      trigger: trigger ?? { kind: "checkinButton" },
    })

    if (!triggerResponse || triggerResponse.success !== true) {
      sendResponse({
        success: false,
        reason: "trigger_failed",
        identity,
        error: triggerResponse?.error ?? TEMP_WINDOW_FETCH_NO_RESPONSE_ERROR,
      })
      return
    }

    const triggerResult = triggerResponse as CheckinPageActionTriggerResult & {
      success: true
    }
    const reason =
      triggerResult.status === "clicked"
        ? "clicked"
        : triggerResult.status === "target_not_found"
          ? "target_not_found"
          : triggerResult.status === "throttled"
            ? "throttled"
            : "trigger_failed"

    sendResponse({
      success: triggerResult.clicked,
      reason,
      identity,
      trigger: {
        status: triggerResult.status,
        clicked: triggerResult.clicked,
        reason: triggerResult.reason,
        detection: triggerResult.detection,
        ...(triggerResult.target ? { target: triggerResult.target } : {}),
        ...(triggerResult.error ? { error: triggerResult.error } : {}),
      },
      ...(triggerResult.error ? { error: triggerResult.error } : {}),
    })
  } catch (error) {
    logTempWindow("tempWindowCheckinPageActionError", {
      requestId: tempRequestId,
      error: getErrorMessage(error),
    })
    await releaseTempContext(tempRequestId, {
      forceClose: true,
      reason: "tempWindowCheckinPageActionError",
    })
    sendResponse({
      success: false,
      reason: "trigger_failed",
      error: getErrorMessage(error),
    })
  } finally {
    await releaseTempContext(tempRequestId)
  }
}
```

Also add the missing type import at the top:

```ts
import type { CheckinPageActionTriggerResult } from "~/types/turnstile"
```

- [ ] **Step 5: Route the background runtime action**

Modify `src/entrypoints/background/runtimeMessages.ts`.

Import:

```ts
  handleTempWindowCheckinPageAction,
```

Add the route after `TempWindowTurnstileFetch`:

```ts
      if (request.action === RuntimeActionIds.TempWindowCheckinPageAction) {
        void handleTempWindowCheckinPageAction(request, sendResponse)
        return true
      }
```

- [ ] **Step 6: Add the browser utility wrapper**

Modify `src/utils/browser/tempWindowFetch.ts`.

Import the handler:

```ts
  handleTempWindowCheckinPageAction,
```

Import the types:

```ts
  TempWindowCheckinPageAction,
  TempWindowCheckinPageActionParams,
```

Add this function after `tempWindowTurnstileFetch(...)`:

```ts
/**
 * Triggers the site page's native check-in action in a temporary browser context.
 */
export async function tempWindowTriggerCheckinPageAction(
  params: TempWindowCheckinPageActionParams,
): Promise<TempWindowCheckinPageAction> {
  const suppressMinimize = params.suppressMinimize ?? isExtensionPopup()

  const payload: TempWindowCheckinPageActionParams = {
    ...params,
    suppressMinimize,
  }

  if (isExtensionBackground()) {
    return await new Promise<TempWindowCheckinPageAction>((resolve) => {
      let responded = false

      const finalize = (response?: TempWindowCheckinPageAction) => {
        if (responded) return
        responded = true
        resolve(
          response ?? {
            success: false,
            reason: "trigger_failed",
            error: "Empty tempWindowCheckinPageAction response",
          },
        )
      }

      void (async () => {
        try {
          await handleTempWindowCheckinPageAction(payload, (response) => {
            finalize(response as TempWindowCheckinPageAction)
          })
        } finally {
          finalize()
        }
      })()
    })
  }

  return await sendRuntimeMessage({
    action: RuntimeActionIds.TempWindowCheckinPageAction,
    ...payload,
  })
}
```

- [ ] **Step 7: Add wrapper tests**

In `tests/utils/tempWindowFetch.background.test.ts`, update the mocked background handlers:

```ts
  handleTempWindowCheckinPageActionMock: vi.fn(),
```

and:

```ts
  handleTempWindowCheckinPageAction:
    mocks.handleTempWindowCheckinPageActionMock,
```

Add this test:

```ts
  it("delegates tempWindowTriggerCheckinPageAction to the background handler", async () => {
    const { tempWindowTriggerCheckinPageAction } = await import(
      "~/utils/browser/tempWindowFetch"
    )

    mocks.handleTempWindowCheckinPageActionMock.mockImplementation(
      (_request, sendResponse) => {
        sendResponse({
          success: true,
          reason: "clicked",
          identity: { userId: "target-user", user: { id: "target-user" } },
          trigger: {
            status: "clicked",
            clicked: true,
            reason: "clicked",
            detection: {
              hasTurnstile: false,
              reasons: [],
              score: 0,
              title: "Check in",
              url: "https://example.invalid/console/personal",
            },
          },
        })
      },
    )

    const response = await tempWindowTriggerCheckinPageAction({
      originUrl: "https://example.invalid",
      pageUrl: "https://example.invalid/console/personal",
      siteType: "new-api",
      expectedUserId: "target-user",
      requestId: "req-native-wrapper",
    })

    expect(mocks.handleTempWindowCheckinPageActionMock).toHaveBeenCalledTimes(1)
    expect(response).toMatchObject({
      success: true,
      reason: "clicked",
      identity: { userId: "target-user" },
    })
  })
```

In `tests/utils/tempWindowFetch.fallback.test.ts`, add:

```ts
  it("routes tempWindowTriggerCheckinPageAction through runtime messaging", async () => {
    const { tempWindowTriggerCheckinPageAction } = await import(
      "~/utils/browser/tempWindowFetch"
    )

    sendRuntimeMessageMock.mockResolvedValueOnce({
      success: false,
      reason: "identity_mismatch",
      identity: { userId: "other-user", user: { id: "other-user" } },
      expectedUserId: "target-user",
    })

    const response = await tempWindowTriggerCheckinPageAction({
      originUrl: "https://example.invalid",
      pageUrl: "https://example.invalid/console/personal",
      siteType: "new-api",
      expectedUserId: "target-user",
      requestId: "req-native-runtime",
      suppressMinimize: true,
    })

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
      action: RuntimeActionIds.TempWindowCheckinPageAction,
      originUrl: "https://example.invalid",
      pageUrl: "https://example.invalid/console/personal",
      siteType: "new-api",
      expectedUserId: "target-user",
      requestId: "req-native-runtime",
      suppressMinimize: true,
    })
    expect(response.reason).toBe("identity_mismatch")
  })
```

- [ ] **Step 8: Run temp-window tests**

Run:

```powershell
pnpm vitest run tests/entrypoints/background/tempWindowPoolNativeCheckin.test.ts tests/utils/tempWindowFetch.background.test.ts tests/utils/tempWindowFetch.fallback.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run runtime routing tests**

Run:

```powershell
pnpm vitest run tests/entrypoints/background/runtimeMessages.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts
```

Expected: PASS. If one test asserts a fixed handler list, update only that assertion to include `RuntimeActionIds.TempWindowCheckinPageAction`.

- [ ] **Step 10: Commit the temp-window helper**

Run:

```powershell
git add src/types/tempWindowFetch.ts src/entrypoints/background/tempWindowPool.ts src/entrypoints/background/runtimeMessages.ts src/utils/browser/tempWindowFetch.ts tests/entrypoints/background/tempWindowPoolNativeCheckin.test.ts tests/utils/tempWindowFetch.background.test.ts tests/utils/tempWindowFetch.fallback.test.ts tests/entrypoints/background/runtimeMessages.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts
git commit -m "feat(checkin): add native page temp action"
```

Expected: commit succeeds after `validate:staged`.

---

### Task 4: Add Native-Page Strategy To New API Provider

**Files:**

- Modify: `src/services/checkin/autoCheckin/providers/newApi.ts`
- Modify: `tests/services/autoCheckin/providers/newApi.test.ts`

- [ ] **Step 1: Add provider tests for dynamic-signature native flow**

Modify the temp-window mock in `tests/services/autoCheckin/providers/newApi.test.ts`:

```ts
vi.mock("~/utils/browser/tempWindowFetch", () => ({
  tempWindowTriggerCheckinPageAction: vi.fn(),
  tempWindowTurnstileFetch: vi.fn(),
}))
```

Add these tests inside `describe("checkIn", () => { ... })`:

```ts
    it("uses native page check-in for narrow dynamic signature failures", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiService/common/utils"
      )
      const { tempWindowTriggerCheckinPageAction, tempWindowTurnstileFetch } =
        await import("~/utils/browser/tempWindowFetch")

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: true,
        reason: "clicked",
        identity: { userId: "123", user: { id: "123" } },
        trigger: {
          status: "clicked",
          clicked: true,
          reason: "clicked",
          detection: {
            hasTurnstile: false,
            reasons: [],
            score: 0,
            title: "Check in",
            url: "https://test.com/console/personal",
          },
        },
      })
      vi.mocked(fetchApiData).mockResolvedValueOnce({
        stats: { checked_in_today: true },
      } as any)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "already_checked",
        messageKey: "autoCheckin:providerFallback.alreadyCheckedToday",
        data: expect.objectContaining({
          reason: "clicked",
        }),
      })
      expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledWith(
        expect.objectContaining({
          originUrl: "https://test.com",
          pageUrl: "https://test.com/console/personal",
          siteType: SITE_TYPES.NEW_API,
          expectedUserId: "123",
          accountId: "test-id",
          authType: AuthTypeEnum.AccessToken,
          trigger: { kind: "checkinButton" },
        }),
      )
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
    })

    it("refuses native page check-in when temp page identity is missing", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const { tempWindowTriggerCheckinPageAction } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: false,
        reason: "identity_missing",
        identity: null,
      })

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.nativePageIdentityMissing",
        messageParams: { checkInUrl: "https://test.com/console/personal" },
        rawMessage: "missing check-in signature header",
        data: { success: false, reason: "identity_missing", identity: null },
      })
    })

    it("refuses native page check-in when temp page identity does not match", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const { tempWindowTriggerCheckinPageAction } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: false,
        reason: "identity_mismatch",
        identity: { userId: "456", user: { id: "456" } },
        expectedUserId: "123",
      })

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.nativePageIdentityMismatch",
        messageParams: { checkInUrl: "https://test.com/console/personal" },
        rawMessage: "missing check-in signature header",
        data: expect.objectContaining({
          reason: "identity_mismatch",
          expectedUserId: "123",
        }),
      })
    })

    it("returns manual-required messaging when native page trigger target is missing", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const { tempWindowTriggerCheckinPageAction } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: false,
        reason: "target_not_found",
        identity: { userId: "123", user: { id: "123" } },
        trigger: {
          status: "target_not_found",
          clicked: false,
          reason: "noTarget",
          detection: {
            hasTurnstile: false,
            reasons: [],
            score: 0,
            title: "Check in",
            url: "https://test.com/console/personal",
          },
        },
      })

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result.status).toBe("failed")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.nativePageTargetNotFound",
      )
      expect(result.messageParams).toEqual({
        checkInUrl: "https://test.com/console/personal",
      })
    })

    it("returns manual-required messaging when native click is not confirmed by status polling", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiService/common/utils"
      )
      const { tempWindowTriggerCheckinPageAction } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: true,
        reason: "clicked",
        identity: { userId: "123", user: { id: "123" } },
        trigger: {
          status: "clicked",
          clicked: true,
          reason: "clicked",
          detection: {
            hasTurnstile: false,
            reasons: [],
            score: 0,
            title: "Check in",
            url: "https://test.com/console/personal",
          },
        },
      })
      vi.mocked(fetchApiData).mockResolvedValue({
        stats: { checked_in_today: false },
      } as any)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result.status).toBe("failed")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.nativePageStatusUnconfirmed",
      )
      expect(result.messageParams).toEqual({
        checkInUrl: "https://test.com/console/personal",
      })
    })

    it("does not add native page identity matching to Turnstile replay failures", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const { tempWindowTriggerCheckinPageAction, tempWindowTurnstileFetch } =
        await import("~/utils/browser/tempWindowFetch")
      const { isAllowedIncognitoAccess } = await import(
        "~/utils/browser/browserApi"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token invalid",
        data: null,
      })
      vi.mocked(isAllowedIncognitoAccess).mockResolvedValueOnce(false)
      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: false,
        error: "Turnstile token not available",
        turnstile: { status: "timeout", hasTurnstile: true },
      })

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result.status).toBe("failed")
      expect(tempWindowTurnstileFetch).toHaveBeenCalledTimes(1)
      expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
    })
```

- [ ] **Step 2: Run provider tests to verify missing function and behavior**

Run:

```powershell
pnpm vitest run tests/services/autoCheckin/providers/newApi.test.ts
```

Expected: FAIL because `tempWindowTriggerCheckinPageAction(...)` is not used by the provider yet and native fallback keys are missing.

- [ ] **Step 3: Import native helper and account identity utilities**

Modify `src/services/checkin/autoCheckin/providers/newApi.ts` imports:

```ts
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
```

Update temp-window imports:

```ts
import type {
  TempWindowCheckinPageAction,
  TempWindowTurnstileFetch,
} from "~/types/tempWindowFetch"
import {
  tempWindowTriggerCheckinPageAction,
  tempWindowTurnstileFetch,
} from "~/utils/browser/tempWindowFetch"
```

- [ ] **Step 4: Add native-page fallback message keys and polling constants**

Extend `NEW_API_MESSAGE_KEYS`:

```ts
  nativePageIdentityMissing:
    "autoCheckin:providerFallback.nativePageIdentityMissing",
  nativePageIdentityMismatch:
    "autoCheckin:providerFallback.nativePageIdentityMismatch",
  nativePageTargetNotFound:
    "autoCheckin:providerFallback.nativePageTargetNotFound",
  nativePageTriggerFailed:
    "autoCheckin:providerFallback.nativePageTriggerFailed",
  nativePageStatusUnconfirmed:
    "autoCheckin:providerFallback.nativePageStatusUnconfirmed",
```

Add constants near `TURNSTILE_ASSIST_TIMEOUT_MS`:

```ts
const NATIVE_PAGE_STATUS_POLL_TIMEOUT_MS = 8_000
const NATIVE_PAGE_STATUS_POLL_INTERVAL_MS = 1_000
```

- [ ] **Step 5: Add narrow dynamic-signature classifier**

Add this function after `isTurnstileRequiredMessage(...)`:

```ts
function isNativePageSignatureRequiredMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  const mentionsCheckin =
    normalized.includes("check-in") ||
    normalized.includes("checkin") ||
    message.includes("签到")
  const mentionsSignature =
    normalized.includes("signature") || message.includes("签名")
  const mentionsHeader =
    normalized.includes("header") ||
    normalized.includes("x-check") ||
    message.includes("请求头")
  const mentionsMissing =
    normalized.includes("missing") ||
    normalized.includes("required") ||
    normalized.includes("empty") ||
    message.includes("缺少") ||
    message.includes("为空") ||
    message.includes("不能为空")

  return (
    mentionsCheckin && mentionsSignature && mentionsHeader && mentionsMissing
  )
}
```

This intentionally does not match generic `"signature failed"` or generic `"header invalid"` messages.

- [ ] **Step 6: Add status polling helper**

Add this function after `fetchCheckedInTodayStatus(...)`:

```ts
async function pollCheckedInTodayStatus(
  account: SiteAccount,
): Promise<boolean | undefined> {
  const deadline = Date.now() + NATIVE_PAGE_STATUS_POLL_TIMEOUT_MS
  let lastStatus: boolean | undefined

  while (Date.now() <= deadline) {
    lastStatus = await fetchCheckedInTodayStatus(account)
    if (lastStatus === true) return true

    await new Promise((resolve) =>
      setTimeout(resolve, NATIVE_PAGE_STATUS_POLL_INTERVAL_MS),
    )
  }

  return lastStatus
}
```

- [ ] **Step 7: Add native-page result mapping**

Add this helper before `resolveTurnstileAssistedCheckinResult(...)`:

```ts
function resolveNativePageFailureResult(params: {
  action: TempWindowCheckinPageAction
  checkInUrl: string
  responseMessage: string
}): CheckinResult {
  const base = {
    status: CHECKIN_RESULT_STATUS.FAILED,
    messageParams: { checkInUrl: params.checkInUrl },
    rawMessage: params.responseMessage || params.action.error || undefined,
    data: params.action,
  } satisfies Partial<CheckinResult>

  if (params.action.reason === "identity_missing") {
    return {
      ...base,
      messageKey: NEW_API_MESSAGE_KEYS.nativePageIdentityMissing,
    } as CheckinResult
  }

  if (params.action.reason === "identity_mismatch") {
    return {
      ...base,
      messageKey: NEW_API_MESSAGE_KEYS.nativePageIdentityMismatch,
    } as CheckinResult
  }

  if (params.action.reason === "target_not_found") {
    return {
      ...base,
      messageKey: NEW_API_MESSAGE_KEYS.nativePageTargetNotFound,
    } as CheckinResult
  }

  if (params.action.reason === "throttled") {
    return {
      ...base,
      messageKey: NEW_API_MESSAGE_KEYS.nativePageTriggerFailed,
    } as CheckinResult
  }

  return {
    ...base,
    messageKey: NEW_API_MESSAGE_KEYS.nativePageTriggerFailed,
  } as CheckinResult
}
```

Add this helper after it:

```ts
async function resolveNativePageCheckinResult(params: {
  account: SiteAccount
  responseMessage: string
}): Promise<CheckinResult> {
  const checkInUrl = await resolveCheckInUrl(params.account)
  const expectedUserId = normalizeAccountIdentity(
    params.account.account_info?.id,
  )

  if (!expectedUserId) {
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      messageKey: NEW_API_MESSAGE_KEYS.nativePageIdentityMissing,
      messageParams: { checkInUrl },
      rawMessage: params.responseMessage || undefined,
    }
  }

  const action = await tempWindowTriggerCheckinPageAction({
    originUrl: params.account.site_url,
    pageUrl: checkInUrl,
    requestId: `native-checkin-${params.account.id}-${Date.now()}`,
    accountId: params.account.id,
    authType: getEffectiveAuthType(params.account),
    cookieAuthSessionCookie: params.account.cookieAuth?.sessionCookie,
    siteType: params.account.site_type,
    expectedUserId,
    trigger: resolveTurnstilePreTrigger(params.account),
  })

  if (!action.success || action.reason !== "clicked") {
    return resolveNativePageFailureResult({
      action,
      checkInUrl,
      responseMessage: params.responseMessage,
    })
  }

  const checkedInToday = await pollCheckedInTodayStatus(params.account)
  if (checkedInToday === true) {
    return {
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
      data: action,
    }
  }

  return {
    status: CHECKIN_RESULT_STATUS.FAILED,
    messageKey: NEW_API_MESSAGE_KEYS.nativePageStatusUnconfirmed,
    messageParams: { checkInUrl },
    rawMessage: params.responseMessage || action.error || undefined,
    data: action,
  }
}
```

- [ ] **Step 8: Route dynamic-signature failures before Turnstile failures**

In `checkinNewApi(...)`, insert this branch before the existing Turnstile branch:

```ts
    if (
      responseMessage &&
      isNativePageSignatureRequiredMessage(responseMessage) &&
      !checkinResponse.success
    ) {
      return await resolveNativePageCheckinResult({
        account,
        responseMessage,
      })
    }
```

Keep the existing Turnstile branch unchanged after it.

- [ ] **Step 9: Handle thrown dynamic-signature errors**

Add this helper near `normalizeCheckinMessage(...)` use:

```ts
function getProviderErrorMessage(error: unknown): string {
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>
    if (typeof record.message === "string") return record.message
  }
  return ""
}
```

Replace the `catch` block in `checkinNewApi(...)` with:

```ts
  } catch (error: unknown) {
    const errorMessage = getProviderErrorMessage(error)
    if (errorMessage && isNativePageSignatureRequiredMessage(errorMessage)) {
      return await resolveNativePageCheckinResult({
        account,
        responseMessage: errorMessage,
      })
    }

    return resolveProviderErrorResult({ error })
  }
```

- [ ] **Step 10: Run provider tests**

Run:

```powershell
pnpm vitest run tests/services/autoCheckin/providers/newApi.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit provider behavior**

Run:

```powershell
git add src/services/checkin/autoCheckin/providers/newApi.ts tests/services/autoCheckin/providers/newApi.test.ts
git commit -m "feat(checkin): add native page signature fallback"
```

Expected: commit succeeds after `validate:staged`.

---

### Task 5: Add Native-Page Fallback Copy

**Files:**

- Modify: `src/locales/en/autoCheckin.json`
- Modify: `src/locales/zh-CN/autoCheckin.json`
- Modify: `src/locales/zh-TW/autoCheckin.json`
- Modify: `src/locales/ja/autoCheckin.json`
- Modify: `src/locales/vi/autoCheckin.json`

- [ ] **Step 1: Add English fallback keys**

Modify `src/locales/en/autoCheckin.json` under `"providerFallback"`:

```json
    "nativePageIdentityMismatch": "The temporary check-in page is logged in as a different account. Open the check-in page with the target account, then retry: {{checkInUrl}}",
    "nativePageIdentityMissing": "The temporary check-in page login could not be confirmed. Open the check-in page, sign in with the target account, then retry: {{checkInUrl}}",
    "nativePageStatusUnconfirmed": "The page check-in action was clicked, but the target account status was not confirmed. Please open the check-in page and check manually: {{checkInUrl}}",
    "nativePageTargetNotFound": "The check-in button could not be found on the page. Please open the check-in page and complete check-in manually: {{checkInUrl}}",
    "nativePageTriggerFailed": "The page check-in action could not be triggered. Please open the check-in page and complete check-in manually: {{checkInUrl}}",
```

Place them after `"endpointNotSupported"` and before `"turnstileIncognitoAccessRequired"` to keep fallback keys grouped.

- [ ] **Step 2: Add Simplified Chinese fallback keys**

Modify `src/locales/zh-CN/autoCheckin.json` under `"providerFallback"`:

```json
    "nativePageIdentityMismatch": "临时签到页面登录的是另一个账号。请用目标账号打开签到页面后重试：{{checkInUrl}}",
    "nativePageIdentityMissing": "无法确认临时签到页面的登录账号。请打开签到页面并使用目标账号登录后重试：{{checkInUrl}}",
    "nativePageStatusUnconfirmed": "已点击页面签到操作，但未确认目标账号完成签到。请打开签到页面手动确认：{{checkInUrl}}",
    "nativePageTargetNotFound": "未在页面上找到签到按钮。请打开签到页面手动完成签到：{{checkInUrl}}",
    "nativePageTriggerFailed": "无法触发页面签到操作。请打开签到页面手动完成签到：{{checkInUrl}}",
```

- [ ] **Step 3: Add Traditional Chinese fallback keys**

Modify `src/locales/zh-TW/autoCheckin.json` under `"providerFallback"`:

```json
    "nativePageIdentityMismatch": "臨時簽到頁面登入的是另一個帳號。請用目標帳號開啟簽到頁面後重試：{{checkInUrl}}",
    "nativePageIdentityMissing": "無法確認臨時簽到頁面的登入帳號。請開啟簽到頁面並使用目標帳號登入後重試：{{checkInUrl}}",
    "nativePageStatusUnconfirmed": "已點擊頁面簽到操作，但未確認目標帳號完成簽到。請開啟簽到頁面手動確認：{{checkInUrl}}",
    "nativePageTargetNotFound": "未在頁面上找到簽到按鈕。請開啟簽到頁面手動完成簽到：{{checkInUrl}}",
    "nativePageTriggerFailed": "無法觸發頁面簽到操作。請開啟簽到頁面手動完成簽到：{{checkInUrl}}",
```

- [ ] **Step 4: Add Japanese fallback keys**

Modify `src/locales/ja/autoCheckin.json` under `"providerFallback"`:

```json
    "nativePageIdentityMismatch": "一時チェックインページは別のアカウントでログインしています。対象アカウントでチェックインページを開いてから再試行してください: {{checkInUrl}}",
    "nativePageIdentityMissing": "一時チェックインページのログインアカウントを確認できませんでした。チェックインページを開き、対象アカウントでログインしてから再試行してください: {{checkInUrl}}",
    "nativePageStatusUnconfirmed": "ページ上のチェックイン操作はクリックされましたが、対象アカウントの状態を確認できませんでした。チェックインページを開いて手動で確認してください: {{checkInUrl}}",
    "nativePageTargetNotFound": "ページ上でチェックインボタンが見つかりませんでした。チェックインページを開いて手動で完了してください: {{checkInUrl}}",
    "nativePageTriggerFailed": "ページ上のチェックイン操作を実行できませんでした。チェックインページを開いて手動で完了してください: {{checkInUrl}}",
```

- [ ] **Step 5: Add Vietnamese fallback keys**

Modify `src/locales/vi/autoCheckin.json` under `"providerFallback"`:

```json
    "nativePageIdentityMismatch": "Trang điểm danh tạm thời đang đăng nhập bằng tài khoản khác. Hãy mở trang điểm danh bằng tài khoản mục tiêu rồi thử lại: {{checkInUrl}}",
    "nativePageIdentityMissing": "Không thể xác nhận tài khoản đăng nhập trên trang điểm danh tạm thời. Hãy mở trang điểm danh, đăng nhập bằng tài khoản mục tiêu rồi thử lại: {{checkInUrl}}",
    "nativePageStatusUnconfirmed": "Đã bấm thao tác điểm danh trên trang, nhưng chưa xác nhận được trạng thái của tài khoản mục tiêu. Vui lòng mở trang điểm danh để kiểm tra thủ công: {{checkInUrl}}",
    "nativePageTargetNotFound": "Không tìm thấy nút điểm danh trên trang. Vui lòng mở trang điểm danh và hoàn tất thủ công: {{checkInUrl}}",
    "nativePageTriggerFailed": "Không thể kích hoạt thao tác điểm danh trên trang. Vui lòng mở trang điểm danh và hoàn tất thủ công: {{checkInUrl}}",
```

- [ ] **Step 6: Run i18n extraction check**

Run:

```powershell
pnpm run i18n:extract:ci
```

Expected: PASS with no unexpected locale rewrites. If the extractor rewrites plural keys, inspect the diff and fix the source call shape before continuing.

- [ ] **Step 7: Run provider and locale-adjacent tests**

Run:

```powershell
pnpm vitest run tests/services/autoCheckin/providers/newApi.test.ts tests/features/AutoCheckin/utils/autoCheckin.test.ts tests/entrypoints/options/AutoCheckinResultsTableHints.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit native-page copy**

Run:

```powershell
git add src/locales/en/autoCheckin.json src/locales/zh-CN/autoCheckin.json src/locales/zh-TW/autoCheckin.json src/locales/ja/autoCheckin.json src/locales/vi/autoCheckin.json
git commit -m "feat(checkin): add native page fallback copy"
```

Expected: commit succeeds after `validate:staged`.

---

### Task 6: Run Integration Checks And Guard Against Scope Drift

**Files:**

- No new source files by default.
- Modify task-scoped tests only if focused checks expose a mismatch caused by Tasks 1-5.

- [ ] **Step 1: Run focused content and temp-window tests**

Run:

```powershell
pnpm vitest run tests/entrypoints/content/messageHandlers/utils/turnstileGuard.test.ts tests/entrypoints/content/messageHandlers/handlers/turnstileGuard.test.ts tests/entrypoints/content/messageHandlers/cloudflareGuard.test.tsx tests/entrypoints/background/tempWindowPoolNativeCheckin.test.ts tests/utils/tempWindowFetch.background.test.ts tests/utils/tempWindowFetch.fallback.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused provider tests**

Run:

```powershell
pnpm vitest run tests/services/autoCheckin/providers/newApi.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run related tests for touched TypeScript files**

Run:

```powershell
pnpm vitest related --run src/types/turnstile.ts src/types/tempWindowFetch.ts src/constants/runtimeActions.ts src/entrypoints/content/messageHandlers/utils/turnstileGuard.ts src/entrypoints/content/messageHandlers/handlers/turnstileGuard.ts src/entrypoints/content/messageHandlers/index.ts src/entrypoints/background/tempWindowPool.ts src/entrypoints/background/runtimeMessages.ts src/utils/browser/tempWindowFetch.ts src/services/checkin/autoCheckin/providers/newApi.ts
```

Expected: PASS. If this expands into unrelated long-running suites, report the timeout separately and keep the focused tests plus compile as the evidence for this slice.

- [ ] **Step 4: Run TypeScript compile**

Run:

```powershell
pnpm compile
```

Expected: PASS.

- [ ] **Step 5: Search for accidental replay or broad strategy changes**

Run:

```powershell
rg -n "nativePage|NativePage|ContentTriggerCheckinPageAction|TempWindowCheckinPageAction|tempWindowTriggerCheckinPageAction|isNativePageSignatureRequiredMessage|ContentPerformTempWindowFetch|tempWindowTurnstileFetch" src/services/checkin/autoCheckin src/entrypoints src/utils/browser src/types tests/services/autoCheckin tests/entrypoints tests/utils
```

Expected:

- `tempWindowTriggerCheckinPageAction(...)` is only used by the New API native signature branch and wrapper tests.
- `ContentPerformTempWindowFetch` remains used by fetch/Turnstile replay flows, not the native-page strategy.
- `tempWindowTurnstileFetch(...)` remains used by Turnstile tests and Turnstile provider flow.

- [ ] **Step 6: Confirm no settings, docs, or E2E scope drift**

Run:

```powershell
git diff --name-only HEAD
```

Expected changed paths are limited to:

```text
src/types/turnstile.ts
src/types/tempWindowFetch.ts
src/constants/runtimeActions.ts
src/entrypoints/content/messageHandlers/utils/turnstileGuard.ts
src/entrypoints/content/messageHandlers/handlers/turnstileGuard.ts
src/entrypoints/content/messageHandlers/handlers/index.ts
src/entrypoints/content/messageHandlers/index.ts
src/entrypoints/background/tempWindowPool.ts
src/entrypoints/background/runtimeMessages.ts
src/utils/browser/tempWindowFetch.ts
src/services/checkin/autoCheckin/providers/newApi.ts
src/locales/en/autoCheckin.json
src/locales/zh-CN/autoCheckin.json
src/locales/zh-TW/autoCheckin.json
src/locales/ja/autoCheckin.json
src/locales/vi/autoCheckin.json
tests/entrypoints/content/messageHandlers/utils/turnstileGuard.test.ts
tests/entrypoints/content/messageHandlers/handlers/turnstileGuard.test.ts
tests/entrypoints/content/messageHandlers/cloudflareGuard.test.tsx
tests/entrypoints/background/tempWindowPoolNativeCheckin.test.ts
tests/entrypoints/background/runtimeMessages.test.ts
tests/entrypoints/background/runtimeMessages.more.test.ts
tests/utils/tempWindowFetch.background.test.ts
tests/utils/tempWindowFetch.fallback.test.ts
tests/services/autoCheckin/providers/newApi.test.ts
```

No `docs/docs/**`, `e2e/**`, settings search files, telemetry schema files, or concrete adapter files should be changed.

- [ ] **Step 7: Run commit gate**

Stage only task-scoped files, then run:

```powershell
pnpm run validate:staged
```

Expected: PASS.

- [ ] **Step 8: Run push gate before remote handoff**

Run:

```powershell
pnpm run validate:push
```

Expected: PASS because this slice touches runtime action contracts, shared types, and background wiring.

- [ ] **Step 9: Final handoff note**

Report this exact coverage summary, replacing only command status if a command failed:

```text
Focused tests:
- pnpm vitest run tests/entrypoints/content/messageHandlers/utils/turnstileGuard.test.ts tests/entrypoints/content/messageHandlers/handlers/turnstileGuard.test.ts tests/entrypoints/content/messageHandlers/cloudflareGuard.test.tsx tests/entrypoints/background/tempWindowPoolNativeCheckin.test.ts tests/utils/tempWindowFetch.background.test.ts tests/utils/tempWindowFetch.fallback.test.ts
- pnpm vitest run tests/services/autoCheckin/providers/newApi.test.ts
- pnpm vitest run tests/services/autoCheckin/providers/newApi.test.ts tests/features/AutoCheckin/utils/autoCheckin.test.ts tests/entrypoints/options/AutoCheckinResultsTableHints.test.tsx

Related tests:
- pnpm vitest related --run src/types/turnstile.ts src/types/tempWindowFetch.ts src/constants/runtimeActions.ts src/entrypoints/content/messageHandlers/utils/turnstileGuard.ts src/entrypoints/content/messageHandlers/handlers/turnstileGuard.ts src/entrypoints/content/messageHandlers/index.ts src/entrypoints/background/tempWindowPool.ts src/entrypoints/background/runtimeMessages.ts src/utils/browser/tempWindowFetch.ts src/services/checkin/autoCheckin/providers/newApi.ts

Validation:
- pnpm run i18n:extract:ci
- pnpm compile
- pnpm run validate:staged
- pnpm run validate:push

Telemetry decision:
- Reuse existing auto-checkin result reporting. No analytics schema or privacy allow-list changes.

Settings search decision:
- None. No settings UI, anchor, deep link, or search definition changed.

E2E decision:
- No Playwright E2E added. Runtime contracts and provider branches are covered by Vitest; real deployment smoke testing needs a target deployment and account.
```

---

## Out Of Scope

- Reverse-engineering deployment JavaScript signature algorithms.
- Making all New API accounts click native pages before direct API check-in.
- Adding page-login identity gates to Turnstile replay.
- Trusting page toasts, button text, or visible copy as success.
- Adding telemetry fields or product analytics dimensions.
- Adding settings UI, settings search, or deep links.
- Adding Playwright E2E without a stable deployment fixture.

## Self-Review

- Spec coverage: Task 1 reuses the existing page pre-trigger click behavior; Task 2 exposes the content action; Task 3 adds temporary page identity resolution and a native page trigger helper; Task 4 adds the opt-in New API native strategy, dynamic-signature classifier, identity gate, and status confirmation; Task 5 handles user-facing fallback copy across app locales; Task 6 validates non-regression and scope.
- Placeholder scan: The plan has no unresolved placeholder markers, no unnamed edge-case instruction, and no step that says to write unspecified tests.
- Type consistency: `CheckinPageActionTriggerResult`, `TempWindowCheckinPageActionParams`, `TempWindowCheckinPageAction`, `TempWindowPageAccountIdentity`, `RuntimeActionIds.ContentTriggerCheckinPageAction`, and `RuntimeActionIds.TempWindowCheckinPageAction` are defined before later tasks reference them.
- Behavior preservation: Turnstile replay keeps `tempWindowTurnstileFetch(...)`, direct check-in stays first, native click is only reached for narrow dynamic-signature failures, and server-side `checked_in_today` remains the success authority.
