# Protection-Bypass Adaptive Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backward-compatible Automatic protection-bypass opening preference that adapts to browser focus, exposes a bounded development-only focus readout, and records privacy-safe focus outcomes in the existing daily summary.

**Architecture:** Keep `TempContextMode` as the concrete runtime union and add a separate persisted `TempContextPreferenceMode` containing `auto`. A focused browser helper owns tri-state sampling and transition reduction; the background pool takes its decision snapshot before final acquire-time authorization, then observes only the actual reuse/open span. Normal settings select intent, the existing Dev trigger renders one local observation, and existing product analytics stores only controlled daily counters.

**Tech Stack:** TypeScript, WXT WebExtension APIs, React, i18next, Vitest, Testing Library, existing product-analytics storage/privacy pipeline.

---

## File responsibility map

- `src/constants/tempContextMode.ts`: concrete runtime modes versus persisted preference modes.
- `src/utils/browser/browserFocus.ts`: cross-browser focus sampling, event subscription, and bounded transition reduction.
- `src/entrypoints/background/tempContextModeResolver.ts`: pure Automatic-to-concrete mode decision table.
- `src/entrypoints/background/tempWindowPool.ts`: same-origin decision snapshot, shared-window liveness, bounded opening observation, and best-effort telemetry handoff.
- `src/services/preferences/tempWindowFallbackPreferences.ts` and `src/services/preferences/userPreferences.ts`: new-install Auto default without a schema migration, plus legacy Tab normalization.
- `src/features/BasicSettings/components/tabs/Refresh/ShieldSettings.tsx`: four-choice opening-method UI.
- `src/features/BasicSettings/components/tabs/Refresh/ProtectionBypassDevTrigger.tsx`: one-run local focus readout and lifecycle cleanup.
- `src/services/productAnalytics/{contracts,state,shieldBypassSummary,settings,privacy}.ts`: controlled settings and daily focus summary fields.
- Existing focused Vitest files prove each boundary; no new Playwright operating-system-focus assertion is added.

### Task 1: Separate runtime modes from persisted preference intent

**Files:**
- Modify: `src/constants/tempContextMode.ts`
- Modify: `src/services/preferences/tempWindowFallbackPreferences.ts`
- Modify: `src/services/preferences/userPreferences.ts`
- Modify: `src/services/protectionBypass/policy.ts`
- Test: `tests/services/userPreferences.test.ts`
- Test: `tests/services/configMigration/preferences/preferencesMigration.test.ts`

- [ ] **Step 1: Write failing compatibility tests**

Add imports for `TEMP_CONTEXT_PREFERENCE_MODES`, `CURRENT_PREFERENCES_VERSION`, and `normalizeTempWindowFallbackPreferences`, then add focused assertions with these exact invariants:

```ts
it("uses Automatic only for newly created preferences", () => {
  expect(createDefaultPreferences(1).tempWindowFallback?.tempContextMode).toBe(
    TEMP_CONTEXT_PREFERENCE_MODES.Auto,
  )
  expect(DEFAULT_PREFERENCES.tempWindowFallback?.tempContextMode).toBe(
    TEMP_CONTEXT_PREFERENCE_MODES.Auto,
  )
  expect(CURRENT_PREFERENCES_VERSION).toBe(27)
})

it.each(["tab", "composite", "window"] as const)(
  "preserves an existing %s opening preference",
  (tempContextMode) => {
    expect(
      normalizeTempWindowFallbackPreferences({ tempContextMode })
        .tempContextMode,
    ).toBe(tempContextMode)
  },
)

it.each([undefined, "not-a-mode", 7])(
  "keeps the legacy Tab fallback for missing or invalid mode %p",
  (tempContextMode) => {
    expect(
      normalizeTempWindowFallbackPreferences({ tempContextMode })
        .tempContextMode,
    ).toBe(TEMP_CONTEXT_MODES.Tab)
  },
)

it("accepts Automatic as an already stored preference", () => {
  expect(
    normalizeTempWindowFallbackPreferences({ tempContextMode: "auto" })
      .tempContextMode,
  ).toBe(TEMP_CONTEXT_PREFERENCE_MODES.Auto)
})

it("does not materialize a legacy fallback during a read", async () => {
  const storage = (userPreferences as any).storage as {
    get: ReturnType<typeof vi.fn>
    set: ReturnType<typeof vi.fn>
  }
  vi.spyOn(storage, "get").mockResolvedValueOnce({
    ...DEFAULT_PREFERENCES,
    tempWindowFallback: { enabled: true },
  })
  const setSpy = vi.spyOn(storage, "set")

  const preferences = await userPreferences.getPreferences()

  expect(preferences.tempWindowFallback?.tempContextMode).toBe(
    TEMP_CONTEXT_MODES.Tab,
  )
  expect(setSpy).not.toHaveBeenCalled()
})
```

In the migration test, add a v27 input with a missing mode and assert the returned normalized value is Tab while the current version remains 27. Do not add a v28 migration case.

- [ ] **Step 2: Run the tests to verify the new contract fails**

Run:

```powershell
pnpm vitest run tests/services/userPreferences.test.ts tests/services/configMigration/preferences/preferencesMigration.test.ts
```

Expected: FAIL because `TEMP_CONTEXT_PREFERENCE_MODES` and the split defaults do not exist, and the current new-install default is Tab.

- [ ] **Step 3: Add the preference-only union and split defaults**

Replace `src/constants/tempContextMode.ts` with:

```ts
export const TEMP_CONTEXT_MODES = {
  Window: "window",
  Composite: "composite",
  Tab: "tab",
} as const

export type TempContextMode =
  (typeof TEMP_CONTEXT_MODES)[keyof typeof TEMP_CONTEXT_MODES]

export const TEMP_CONTEXT_PREFERENCE_MODES = {
  Auto: "auto",
  ...TEMP_CONTEXT_MODES,
} as const

export type TempContextPreferenceMode =
  (typeof TEMP_CONTEXT_PREFERENCE_MODES)[keyof typeof TEMP_CONTEXT_PREFERENCE_MODES]
```

In `tempWindowFallbackPreferences.ts`, use the preference type and these two exported constants:

```ts
export const DEFAULT_NEW_INSTALL_TEMP_CONTEXT_PREFERENCE =
  TEMP_CONTEXT_PREFERENCE_MODES.Auto
export const LEGACY_TEMP_CONTEXT_MODE_FALLBACK = TEMP_CONTEXT_MODES.Tab

export interface TempWindowFallbackPreferences {
  enabled: boolean
  automaticFeatureBypass: Record<ProtectionBypassAutomaticFeature, boolean>
  tempContextMode: TempContextPreferenceMode
}

function isTempContextPreferenceMode(
  value: unknown,
): value is TempContextPreferenceMode {
  return Object.values(TEMP_CONTEXT_PREFERENCE_MODES).includes(
    value as TempContextPreferenceMode,
  )
}
```

Use `isTempContextPreferenceMode` in normalization and fall back only to `LEGACY_TEMP_CONTEXT_MODE_FALLBACK`. In `DEFAULT_PREFERENCES`, use `DEFAULT_NEW_INSTALL_TEMP_CONTEXT_PREFERENCE`. Change protection-bypass policy/capability preference fields from `TempContextMode` to `TempContextPreferenceMode`; leave actual acquired context/outcome types as `TempContextMode`.

- [ ] **Step 4: Run preference and policy type checks**

Run:

```powershell
pnpm vitest run tests/services/userPreferences.test.ts tests/services/configMigration/preferences/preferencesMigration.test.ts tests/entrypoints/background/protectionBypassCoordinator.test.ts
```

Expected: PASS, including schema version 27, concrete-value preservation, and legacy Tab fallback.

- [ ] **Step 5: Commit the preference contract**

```powershell
git add src/constants/tempContextMode.ts src/services/preferences/tempWindowFallbackPreferences.ts src/services/preferences/userPreferences.ts src/services/protectionBypass/policy.ts tests/services/userPreferences.test.ts tests/services/configMigration/preferences/preferencesMigration.test.ts
git commit -m "feat(protection-bypass): add automatic mode preference"
```

### Task 2: Add shared browser-focus sampling and transition reduction

**Files:**
- Create: `src/utils/browser/browserFocus.ts`
- Create: `tests/utils/browserFocus.test.ts`

- [ ] **Step 1: Write failing tests for sampling, reduction, and cleanup**

Create `tests/utils/browserFocus.test.ts` with fake-browser setup that covers these public behaviors:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  BROWSER_FOCUS_STATES,
  BROWSER_FOCUS_TRANSITIONS,
  createBrowserFocusObservation,
  createBrowserFocusTransitionTracker,
  readBrowserFocusState,
} from "~/utils/browser/browserFocus"

describe("browser focus", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it.each([
    [{ id: 1, focused: true }, BROWSER_FOCUS_STATES.Focused],
    [{ id: 1, focused: false }, BROWSER_FOCUS_STATES.Unfocused],
    [{ focused: true }, BROWSER_FOCUS_STATES.Unknown],
    [{ id: 1 }, BROWSER_FOCUS_STATES.Unknown],
  ] as const)("normalizes getLastFocused result %p", async (window, expected) => {
    vi.spyOn(browser.windows, "getLastFocused").mockResolvedValue(window)
    await expect(readBrowserFocusState()).resolves.toBe(expected)
  })

  it("returns unknown when the focus read rejects", async () => {
    vi.spyOn(browser.windows, "getLastFocused").mockRejectedValue(
      new Error("browser unavailable"),
    )
    await expect(readBrowserFocusState()).resolves.toBe(
      BROWSER_FOCUS_STATES.Unknown,
    )
  })

  it("reduces a background-to-foreground observation", () => {
    const tracker = createBrowserFocusTransitionTracker(
      BROWSER_FOCUS_STATES.Unfocused,
    )
    tracker.note(BROWSER_FOCUS_STATES.Focused)
    expect(tracker.finish(BROWSER_FOCUS_STATES.Focused)).toEqual({
      start: BROWSER_FOCUS_STATES.Unfocused,
      transition: BROWSER_FOCUS_TRANSITIONS.Foregrounded,
      end: BROWSER_FOCUS_STATES.Focused,
    })
  })

  it("classifies two-direction movement as mixed", () => {
    const tracker = createBrowserFocusTransitionTracker(
      BROWSER_FOCUS_STATES.Focused,
    )
    tracker.note(BROWSER_FOCUS_STATES.Unfocused)
    tracker.note(BROWSER_FOCUS_STATES.Focused)
    expect(tracker.finish(BROWSER_FOCUS_STATES.Focused).transition).toBe(
      BROWSER_FOCUS_TRANSITIONS.Mixed,
    )
  })

  it("removes the listener after a bounded observation finishes", async () => {
    const removeListener = vi.spyOn(browser.windows.onFocusChanged, "removeListener")
    vi.spyOn(browser.windows, "getLastFocused").mockResolvedValue({
      id: 1,
      focused: true,
    })
    const observation = createBrowserFocusObservation(
      BROWSER_FOCUS_STATES.Focused,
    )
    await observation.finish()
    expect(removeListener).toHaveBeenCalledOnce()
  })
})
```

Also cover remained focused, remained unfocused, backgrounded, unknown start, unknown end, `WINDOW_ID_NONE`, listener API absence, and idempotent `cancel()`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
pnpm vitest run tests/utils/browserFocus.test.ts
```

Expected: FAIL because `~/utils/browser/browserFocus` does not exist.

- [ ] **Step 3: Implement the complete shared focus boundary**

Create `src/utils/browser/browserFocus.ts` with this public contract:

```ts
export const BROWSER_FOCUS_STATES = {
  Focused: "focused",
  Unfocused: "unfocused",
  Unknown: "unknown",
} as const

export type BrowserFocusState =
  (typeof BROWSER_FOCUS_STATES)[keyof typeof BROWSER_FOCUS_STATES]

export const BROWSER_FOCUS_TRANSITIONS = {
  RemainedFocused: "remained_focused",
  RemainedUnfocused: "remained_unfocused",
  Foregrounded: "foregrounded",
  Backgrounded: "backgrounded",
  Mixed: "mixed",
  Unknown: "unknown",
} as const

export type BrowserFocusTransition =
  (typeof BROWSER_FOCUS_TRANSITIONS)[keyof typeof BROWSER_FOCUS_TRANSITIONS]

export interface BrowserFocusObservation {
  start: BrowserFocusState
  transition: BrowserFocusTransition
  end: BrowserFocusState
}

export async function readBrowserFocusState(): Promise<BrowserFocusState> {
  try {
    const windowsApi = browser.windows
    if (typeof windowsApi?.getLastFocused !== "function") {
      return BROWSER_FOCUS_STATES.Unknown
    }
    const window = await windowsApi.getLastFocused({})
    if (typeof window?.id !== "number" || typeof window.focused !== "boolean") {
      return BROWSER_FOCUS_STATES.Unknown
    }
    return window.focused
      ? BROWSER_FOCUS_STATES.Focused
      : BROWSER_FOCUS_STATES.Unfocused
  } catch {
    return BROWSER_FOCUS_STATES.Unknown
  }
}
```

Implement `createBrowserFocusTransitionTracker(start)` with `note(state)` and `finish(end)`: keep the last known state plus `sawForegrounding` and `sawBackgrounding`; return Unknown if start/end is Unknown, Mixed if both direction flags are true, otherwise Foregrounded, Backgrounded, RemainedFocused, or RemainedUnfocused.

Implement `createBrowserFocusObservation(start)` so it registers one `browser.windows.onFocusChanged` listener, maps `browser.windows.WINDOW_ID_NONE` (or `-1` when the constant is absent) to Unfocused and every other numeric window ID to Focused, and returns:

```ts
{
  async finish(): Promise<BrowserFocusObservation>,
  cancel(): void,
}
```

`finish()` must remove the listener before awaiting the end sample, be idempotent, and return an Unknown transition if listener registration was unavailable. `cancel()` must only remove the listener and be safe to call repeatedly.
Both methods must absorb browser-event cleanup/read failures so diagnostics can
never change the protected operation's result.

- [ ] **Step 4: Run sampling/reducer tests**

Run:

```powershell
pnpm vitest run tests/utils/browserFocus.test.ts
```

Expected: PASS for focused, unfocused, unknown, all six transition classes, and cleanup.

- [ ] **Step 5: Commit the shared helper**

```powershell
git add src/utils/browser/browserFocus.ts tests/utils/browserFocus.test.ts
git commit -m "feat(browser): add bounded focus observation"
```

### Task 3: Encode Automatic mode resolution as a pure decision table

**Files:**
- Create: `src/entrypoints/background/tempContextModeResolver.ts`
- Create: `tests/entrypoints/background/tempContextModeResolver.test.ts`

- [ ] **Step 1: Write the failing decision-table test**

Create a table that proves priority and fixed-mode compatibility:

```ts
import { describe, expect, it } from "vitest"

import {
  TEMP_CONTEXT_MODES,
  TEMP_CONTEXT_PREFERENCE_MODES,
} from "~/constants/tempContextMode"
import { resolveTempContextOpenMode } from "~/entrypoints/background/tempContextModeResolver"
import { BROWSER_FOCUS_STATES } from "~/utils/browser/browserFocus"

describe("resolveTempContextOpenMode", () => {
  it.each([
    [true, false, BROWSER_FOCUS_STATES.Unfocused, TEMP_CONTEXT_MODES.Window],
    [false, true, BROWSER_FOCUS_STATES.Unfocused, TEMP_CONTEXT_MODES.Composite],
    [false, false, BROWSER_FOCUS_STATES.Focused, TEMP_CONTEXT_MODES.Composite],
    [false, false, BROWSER_FOCUS_STATES.Unfocused, TEMP_CONTEXT_MODES.Tab],
    [false, false, BROWSER_FOCUS_STATES.Unknown, TEMP_CONTEXT_MODES.Tab],
  ] as const)(
    "resolves Auto with incognito=%s shared=%s focus=%s",
    (incognito, sharedWindowAvailable, focusState, expected) => {
      expect(
        resolveTempContextOpenMode({
          preferredMode: TEMP_CONTEXT_PREFERENCE_MODES.Auto,
          incognito,
          sharedWindowAvailable,
          focusState,
        }),
      ).toBe(expected)
    },
  )

  it.each(Object.values(TEMP_CONTEXT_MODES))(
    "preserves fixed %s outside private isolation",
    (preferredMode) => {
      expect(
        resolveTempContextOpenMode({
          preferredMode,
          incognito: false,
          sharedWindowAvailable: false,
          focusState: BROWSER_FOCUS_STATES.Unknown,
        }),
      ).toBe(preferredMode)
    },
  )
})
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run:

```powershell
pnpm vitest run tests/entrypoints/background/tempContextModeResolver.test.ts
```

Expected: FAIL because the resolver module does not exist.

- [ ] **Step 3: Implement the pure resolver**

Create `src/entrypoints/background/tempContextModeResolver.ts`:

```ts
import {
  TEMP_CONTEXT_MODES,
  TEMP_CONTEXT_PREFERENCE_MODES,
  type TempContextMode,
  type TempContextPreferenceMode,
} from "~/constants/tempContextMode"
import {
  BROWSER_FOCUS_STATES,
  type BrowserFocusState,
} from "~/utils/browser/browserFocus"

export function resolveTempContextOpenMode(params: {
  preferredMode: TempContextPreferenceMode
  incognito: boolean
  sharedWindowAvailable: boolean
  focusState: BrowserFocusState
}): TempContextMode {
  if (params.incognito) return TEMP_CONTEXT_MODES.Window
  if (params.preferredMode !== TEMP_CONTEXT_PREFERENCE_MODES.Auto) {
    return params.preferredMode
  }
  if (params.sharedWindowAvailable) return TEMP_CONTEXT_MODES.Composite
  return params.focusState === BROWSER_FOCUS_STATES.Focused
    ? TEMP_CONTEXT_MODES.Composite
    : TEMP_CONTEXT_MODES.Tab
}
```

- [ ] **Step 4: Run the pure decision tests**

Run:

```powershell
pnpm vitest run tests/entrypoints/background/tempContextModeResolver.test.ts
```

Expected: PASS for private isolation, live shared-window reuse, focused/unfocused/unknown Auto, and all three fixed modes.

- [ ] **Step 5: Commit the resolver**

```powershell
git add src/entrypoints/background/tempContextModeResolver.ts tests/entrypoints/background/tempContextModeResolver.test.ts
git commit -m "feat(protection-bypass): resolve automatic context mode"
```

### Task 4: Integrate the acquire-time snapshot without weakening final authorization

**Files:**
- Modify: `src/entrypoints/background/tempWindowPool.ts`
- Modify: `tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts`

- [ ] **Step 1: Add failing pool-ordering and runtime behavior tests**

Extend the existing fake-browser test harness to record these ordered markers:

```ts
const order: string[] = []
vi.spyOn(browser.windows, "getLastFocused").mockImplementation(async () => {
  order.push("focus")
  return { id: 1, focused: true }
})
const authorizeAtAcquire = vi.fn(async () => {
  order.push("authorize")
  return allowedDecision({ adapter: "auto" })
})
browser.tabs.create.mockImplementation(async () => {
  order.push("open")
  return { id: 22 }
})
```

After executing through the existing public pool task entrypoint, assert:

```ts
expect(order.indexOf("focus")).toBeLessThan(order.indexOf("authorize"))
expect(order.indexOf("authorize")).toBeLessThan(order.indexOf("open"))
```

Add behavior cases proving focused Auto opens/reuses Composite, unfocused and rejected focus reads use an inactive plain Tab, a live `compositeWindowId` wins while unfocused, a stale shared-window handle is cleared before resolving to Tab, incognito Auto remains Window with no ordinary Tab rollback, and fixed Tab/Composite/Window retain current calls.

- [ ] **Step 2: Run the pool test and verify failures**

Run:

```powershell
pnpm vitest run tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts
```

Expected: FAIL because the pool has no Auto branch and currently calls final authorization before collecting the focus/shared-window decision inputs.

- [ ] **Step 3: Add a serialized shared-window liveness probe**

In `tempWindowPool.ts`, add this helper beside the composite-window lock:

```ts
async function hasLiveCompositeWindow(): Promise<boolean> {
  return await withCompositeWindowLock(async () => {
    if (compositeWindowId == null) return false
    try {
      const existingWindow = await getWindow(compositeWindowId)
      if (existingWindow?.id === compositeWindowId) return true
    } catch {
      // A closed or inaccessible remembered window is not reusable.
    }
    compositeWindowId = null
    return false
  })
}
```

This probe must not create a window and must preserve the existing composite open/close serialization.

- [ ] **Step 4: Move all Automatic decision reads before final authorization**

Inside the `withOriginLock` callback, collect preference and shared-window
liveness first, then sample focus immediately before `authorizeAtAcquire()`:

```ts
const [storedPreference, sharedWindowAvailable] = await Promise.all([
  resolveTempContextPreferenceMode(),
  hasLiveCompositeWindow(),
])
const focusState = await readBrowserFocusState()

const decision = authorizeAtAcquire ? await authorizeAtAcquire() : undefined
finalDecision = decision
if (decision?.kind === PROTECTION_BYPASS_DECISION_RESULTS.Denied) {
  throw createProtectionBypassDecisionError(decision)
}
const preferredMode =
  decision?.kind === PROTECTION_BYPASS_DECISION_RESULTS.Allowed
    ? decision.adapter
    : storedPreference
const requestedMode = resolveTempContextOpenMode({
  preferredMode,
  incognito: Boolean(options.incognito),
  sharedWindowAvailable,
  focusState,
})
```

Rename the existing preference reader to `resolveTempContextPreferenceMode`.
When the preference service itself is unavailable, return
`DEFAULT_NEW_INSTALL_TEMP_CONTEXT_PREFERENCE`; missing or invalid stored data
has already been normalized to `LEGACY_TEMP_CONTEXT_MODE_FALLBACK` at the
preference boundary. Pass `requestedMode` into `createTempContextInstance`;
change that function to accept a concrete `TempContextMode` and remove its
internal resolver call. Keep
`allowWindowRollback = !useIncognito && requestedMode !== TEMP_CONTEXT_MODES.Tab`
exactly, so private isolation can never collapse into a regular-profile Tab.

For an already reusable same-origin context, return that concrete context as today; the Automatic snapshot affects creation only and must not discard a valid pooled context.

- [ ] **Step 5: Run focused pool and coordinator tests**

Run:

```powershell
pnpm vitest run tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts tests/entrypoints/background/protectionBypassCoordinator.test.ts tests/entrypoints/background/protectionBypassCoordinator.defaultValidator.test.ts
```

Expected: PASS, with explicit ordering `focus -> authorize -> open`, unchanged acquire-time resource validation, fixed-mode compatibility, and incognito Window isolation.

- [ ] **Step 6: Commit the pool selection change**

```powershell
git add src/entrypoints/background/tempWindowPool.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts
git commit -m "feat(protection-bypass): adapt context opening to focus"
```

### Task 5: Add Automatic to settings, localization, search, and settings analytics

**Files:**
- Modify: `src/features/BasicSettings/components/tabs/Refresh/ShieldSettings.tsx`
- Verify unchanged target: `src/features/BasicSettings/components/tabs/Refresh/Refresh.search.ts`
- Verify unchanged target: `src/features/BasicSettings/components/tabs/Refresh/searchTargets.ts`
- Modify: `src/locales/en/settings.json`
- Modify: `src/locales/es-419/settings.json`
- Modify: `src/locales/ja/settings.json`
- Modify: `src/locales/vi/settings.json`
- Modify: `src/locales/zh-CN/settings.json`
- Modify: `src/locales/zh-TW/settings.json`
- Modify: `src/services/productAnalytics/contracts.ts`
- Modify: `src/services/productAnalytics/settings.ts`
- Test: `tests/entrypoints/options/ShieldSettings.test.tsx`
- Test: `tests/services/productAnalytics/settings.test.ts`

- [ ] **Step 1: Write failing settings UI and snapshot tests**

Add assertions that the segmented control exposes labels in this order and recommends only Automatic:

```ts
const methodGroup = screen.getByRole("group", { name: /opening method/i })
expect(
  within(methodGroup)
    .getAllByRole("button")
    .map((button) => button.textContent?.replace(/\s+/g, " ").trim()),
).toEqual([
  expect.stringContaining("Automatic"),
  "Tab in current window",
  "Single shared window",
  "New window each time",
])
expect(
  within(methodGroup).getByRole("button", { name: /automatic.*recommended/i }),
).toBeInTheDocument()
```

Select each button and assert the one selected-mode hint changes. Keep the existing assertion that the opening-method search result targets `SHIELD_SETTINGS_TARGET_IDS.method` and the Refresh tab anchor.

In `tests/services/productAnalytics/settings.test.ts`, pass `tempContextMode: "auto"` and expect:

```ts
expect(snapshot.temp_window_fallback_mode).toBe(
  PRODUCT_ANALYTICS_MODE_IDS.TempWindowModeAuto,
)
```

- [ ] **Step 2: Run UI and settings analytics tests to verify failure**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/ShieldSettings.test.tsx tests/services/productAnalytics/settings.test.ts
```

Expected: FAIL because Automatic is not rendered or mapped.

- [ ] **Step 3: Render Automatic first and move the recommendation**

Import `Sparkles` and `TEMP_CONTEXT_PREFERENCE_MODES`. Add this first tuple to both the button list and `methodHints`:

```tsx
[
  TEMP_CONTEXT_PREFERENCE_MODES.Auto,
  t("refresh.shieldMethodAuto"),
  <Sparkles aria-hidden="true" className="size-4" />,
]
```

Change the Star and screen-reader recommendation conditions from `TEMP_CONTEXT_MODES.Tab` to `TEMP_CONTEXT_PREFERENCE_MODES.Auto`. Leave the three concrete callbacks unchanged.

- [ ] **Step 4: Add synchronized locale keys**

Add these exact localized values to all six `settings.json` files:

```json
// src/locales/en/settings.json
"shieldMethodAuto": "Automatic",
"shieldMethodHintAuto": "Prioritizes avoiding interruptions. While you are using the browser, verification pages stay together in a shared window; while the browser is in the background, an inactive tab is used and closed when finished.",

// src/locales/es-419/settings.json
"shieldMethodAuto": "Automático",
"shieldMethodHintAuto": "Prioriza evitar interrupciones. Mientras usas el navegador, las páginas de verificación se agrupan en una ventana compartida; cuando el navegador está en segundo plano, se usa una pestaña inactiva que se cierra al finalizar.",

// src/locales/ja/settings.json
"shieldMethodAuto": "自動選択",
"shieldMethodHintAuto": "作業を中断しないことを優先します。ブラウザーを使用中は検証ページを共有ウィンドウにまとめ、ブラウザーがバックグラウンドにあるときは非アクティブなタブを使用して、完了後に自動で閉じます。",

// src/locales/vi/settings.json
"shieldMethodAuto": "Tự động",
"shieldMethodHintAuto": "Ưu tiên tránh làm gián đoạn công việc hiện tại. Khi bạn đang dùng trình duyệt, các trang xác minh được gom vào một cửa sổ dùng chung; khi trình duyệt ở nền, tiện ích dùng một thẻ không hoạt động và tự đóng thẻ đó khi hoàn tất.",

// src/locales/zh-CN/settings.json
"shieldMethodAuto": "自动选择",
"shieldMethodHintAuto": "优先避免打断当前工作。你正在使用浏览器时，验证页面会集中在共享窗口；浏览器在后台时，会使用一个非活动标签页，并在完成后自动关闭。",

// src/locales/zh-TW/settings.json
"shieldMethodAuto": "自動選擇",
"shieldMethodHintAuto": "優先避免打斷目前工作。你正在使用瀏覽器時，驗證頁面會集中在共用視窗；瀏覽器在背景時，會使用一個非作用中的分頁，並在完成後自動關閉。"
```

The comments above identify target files and are not inserted into JSON. Do not
add browser API names or causation claims to any locale.

- [ ] **Step 5: Add the controlled settings snapshot value**

In `PRODUCT_ANALYTICS_MODE_IDS`, add:

```ts
TempWindowModeAuto: "temp_window_mode_auto",
```

Update `getTempWindowMode` to handle Auto first:

```ts
if (mode === TEMP_CONTEXT_PREFERENCE_MODES.Auto) {
  return PRODUCT_ANALYTICS_MODE_IDS.TempWindowModeAuto
}
```

The existing privacy allow-list already derives from `Object.values(PRODUCT_ANALYTICS_MODE_IDS)`; do not add a raw string outside this controlled catalog.

- [ ] **Step 6: Run extraction and focused tests**

Run:

```powershell
pnpm run i18n:extract:ci
pnpm vitest run tests/entrypoints/options/ShieldSettings.test.tsx tests/services/productAnalytics/settings.test.ts tests/services/productAnalytics/privacy.test.ts
```

Expected: extraction reports no unexpected updates; all UI, search-target, snapshot, and allow-list tests PASS.

- [ ] **Step 7: Commit settings and locale changes**

```powershell
git add src/features/BasicSettings/components/tabs/Refresh/ShieldSettings.tsx src/locales/en/settings.json src/locales/es-419/settings.json src/locales/ja/settings.json src/locales/vi/settings.json src/locales/zh-CN/settings.json src/locales/zh-TW/settings.json src/services/productAnalytics/contracts.ts src/services/productAnalytics/settings.ts tests/entrypoints/options/ShieldSettings.test.tsx tests/services/productAnalytics/settings.test.ts
git commit -m "feat(settings): recommend adaptive verification opening"
```

### Task 6: Show one bounded focus observation in the existing Dev trigger

**Files:**
- Modify: `src/features/BasicSettings/components/tabs/Refresh/ProtectionBypassDevTrigger.tsx`
- Modify: `src/locales/en/settings.json`
- Modify: `src/locales/es-419/settings.json`
- Modify: `src/locales/ja/settings.json`
- Modify: `src/locales/vi/settings.json`
- Modify: `src/locales/zh-CN/settings.json`
- Modify: `src/locales/zh-TW/settings.json`
- Test: `tests/entrypoints/options/ShieldSettings.test.tsx`

- [ ] **Step 1: Write failing Dev lifecycle tests**

Mock `readBrowserFocusState` and `createBrowserFocusObservation`, then cover actual submission timing and result replacement:

```ts
it("starts focus observation after the countdown and renders it on success", async () => {
  readBrowserFocusState.mockResolvedValue(BROWSER_FOCUS_STATES.Unfocused)
  finishFocusObservation.mockResolvedValue({
    start: BROWSER_FOCUS_STATES.Unfocused,
    transition: BROWSER_FOCUS_TRANSITIONS.Foregrounded,
    end: BROWSER_FOCUS_STATES.Focused,
  })
  await user.click(screen.getByRole("button", { name: /trigger after delay/i }))
  expect(readBrowserFocusState).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(5_000)
  expect(readBrowserFocusState).toHaveBeenCalledOnce()
  expect(await screen.findByText(/this run/i)).toBeInTheDocument()
  expect(screen.getByText(/start: browser in background/i)).toBeInTheDocument()
  expect(screen.getByText(/during: browser returned to foreground/i)).toBeInTheDocument()
  expect(screen.getByText(/end: browser in foreground/i)).toBeInTheDocument()
})
```

Add cases for request rejection still showing the observation beside the existing alert, second run replacing the first readout, countdown cancellation clearing the prior readout without registering a listener, and unmount invoking `cancel()` without a stale state update.

- [ ] **Step 2: Run the component test and verify it fails**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/ShieldSettings.test.tsx
```

Expected: FAIL because the Dev trigger has no focus observation state or readout.

- [ ] **Step 3: Wrap only the executed Dev request**

Add `focusObservation` state and a controller ref. At the beginning of `execute`, after the countdown is cleared and immediately before `executeShieldDevTrigger`, use:

```ts
setFocusObservation(null)
const start = await readBrowserFocusState()
if (!isMountedRef.current) return
const controller = createBrowserFocusObservation(start)
focusObservationRef.current = controller

try {
  const response = await executeShieldDevTrigger({ presetId, url: targetUrl })
  // Keep the existing success/error feedback branches.
} catch (error) {
  // Keep the existing local fallback error branch.
} finally {
  const observation = await controller.finish()
  if (focusObservationRef.current === controller) {
    focusObservationRef.current = null
  }
  if (isMountedRef.current) {
    setFocusObservation(observation)
    setIsRunning(false)
  }
}
```

In countdown cancellation and unmount cleanup, call the current controller's `cancel()` and clear its ref. Each new run clears the prior rendered observation. Do not change `protectionBypassDevTriggerRuntime.ts` or the background message contract.

- [ ] **Step 4: Render controlled localized state labels**

Add exhaustive functions mapping all three states and six transitions to literal translation keys. Render one compact block beneath feedback:

```tsx
{focusObservation && (
  <div aria-label={t("refresh.shieldDevFocusTitle")} className="space-y-1">
    <BodySmall>{t("refresh.shieldDevFocusTitle")}</BodySmall>
    <Muted>{t("refresh.shieldDevFocusStart", { state: getFocusStateLabel(t, focusObservation.start) })}</Muted>
    <Muted>{t("refresh.shieldDevFocusDuring", { transition: getFocusTransitionLabel(t, focusObservation.transition) })}</Muted>
    <Muted>{t("refresh.shieldDevFocusEnd", { state: getFocusStateLabel(t, focusObservation.end) })}</Muted>
  </div>
)}
```

Add the following exact key family to the named locale. The leading locale
comment identifies the target file and is not inserted into JSON.

```json
// src/locales/en/settings.json
"shieldDevFocusTitle": "This run",
"shieldDevFocusStart": "Start: {{state}}",
"shieldDevFocusDuring": "During: {{transition}}",
"shieldDevFocusEnd": "End: {{state}}",
"shieldDevFocusStateFocused": "browser in foreground",
"shieldDevFocusStateUnfocused": "browser in background",
"shieldDevFocusStateUnknown": "unable to determine",
"shieldDevFocusTransitionRemainedFocused": "browser remained in foreground",
"shieldDevFocusTransitionRemainedUnfocused": "browser remained in background",
"shieldDevFocusTransitionForegrounded": "browser returned to foreground",
"shieldDevFocusTransitionBackgrounded": "browser moved to background",
"shieldDevFocusTransitionMixed": "browser moved between foreground and background",
"shieldDevFocusTransitionUnknown": "unable to determine"
```

```json
// src/locales/es-419/settings.json
"shieldDevFocusTitle": "Esta ejecución",
"shieldDevFocusStart": "Inicio: {{state}}",
"shieldDevFocusDuring": "Durante: {{transition}}",
"shieldDevFocusEnd": "Final: {{state}}",
"shieldDevFocusStateFocused": "navegador en primer plano",
"shieldDevFocusStateUnfocused": "navegador en segundo plano",
"shieldDevFocusStateUnknown": "no se pudo determinar",
"shieldDevFocusTransitionRemainedFocused": "el navegador permaneció en primer plano",
"shieldDevFocusTransitionRemainedUnfocused": "el navegador permaneció en segundo plano",
"shieldDevFocusTransitionForegrounded": "el navegador volvió al primer plano",
"shieldDevFocusTransitionBackgrounded": "el navegador pasó a segundo plano",
"shieldDevFocusTransitionMixed": "el navegador alternó entre primer y segundo plano",
"shieldDevFocusTransitionUnknown": "no se pudo determinar"
```

```json
// src/locales/ja/settings.json
"shieldDevFocusTitle": "今回の検出",
"shieldDevFocusStart": "開始：{{state}}",
"shieldDevFocusDuring": "実行中：{{transition}}",
"shieldDevFocusEnd": "終了：{{state}}",
"shieldDevFocusStateFocused": "ブラウザーはフォアグラウンド",
"shieldDevFocusStateUnfocused": "ブラウザーはバックグラウンド",
"shieldDevFocusStateUnknown": "判定できません",
"shieldDevFocusTransitionRemainedFocused": "ブラウザーはフォアグラウンドのまま",
"shieldDevFocusTransitionRemainedUnfocused": "ブラウザーはバックグラウンドのまま",
"shieldDevFocusTransitionForegrounded": "ブラウザーがフォアグラウンドに戻りました",
"shieldDevFocusTransitionBackgrounded": "ブラウザーがバックグラウンドに移りました",
"shieldDevFocusTransitionMixed": "ブラウザーがフォアグラウンドとバックグラウンドの間を移動しました",
"shieldDevFocusTransitionUnknown": "判定できません"
```

```json
// src/locales/vi/settings.json
"shieldDevFocusTitle": "Lần kiểm tra này",
"shieldDevFocusStart": "Bắt đầu: {{state}}",
"shieldDevFocusDuring": "Trong quá trình: {{transition}}",
"shieldDevFocusEnd": "Kết thúc: {{state}}",
"shieldDevFocusStateFocused": "trình duyệt ở phía trước",
"shieldDevFocusStateUnfocused": "trình duyệt ở nền",
"shieldDevFocusStateUnknown": "không thể xác định",
"shieldDevFocusTransitionRemainedFocused": "trình duyệt vẫn ở phía trước",
"shieldDevFocusTransitionRemainedUnfocused": "trình duyệt vẫn ở nền",
"shieldDevFocusTransitionForegrounded": "trình duyệt đã trở lại phía trước",
"shieldDevFocusTransitionBackgrounded": "trình duyệt đã chuyển xuống nền",
"shieldDevFocusTransitionMixed": "trình duyệt đã chuyển qua lại giữa phía trước và nền",
"shieldDevFocusTransitionUnknown": "không thể xác định"
```

```json
// src/locales/zh-CN/settings.json
"shieldDevFocusTitle": "本次检测",
"shieldDevFocusStart": "开始：{{state}}",
"shieldDevFocusDuring": "过程中：{{transition}}",
"shieldDevFocusEnd": "结束：{{state}}",
"shieldDevFocusStateFocused": "浏览器在前台",
"shieldDevFocusStateUnfocused": "浏览器在后台",
"shieldDevFocusStateUnknown": "无法判断",
"shieldDevFocusTransitionRemainedFocused": "浏览器始终在前台",
"shieldDevFocusTransitionRemainedUnfocused": "浏览器始终在后台",
"shieldDevFocusTransitionForegrounded": "浏览器曾回到前台",
"shieldDevFocusTransitionBackgrounded": "浏览器曾进入后台",
"shieldDevFocusTransitionMixed": "浏览器曾在前台和后台之间切换",
"shieldDevFocusTransitionUnknown": "无法判断"
```

```json
// src/locales/zh-TW/settings.json
"shieldDevFocusTitle": "本次偵測",
"shieldDevFocusStart": "開始：{{state}}",
"shieldDevFocusDuring": "過程中：{{transition}}",
"shieldDevFocusEnd": "結束：{{state}}",
"shieldDevFocusStateFocused": "瀏覽器在前景",
"shieldDevFocusStateUnfocused": "瀏覽器在背景",
"shieldDevFocusStateUnknown": "無法判斷",
"shieldDevFocusTransitionRemainedFocused": "瀏覽器始終在前景",
"shieldDevFocusTransitionRemainedUnfocused": "瀏覽器始終在背景",
"shieldDevFocusTransitionForegrounded": "瀏覽器曾回到前景",
"shieldDevFocusTransitionBackgrounded": "瀏覽器曾進入背景",
"shieldDevFocusTransitionMixed": "瀏覽器曾在前景和背景之間切換",
"shieldDevFocusTransitionUnknown": "無法判斷"
```

Do not use “抢占焦点” or attribute a cause.

- [ ] **Step 5: Run Dev UI and extraction checks**

Run:

```powershell
pnpm run i18n:extract:ci
pnpm vitest run tests/entrypoints/options/ShieldSettings.test.tsx tests/utils/browserFocus.test.ts
```

Expected: PASS for delayed sampling, success/failure display, replacement, cancel/unmount cleanup, and locale extraction.

- [ ] **Step 6: Commit the Dev readout**

```powershell
git add src/features/BasicSettings/components/tabs/Refresh/ProtectionBypassDevTrigger.tsx src/locales/en/settings.json src/locales/es-419/settings.json src/locales/ja/settings.json src/locales/vi/settings.json src/locales/zh-CN/settings.json src/locales/zh-TW/settings.json tests/entrypoints/options/ShieldSettings.test.tsx
git commit -m "feat(devtools): show protection-bypass focus outcome"
```

### Task 7: Extend the bounded daily summary with controlled focus counters

**Files:**
- Modify: `src/services/productAnalytics/contracts.ts`
- Modify: `src/services/productAnalytics/state.ts`
- Modify: `src/services/productAnalytics/shieldBypassSummary.ts`
- Modify: `src/services/productAnalytics/privacy.ts`
- Test: `tests/services/productAnalytics/state.test.ts`
- Test: `tests/services/productAnalytics/shieldBypassSummary.test.ts`
- Test: `tests/services/productAnalytics/privacy.test.ts`

- [ ] **Step 1: Write failing state, payload, and privacy tests**

Add one state normalization/merge case with only controlled values:

```ts
await productAnalyticsState.incrementShieldBypassSummary({
  focusStartCounts: { unfocused: 1 },
  focusEndCounts: { focused: 1 },
  focusTransitionCounts: { foregrounded: 1 },
  focusBackgroundStartAdapterCounts: { composite: 1 },
  focusForegroundActivationAdapterCounts: { composite: 1 },
  focusUnknownAdapterCounts: { tab: 1 },
})
```

Assert the emitted `shield_bypass_summary_captured` event contains exactly these fixed scalar properties when nonzero:

```ts
expect(properties).toMatchObject({
  protection_bypass_focus_start_unfocused_count: 1,
  protection_bypass_focus_end_focused_count: 1,
  protection_bypass_focus_transition_foregrounded_count: 1,
  protection_bypass_focus_background_start_adapter_composite_count: 1,
  protection_bypass_focus_foreground_activation_adapter_composite_count: 1,
  protection_bypass_focus_unknown_adapter_tab_count: 1,
})
```

Add privacy assertions that an unlisted `protection_bypass_focus_window_id` property and nonnumeric counter values are removed.

- [ ] **Step 2: Run analytics tests and verify missing fields fail**

Run:

```powershell
pnpm vitest run tests/services/productAnalytics/state.test.ts tests/services/productAnalytics/shieldBypassSummary.test.ts tests/services/productAnalytics/privacy.test.ts
```

Expected: FAIL because focus dimensions and fixed properties are not typed, normalized, emitted, or allowed.

- [ ] **Step 3: Add controlled dimensions and state fields**

In `PRODUCT_ANALYTICS_PROTECTION_BYPASS_DIMENSIONS`, add:

```ts
focusStartCounts: [...Object.values(BROWSER_FOCUS_STATES)],
focusEndCounts: [...Object.values(BROWSER_FOCUS_STATES)],
focusTransitionCounts: [...Object.values(BROWSER_FOCUS_TRANSITIONS)],
focusBackgroundStartAdapterCounts: [...Object.values(TEMP_CONTEXT_MODES), "other"],
focusForegroundActivationAdapterCounts: [...Object.values(TEMP_CONTEXT_MODES), "other"],
focusUnknownAdapterCounts: [...Object.values(TEMP_CONTEXT_MODES), "other"],
```

Also change the existing policy dimension to accept the new controlled
preference value while keeping every focus-by-adapter dimension concrete:

```ts
adapterCounts: [
  ...Object.values(TEMP_CONTEXT_PREFERENCE_MODES),
  "other",
],
```

Add the six corresponding typed optional counters to
`ProductAnalyticsShieldBypassSummaryState`. Add a state test proving
`adapterCounts: { auto: 1 }` survives normalization, while all three focus
adapter maps accept only Tab, Composite, Window, or `other`. The existing
generic dimension normalizer and atomic merge loop must handle the new maps;
do not add a second persistence path.

- [ ] **Step 4: Add the complete fixed scalar catalog**

Append fixed properties for all values:

```ts
"protection_bypass_adapter_auto_count",
"protection_bypass_focus_start_focused_count",
"protection_bypass_focus_start_unfocused_count",
"protection_bypass_focus_start_unknown_count",
"protection_bypass_focus_end_focused_count",
"protection_bypass_focus_end_unfocused_count",
"protection_bypass_focus_end_unknown_count",
"protection_bypass_focus_transition_remained_focused_count",
"protection_bypass_focus_transition_remained_unfocused_count",
"protection_bypass_focus_transition_foregrounded_count",
"protection_bypass_focus_transition_backgrounded_count",
"protection_bypass_focus_transition_mixed_count",
"protection_bypass_focus_transition_unknown_count",
"protection_bypass_focus_background_start_adapter_window_count",
"protection_bypass_focus_background_start_adapter_composite_count",
"protection_bypass_focus_background_start_adapter_tab_count",
"protection_bypass_focus_background_start_adapter_other_count",
"protection_bypass_focus_foreground_activation_adapter_window_count",
"protection_bypass_focus_foreground_activation_adapter_composite_count",
"protection_bypass_focus_foreground_activation_adapter_tab_count",
"protection_bypass_focus_foreground_activation_adapter_other_count",
"protection_bypass_focus_unknown_adapter_window_count",
"protection_bypass_focus_unknown_adapter_composite_count",
"protection_bypass_focus_unknown_adapter_tab_count",
"protection_bypass_focus_unknown_adapter_other_count",
```

Rename `buildPolicyCountProperties` to `buildProtectionBypassCountProperties` and add six exact prefix/map pairs:

```ts
["focus_start", summary.focusStartCounts],
["focus_end", summary.focusEndCounts],
["focus_transition", summary.focusTransitionCounts],
["focus_background_start_adapter", summary.focusBackgroundStartAdapterCounts],
["focus_foreground_activation_adapter", summary.focusForegroundActivationAdapterCounts],
["focus_unknown_adapter", summary.focusUnknownAdapterCounts],
```

Include all six maps in `emptySummary` and `hasSummaryActivity`. Keep privacy allow-list derivation through `PRODUCT_ANALYTICS_PROTECTION_BYPASS_COUNT_PROPERTIES`; no URL, ID, timestamp, raw sequence, error, or free-form cause field is added.

- [ ] **Step 5: Add one public best-effort recording function**

In `shieldBypassSummary.ts`, export:

```ts
export async function recordShieldBypassFocusObservation(params: {
  observation: BrowserFocusObservation
  adapter: TempContextMode
}) {
  const { observation, adapter } = params
  const foregroundActivationObserved =
    observation.start === BROWSER_FOCUS_STATES.Unfocused &&
    (observation.transition === BROWSER_FOCUS_TRANSITIONS.Foregrounded ||
      observation.transition === BROWSER_FOCUS_TRANSITIONS.Mixed ||
      observation.end === BROWSER_FOCUS_STATES.Focused)
  const incomplete =
    observation.start === BROWSER_FOCUS_STATES.Unknown ||
    observation.end === BROWSER_FOCUS_STATES.Unknown ||
    observation.transition === BROWSER_FOCUS_TRANSITIONS.Unknown

  await incrementShieldBypassSummary({
    focusStartCounts: { [observation.start]: 1 },
    focusEndCounts: { [observation.end]: 1 },
    focusTransitionCounts: { [observation.transition]: 1 },
    ...(observation.start === BROWSER_FOCUS_STATES.Unfocused
      ? { focusBackgroundStartAdapterCounts: { [adapter]: 1 } }
      : {}),
    ...(foregroundActivationObserved
      ? { focusForegroundActivationAdapterCounts: { [adapter]: 1 } }
      : {}),
    ...(incomplete
      ? { focusUnknownAdapterCounts: { [adapter]: 1 } }
      : {}),
  })
}
```

Add focused tests showing Unknown start never increments the denominator/numerator, while an Unfocused-to-Focused or Mixed observation increments both concrete-mode counters.

- [ ] **Step 6: Run the analytics contract suite**

Run:

```powershell
pnpm vitest run tests/services/productAnalytics/state.test.ts tests/services/productAnalytics/shieldBypassSummary.test.ts tests/services/productAnalytics/privacy.test.ts tests/services/productAnalytics/settings.test.ts
```

Expected: PASS for normalization, atomic merge, UTC rollover, exact fixed event properties, and privacy filtering.

- [ ] **Step 7: Commit the daily-summary contract**

```powershell
git add src/services/productAnalytics/contracts.ts src/services/productAnalytics/state.ts src/services/productAnalytics/shieldBypassSummary.ts src/services/productAnalytics/privacy.ts tests/services/productAnalytics/state.test.ts tests/services/productAnalytics/shieldBypassSummary.test.ts tests/services/productAnalytics/privacy.test.ts
git commit -m "feat(analytics): summarize protection-bypass focus outcomes"
```

### Task 8: Observe only the actual pool opening/reuse span

**Files:**
- Modify: `src/entrypoints/background/tempWindowPool.ts`
- Modify: `tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts`

- [ ] **Step 1: Write failing bounded-observation integration tests**

Mock `createBrowserFocusObservation` and `recordShieldBypassFocusObservation`. Prove the listener starts after final authorization and ends after the context is attached:

```ts
expect(order).toEqual([
  "focus-snapshot",
  "authorize",
  "observe-start",
  "open-or-reuse",
  "observe-finish",
])
expect(recordShieldBypassFocusObservation).toHaveBeenCalledWith({
  observation: {
    start: "unfocused",
    transition: "foregrounded",
    end: "focused",
  },
  adapter: TEMP_CONTEXT_MODES.Composite,
})
```

Add cases proving a reused Tab reports Tab, a window that rolls back to Tab reports the final Tab, a failed open cancels/finishes the listener but records no observation without a resolved concrete context, and rejected telemetry does not reject the protected task.

- [ ] **Step 2: Run the pool test and verify missing telemetry integration**

Run:

```powershell
pnpm vitest run tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts
```

Expected: FAIL because acquire/open does not create or record a bounded focus observation.

- [ ] **Step 3: Wrap context reuse/creation after authorization**

Immediately after computing `requestedMode`, create the observer using the pre-authorization `focusState`. Wrap only `getReusableContext`, creation, registration, validity checking, and request attachment:

```ts
const focusObservation = createBrowserFocusObservation(focusState)
let acquiredContext: TempContext | null = null
let completedObservation: BrowserFocusObservation | null = null
try {
  acquiredContext = await getReusableContext(origin)
  if (!acquiredContext) {
    acquiredContext = await createTempContextInstance(
      url,
      origin,
      requestId,
      requestedMode,
      suppressMinimize,
      options,
    )
    registerContext(origin, acquiredContext)
  }
  // Keep the existing validity check, attachment, last-used update, and logging.
  return acquiredContext
} finally {
  completedObservation = await focusObservation.finish()
  if (acquiredContext && completedObservation) {
    try {
      void recordShieldBypassFocusObservation({
        observation: completedObservation,
        adapter: acquiredContext.mode,
      }).catch(() => undefined)
    } catch {
      // Product analytics is best effort and cannot change pool behavior.
    }
  }
}
```

Do not include authorization latency, network fetch duration, verification waiting, or cleanup timers in this observer. Do not log the observation, IDs, or a cause. Preserve all existing outcome reporting outside the origin lock.

- [ ] **Step 4: Run pool, focus, and analytics integration tests**

Run:

```powershell
pnpm vitest run tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts tests/utils/browserFocus.test.ts tests/services/productAnalytics/shieldBypassSummary.test.ts
```

Expected: PASS with the bounded ordering, final concrete Adapter, failure cleanup, and best-effort analytics behavior.

- [ ] **Step 5: Commit pool telemetry integration**

```powershell
git add src/entrypoints/background/tempWindowPool.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts
git commit -m "feat(protection-bypass): observe context focus outcomes"
```

### Task 9: Run release-readiness validation and headed browser smoke checks

**Files:**
- Verify task-scoped changes only; no additional production file is expected.

- [ ] **Step 1: Run the complete focused test set**

```powershell
pnpm vitest run tests/utils/browserFocus.test.ts tests/services/userPreferences.test.ts tests/services/configMigration/preferences/preferencesMigration.test.ts tests/entrypoints/background/tempContextModeResolver.test.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts tests/entrypoints/background/protectionBypassCoordinator.test.ts tests/entrypoints/background/protectionBypassCoordinator.defaultValidator.test.ts tests/entrypoints/options/ShieldSettings.test.tsx tests/services/productAnalytics/state.test.ts tests/services/productAnalytics/shieldBypassSummary.test.ts tests/services/productAnalytics/privacy.test.ts tests/services/productAnalytics/settings.test.ts
```

Expected: all listed suites PASS.

- [ ] **Step 2: Run localization and repository gates**

Stage only the files named in Tasks 1-8, then run:

```powershell
pnpm run i18n:extract:ci
pnpm run validate:staged
pnpm run validate:push
```

Expected: extraction makes no unexpected locale changes; staged validation passes; push-equivalent compile and Knip validation pass.

- [ ] **Step 3: Inspect privacy, maintainability, and scope**

Run:

```powershell
git diff --check
git diff --stat HEAD~8..HEAD
git status --short
```

Inspect the task diff and confirm:

- preference intent never enters concrete context lifecycle types;
- focus literals and transition reduction exist only in `browserFocus.ts` and controlled analytics catalogs;
- there is no URL, host, path, ID, timestamp, raw focus sequence, backend error, or free-form cause in focus state or event properties;
- existing fixed modes and private isolation paths remain unchanged;
- settings search still points to `SHIELD_SETTINGS_TARGET_IDS.method`;
- unrelated pre-existing untracked files remain untouched and unstaged.

- [ ] **Step 4: Perform manual headed Chromium and Firefox smoke checks**

Build/run the development extension using `pnpm dev` for Chromium and `pnpm dev:firefox` for Firefox. In each browser:

1. Set Opening method to Automatic.
2. Start a delayed Dev run, move the browser behind another application, and verify the run uses an inactive Tab and the readout reports the observed start/during/end without a cause claim.
3. Repeat while the browser is focused and verify the shared-window path is selected.
4. Run twice while the shared window remains alive and verify it is reused.
5. Compare fixed Tab, Single shared window, and New window each time; each must preserve its previous placement behavior.
6. Where supported, run the private-isolation flow and verify it remains window-backed.
7. Force a Dev request failure and verify focus results remain visible beside the existing error.

Record Chromium and Firefox observations separately. Do not interpret a focus transition as proof that the extension caused it.

- [ ] **Step 5: Commit any gate-generated task-scoped corrections**

If extraction, formatting, or validation changed a task-scoped file, inspect the exact diff, rerun the affected focused test and `pnpm run validate:staged`, then commit only those corrections:

```powershell
git add src/constants/tempContextMode.ts src/utils/browser/browserFocus.ts src/entrypoints/background/tempContextModeResolver.ts src/entrypoints/background/tempWindowPool.ts src/services/preferences/tempWindowFallbackPreferences.ts src/services/preferences/userPreferences.ts src/services/protectionBypass/policy.ts src/features/BasicSettings/components/tabs/Refresh/ShieldSettings.tsx src/features/BasicSettings/components/tabs/Refresh/ProtectionBypassDevTrigger.tsx src/locales/en/settings.json src/locales/es-419/settings.json src/locales/ja/settings.json src/locales/vi/settings.json src/locales/zh-CN/settings.json src/locales/zh-TW/settings.json src/services/productAnalytics/contracts.ts src/services/productAnalytics/state.ts src/services/productAnalytics/shieldBypassSummary.ts src/services/productAnalytics/settings.ts src/services/productAnalytics/privacy.ts tests/utils/browserFocus.test.ts tests/services/userPreferences.test.ts tests/services/configMigration/preferences/preferencesMigration.test.ts tests/entrypoints/background/tempContextModeResolver.test.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts tests/entrypoints/options/ShieldSettings.test.tsx tests/services/productAnalytics/state.test.ts tests/services/productAnalytics/shieldBypassSummary.test.ts tests/services/productAnalytics/privacy.test.ts tests/services/productAnalytics/settings.test.ts
git commit -m "chore(protection-bypass): finalize adaptive focus validation"
```

If no task-scoped correction was generated, do not create an empty commit.

## E2E decision

Do not add Playwright coverage for operating-system focus. The deterministic behavior is covered by Vitest at the browser API, resolver, pool, UI, and telemetry boundaries; headed Chromium and Firefox runs cover the real focus/window-manager risk without treating CI focus behavior as reliable evidence. Existing temporary-context browser tests remain the browser-level regression layer for creation and cleanup.

## Completion evidence

The implementation is ready to hand off only when focused tests, `i18n:extract:ci`, `validate:staged`, and `validate:push` pass; the final diff contains only task files; and the manual Chromium/Firefox observations are reported separately from automated evidence. The handoff must explicitly state the no-migration compatibility result, the best-effort/tri-state accuracy limit, the daily-summary telemetry decision, the no-Playwright-focus decision, and any browser smoke check that could not be completed.
