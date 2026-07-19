# Temp Window Source Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve toolbar-popup-originated temporary-window work across background boundaries while allowing options, side-panel, and background work to minimize normally.

**Architecture:** Introduce a transient `TempWindowRequestSource` contract plus one centralized launch-policy resolver. Capture source before delegation, propagate it through API transport and auto-checkin orchestration, and resolve the existing low-level `suppressMinimize` boolean only at the temporary-window boundary. Keep explicit open-window commands as intentional overrides and do not add popup liveness monitoring.

**Tech Stack:** TypeScript, React, WXT Manifest V3 runtime messaging, WebExtension windows/tabs APIs, Vitest, Testing Library.

---

## File Structure

- `src/types/tempWindowFetch.ts`: owns runtime source constants/types and temporary-window request contracts.
- `src/utils/browser/tempWindowRequestSource.ts`: owns source detection, runtime normalization, launch-policy resolution, and Firefox popup safety classification.
- `src/utils/browser/index.ts`: exposes options-page detection alongside existing popup/side-panel/background detection.
- `src/utils/browser/tempWindowFetch.ts`: applies the centralized policy to fetch, Turnstile, native page action, rendered-title, and generic fallback requests.
- `src/entrypoints/background/runtimeMessages.ts` and `src/entrypoints/background/tempWindowPool.ts`: normalize untrusted runtime payloads and apply the policy again at direct handler boundaries.
- `src/services/apiTransport/type.ts` and `src/services/apiTransport/request.ts`: carry transient source metadata through generic API fallback.
- `src/services/siteDetection/autoDetectService.ts`, `src/services/accountBrowserSession/**`, and `src/entrypoints/background/tempWindowPool.ts`: migrate auto-detect/session flows and validate background message sources.
- `src/services/checkin/autoCheckin/**` plus UI callers: propagate source through UI-open/manual runs, scheduler, and providers.
- `src/services/accounts/accountStorage.ts`: preserve the source during post-checkin account refresh.
- `tests/**`: prove source resolution and each real propagation seam without relying on toolbar-popup E2E emulation.

### Task 1: Add the Source Contract and Central Launch Policy

**Files:**
- Modify: `src/types/tempWindowFetch.ts`
- Modify: `src/utils/browser/index.ts`
- Create: `src/utils/browser/tempWindowRequestSource.ts`
- Modify: `tests/utils/browser.test.ts`
- Create: `tests/utils/tempWindowRequestSource.test.ts`

- [ ] **Step 1: Write failing browser-surface and policy tests**

Add an options-page detection case to `tests/utils/browser.test.ts`, and create `tests/utils/tempWindowRequestSource.test.ts` with the complete behavior matrix:

```ts
const context = vi.hoisted(() => ({
  popup: false,
  options: false,
  sidepanel: false,
  background: false,
  firefox: false,
}))

vi.mock("~/utils/browser/index", () => ({
  isExtensionPopup: () => context.popup,
  isExtensionOptions: () => context.options,
  isExtensionSidePanel: () => context.sidepanel,
  isExtensionBackground: () => context.background,
}))

vi.mock("~/utils/browser/protectionBypass", () => ({
  isProtectionBypassFirefoxEnv: () => context.firefox,
}))

describe("tempWindowRequestSource", () => {
  it.each([
    ["popup", "popup", true],
    ["options", "options", false],
    ["sidepanel", "sidepanel", false],
    ["background", "background", false],
  ])("resolves %s source", (_label, tempWindowRequestSource, suppressMinimize) => {
    expect(
      resolveTempWindowRequestPolicy({ tempWindowRequestSource }),
    ).toMatchObject({
      tempWindowRequestSource,
      suppressMinimize,
      blockedReason: null,
    })
  })

  it("lets explicit booleans override source minimization", () => {
    expect(
      resolveTempWindowRequestPolicy({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        suppressMinimize: false,
      }).suppressMinimize,
    ).toBe(false)
    expect(
      resolveTempWindowRequestPolicy({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        suppressMinimize: true,
      }).suppressMinimize,
    ).toBe(true)
  })

  it("normalizes invalid runtime values to background", () => {
    expect(normalizeTempWindowRequestSource("unknown")).toBe(
      TEMP_WINDOW_REQUEST_SOURCES.Background,
    )
  })

  it("captures the current surface only when source is omitted", () => {
    context.popup = true
    expect(resolveTempWindowRequestPolicy({}).tempWindowRequestSource).toBe(
      TEMP_WINDOW_REQUEST_SOURCES.Popup,
    )
    expect(
      resolveTempWindowRequestPolicy({ tempWindowRequestSource: "unknown" })
        .tempWindowRequestSource,
    ).toBe(
      TEMP_WINDOW_REQUEST_SOURCES.Background,
    )
  })

  it("blocks Firefox popup-source temporary windows", () => {
    context.firefox = true
    expect(
      resolveTempWindowRequestPolicy({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      }).blockedReason,
    ).toBe("firefox_popup_unsupported")
  })
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
pnpm vitest run tests/utils/browser.test.ts tests/utils/tempWindowRequestSource.test.ts
```

Expected: FAIL because `isExtensionOptions`, `TEMP_WINDOW_REQUEST_SOURCES`, and the request-policy helpers do not exist.

- [ ] **Step 3: Add the source constants, type guard, and options detection**

In `src/types/tempWindowFetch.ts` add:

```ts
export const TEMP_WINDOW_REQUEST_SOURCES = {
  Popup: "popup",
  Options: "options",
  Sidepanel: "sidepanel",
  Background: "background",
} as const

export type TempWindowRequestSource =
  (typeof TEMP_WINDOW_REQUEST_SOURCES)[keyof typeof TEMP_WINDOW_REQUEST_SOURCES]

export function isTempWindowRequestSource(
  value: unknown,
): value is TempWindowRequestSource {
  return Object.values(TEMP_WINDOW_REQUEST_SOURCES).includes(
    value as TempWindowRequestSource,
  )
}
```

In `src/utils/browser/index.ts`, add `isExtensionOptions()` using the same safe URL parsing as `isExtensionPopup()` and `OPTIONS_PAGE_PATH`.

- [ ] **Step 4: Implement the centralized policy**

Create `src/utils/browser/tempWindowRequestSource.ts`:

```ts
import {
  isTempWindowRequestSource,
  TEMP_WINDOW_REQUEST_SOURCES,
  type TempWindowRequestSource,
} from "~/types/tempWindowFetch"
import {
  isExtensionBackground,
  isExtensionOptions,
  isExtensionPopup,
  isExtensionSidePanel,
} from "~/utils/browser/index"
import { isProtectionBypassFirefoxEnv } from "~/utils/browser/protectionBypass"

export type TempWindowRequestBlockedReason =
  | "firefox_popup_unsupported"
  | null

export function normalizeTempWindowRequestSource(
  value: unknown,
): TempWindowRequestSource {
  return isTempWindowRequestSource(value)
    ? value
    : TEMP_WINDOW_REQUEST_SOURCES.Background
}

export function getCurrentTempWindowRequestSource(): TempWindowRequestSource {
  if (isExtensionPopup()) return TEMP_WINDOW_REQUEST_SOURCES.Popup
  if (isExtensionOptions()) return TEMP_WINDOW_REQUEST_SOURCES.Options
  if (isExtensionSidePanel()) return TEMP_WINDOW_REQUEST_SOURCES.Sidepanel
  if (isExtensionBackground()) return TEMP_WINDOW_REQUEST_SOURCES.Background
  return TEMP_WINDOW_REQUEST_SOURCES.Background
}

export function resolveTempWindowRequestPolicy(params: {
  tempWindowRequestSource?: unknown
  suppressMinimize?: unknown
}) {
  const tempWindowRequestSource =
    params.tempWindowRequestSource === undefined
      ? getCurrentTempWindowRequestSource()
      : normalizeTempWindowRequestSource(params.tempWindowRequestSource)
  return {
    tempWindowRequestSource,
    suppressMinimize:
      typeof params.suppressMinimize === "boolean"
        ? params.suppressMinimize
        : tempWindowRequestSource === TEMP_WINDOW_REQUEST_SOURCES.Popup,
    blockedReason:
      tempWindowRequestSource === TEMP_WINDOW_REQUEST_SOURCES.Popup &&
      isProtectionBypassFirefoxEnv()
        ? ("firefox_popup_unsupported" as const)
        : null,
  }
}
```

- [ ] **Step 5: Run tests and verify GREEN**

Run the Step 2 command. Expected: both files PASS with no warnings.

- [ ] **Step 6: Commit the policy slice**

```bash
git add src/types/tempWindowFetch.ts src/utils/browser/index.ts src/utils/browser/tempWindowRequestSource.ts tests/utils/browser.test.ts tests/utils/tempWindowRequestSource.test.ts
git commit -m "refactor(temp-window): centralize request source policy"
```

### Task 2: Apply Source Policy to Temporary-Window Wrappers and API Transport

**Files:**
- Modify: `src/types/tempWindowFetch.ts`
- Modify: `src/services/apiTransport/type.ts`
- Modify: `src/services/apiTransport/request.ts`
- Modify: `src/utils/browser/tempWindowFetch.ts`
- Modify: `src/entrypoints/background/runtimeMessages.ts`
- Modify: `src/entrypoints/background/tempWindowPool.ts`
- Modify: `tests/utils/tempWindowFetch.background.test.ts`
- Modify: `tests/utils/tempWindowFetch.fallback.test.ts`
- Modify: `tests/services/apiTransport/request.test.ts`
- Modify: `tests/entrypoints/background/runtimeMessages.more.test.ts`
- Modify: `tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts`
- Modify: `tests/entrypoints/background/tempWindowPoolOpenClose.test.ts`

- [ ] **Step 1: Write failing wrapper and fallback tests**

Extend the wrapper tests to prove all four helpers resolve the same source policy and include the resolved source in their background/runtime payloads:

```ts
it("uses popup source for fetch and rendered-title requests", async () => {
  mocks.isExtensionPopupMock.mockReturnValue(true)
  await tempWindowFetch({
    originUrl: "https://example.invalid",
    fetchUrl: "https://example.invalid/api/user/self",
  })
  await tempWindowGetRenderedTitle({
    originUrl: "https://example.invalid",
  })

  expect(mocks.sendRuntimeMessageMock).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      suppressMinimize: true,
    }),
  )
  expect(mocks.sendRuntimeMessageMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      suppressMinimize: true,
    }),
  )
})

it("keeps explicit false over a popup source", async () => {
  await tempWindowTurnstileFetch({
    originUrl: "https://example.invalid",
    pageUrl: "https://example.invalid/console",
    fetchUrl: "https://example.invalid/api/user/checkin",
    tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
    suppressMinimize: false,
  })
  expect(mocks.sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      suppressMinimize: false,
    }),
  )
})
```

Add a generic fallback case proving background source is no longer forced to `true`, and a popup-source API request remains protected:

```ts
expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
  expect.objectContaining({
    action: RuntimeActionIds.TempWindowFetch,
    tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
    suppressMinimize: false,
  }),
)
```

Add Firefox popup-source cases for fetch, Turnstile, page action, and rendered title that expect a structured failure and no runtime/background dispatch.

- [ ] **Step 2: Run the tests and verify RED**

```bash
pnpm vitest run tests/utils/tempWindowFetch.background.test.ts tests/utils/tempWindowFetch.fallback.test.ts tests/services/apiTransport/request.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts tests/entrypoints/background/tempWindowPoolOpenClose.test.ts
```

Expected: FAIL because request contracts do not carry `tempWindowRequestSource`, rendered-title still has a separate default, runtime handlers do not normalize the source, and generic fallback still forces suppression.

- [ ] **Step 3: Extend request contracts and transport metadata**

Add `tempWindowRequestSource?: TempWindowRequestSource` to `TempWindowFetchParams`, `TempWindowCheckinPageActionParams`, a new exported `TempWindowRenderedTitleParams`, and `TempWindowFallbackContext`. Add the same transient metadata to `ApiTransportRequest`:

```ts
/** Originating extension surface for temporary-window presentation policy. */
tempWindowRequestSource?: TempWindowRequestSource
```

In `_fetchApi`, copy `request.tempWindowRequestSource` into `TempWindowFallbackContext`.

- [ ] **Step 4: Route all wrappers through one policy resolver**

Replace each `params.suppressMinimize ?? isExtensionPopup()` branch with:

```ts
const policy = resolveTempWindowRequestPolicy({
  tempWindowRequestSource: params.tempWindowRequestSource,
  suppressMinimize: params.suppressMinimize,
})
const payload = {
  ...params,
  tempWindowRequestSource: policy.tempWindowRequestSource,
  suppressMinimize: policy.suppressMinimize,
}
```

If `policy.blockedReason === "firefox_popup_unsupported"`, do not dispatch. Use one internal error constant and return each helper's existing result contract: fetch/title `{ success: false, error }`; Turnstile `{ success: false, error, turnstile: { status: "error", hasTurnstile: false } }`; page action `{ success: false, reason: "trigger_failed", error }`.

Update `getTempWindowFallbackBlockStatus` to accept `tempWindowRequestSource?: unknown`. When present, derive popup/options/side-panel/background preference flags from the original source; when absent, retain its existing surface arguments for reminder UI and compatibility tests. The Firefox popup guard must prefer the original source even when execution is now in the background worker.

- [ ] **Step 5: Normalize runtime messages and direct pool calls**

For `AutoDetectSite`, `TempWindowFetch`, `TempWindowTurnstileFetch`, `TempWindowCheckinPageAction`, and `TempWindowGetRenderedTitle`, normalize missing or invalid runtime values to `Background` before dispatch. Preserve a valid source and preserve only actual boolean overrides (`typeof suppressMinimize === "boolean"`).

Resolve the same policy again in the five corresponding `tempWindowPool` handlers so direct callers cannot bypass it; keep only the resolved boolean below `acquireTempContext`. Add parameterized runtime tests for valid popup, missing/invalid source, and explicit true/false overrides. Add pool tests proving popup skips minimization, background minimizes, and a reused pooled context is not state-mutated again.

Do not route `OpenTempWindow` through this normalizer. Its composite path is an explicit visible-window command and must retain the existing fixed `suppressMinimize: true`; lock this contract with a `windows.update(... minimized)` negative assertion.

- [ ] **Step 6: Remove the unconditional generic fallback override**

Change `fetchViaTempWindow` from fixed `suppressMinimize: true` to source propagation:

```ts
const payload: TempWindowFetchParams = {
  originUrl: context.baseUrl,
  fetchUrl: context.url,
  fetchOptions,
  requestId,
  responseType,
  tempWindowRequestSource: context.tempWindowRequestSource,
  accountId: context.accountId,
  authType: context.authType,
  cookieAuthSessionCookie: context.cookieAuthSessionCookie,
  useIncognito: context.useIncognito,
  cookieStoreId: context.cookieStoreId,
}
```

The wrapper now captures a direct popup caller or resolves an explicit propagated source; background fallback resolves false.

- [ ] **Step 7: Run tests and verify GREEN**

Run the Step 2 command. Expected: all three files PASS.

- [ ] **Step 8: Commit the transport slice**

```bash
git add src/types/tempWindowFetch.ts src/services/apiTransport/type.ts src/services/apiTransport/request.ts src/utils/browser/tempWindowFetch.ts src/entrypoints/background/runtimeMessages.ts src/entrypoints/background/tempWindowPool.ts tests/utils/tempWindowFetch.background.test.ts tests/utils/tempWindowFetch.fallback.test.ts tests/services/apiTransport/request.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts tests/entrypoints/background/tempWindowPoolOpenClose.test.ts
git commit -m "fix(temp-window): propagate source through fallbacks"
```

### Task 3: Migrate Auto-Detect and Browser-Session Requests

**Files:**
- Modify: `src/services/siteDetection/autoDetectService.ts`
- Modify: `src/services/accountBrowserSession/types.ts`
- Modify: `src/services/accountBrowserSession/sessionReader.ts`
- Modify: `src/services/apiService/sub2api/tokenResync.ts`
- Modify: `src/services/apiService/sub2api/index.ts`
- Modify: `src/services/apiService/voapiV2/tokenResync.ts`
- Modify: `src/services/apiService/voapiV2/index.ts`
- Modify: `tests/services/autoDetectService.test.ts`
- Modify: `tests/services/accountBrowserSession/sessionReader.test.ts`
- Modify: `tests/services/apiService/sub2api/tokenResync.test.ts`
- Modify: `tests/services/apiService/sub2api/index.test.ts`
- Modify: `tests/services/apiService/voapiV2/tokenResync.test.ts`
- Modify: `tests/services/apiService/voapiV2/index.test.ts`

- [ ] **Step 1: Write failing source-propagation tests**

Update the popup auto-detect expectation from a bare boolean to the semantic source:

```ts
expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
  expect.objectContaining({
    action: RuntimeActionIds.AutoDetectSite,
    tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
  }),
)
```

Add session-reader coverage:

```ts
await resolveAccountBrowserSession({
  baseUrl: "https://example.invalid",
  siteType: SITE_TYPES.SUB2API,
  useTempWindow: true,
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
})
expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
  expect.objectContaining({
    tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
  }),
)
```

Add a fallback case proving a popup auto-detect request keeps the same source when the background temp-context attempt fails and execution falls back to `getUserDataViaAPI`.

- [ ] **Step 2: Run tests and verify RED**

```bash
pnpm vitest run tests/services/autoDetectService.test.ts tests/services/accountBrowserSession/sessionReader.test.ts tests/services/apiService/sub2api/tokenResync.test.ts tests/services/apiService/sub2api/index.test.ts tests/services/apiService/voapiV2/tokenResync.test.ts tests/services/apiService/voapiV2/index.test.ts -t "source|minimize|temp-window|resync"
```

Expected: FAIL because auto-detect/session and nested token-resync requests do not carry source.

- [ ] **Step 3: Capture and send semantic source**

In `autoDetectService`, replace popup-only boolean construction with:

```ts
tempWindowRequestSource: getCurrentTempWindowRequestSource(),
```

Capture once in `getUserDataViaBackground`, forward the same value to the runtime request and to `getUserDataViaAPI` after background failure, and include it in `accountBootstrap.fetchUserInfo()` requests so their own API fallback does not lose context.

Add `tempWindowRequestSource?: TempWindowRequestSource` to `ResolveAccountBrowserSessionOptions`; preserve the existing low-level `suppressMinimize?: boolean` override for compatibility. Send both fields when present.

- [ ] **Step 4: Preserve source in nested token-resync sessions**

Thread `request.tempWindowRequestSource` from the Sub2API and VoAPI v2 adapter entrypoints into their token-resync helpers, then into `resolveAccountBrowserSession`. Test both the adapter-to-resync argument and the session-reader options. Keep the field optional so existing non-temporary requests remain unchanged.

- [ ] **Step 5: Run tests and verify GREEN**

Run the Step 2 command without `-t` after the focused assertions pass. Expected: all three files PASS.

- [ ] **Step 6: Commit the auto-detect/session slice**

```bash
git add src/services/siteDetection/autoDetectService.ts src/services/accountBrowserSession/types.ts src/services/accountBrowserSession/sessionReader.ts src/services/apiService/sub2api/tokenResync.ts src/services/apiService/sub2api/index.ts src/services/apiService/voapiV2/tokenResync.ts src/services/apiService/voapiV2/index.ts tests/services/autoDetectService.test.ts tests/services/accountBrowserSession/sessionReader.test.ts tests/services/apiService/sub2api/tokenResync.test.ts tests/services/apiService/sub2api/index.test.ts tests/services/apiService/voapiV2/tokenResync.test.ts tests/services/apiService/voapiV2/index.test.ts
git commit -m "refactor(autodetect): use temp window source context"
```

### Task 4: Propagate Source Through Auto-Checkin UI, Scheduler, and Providers

**Files:**
- Modify: `src/services/checkin/autoCheckin/messaging.ts`
- Modify: `src/hooks/useAutoCheckinUiOpenPretrigger.ts`
- Modify: `src/features/AutoCheckin/AutoCheckin.tsx`
- Modify: `src/features/AccountManagement/components/AccountActionButtons/index.tsx`
- Modify: `src/services/checkin/autoCheckin/providers/index.ts`
- Modify: `src/services/checkin/autoCheckin/providers/newApi.ts`
- Modify: `src/services/checkin/autoCheckin/providers/anyrouter.ts`
- Modify: `src/services/checkin/autoCheckin/providers/veloera.ts`
- Modify: `src/services/checkin/autoCheckin/providers/wong.ts`
- Modify: `src/services/checkin/autoCheckin/providers/voapiV2.ts`
- Modify: `src/services/checkin/autoCheckin/scheduler.ts`
- Modify: `tests/components/AutoCheckinUiOpenPretrigger.test.tsx`
- Modify: `tests/entrypoints/options/AutoCheckinQuickRun.test.tsx`
- Modify: `tests/features/AccountManagement/components/AccountActionButtons.test.tsx`
- Modify: `tests/services/autoCheckin/scheduler.test.ts`
- Modify: `tests/services/autoCheckin/providers/newApi.test.ts`
- Modify: `tests/services/autoCheckin/providers/anyrouter.test.ts`
- Modify: `tests/services/autoCheckin/providers/veloera.test.ts`
- Modify: `tests/services/autoCheckin/providers/wong.test.ts`
- Modify: `tests/services/autoCheckin/providers/voapiV2.test.ts`

- [ ] **Step 1: Write failing UI and scheduler propagation tests**

Update UI-open pretrigger to require source in its typed message:

```ts
expect(sendRuntimeMessageSpy).toHaveBeenCalledWith(
  AutoCheckinMessageTypes.PretriggerDailyOnUiOpen,
  expect.objectContaining({
    requestId: expect.any(String),
    tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
  }),
)
```

Add equivalent source expectations to manual `RunNow` callers. In scheduler tests, assert the provider receives a second context argument:

```ts
expect(provider.checkIn).toHaveBeenCalledWith(
  expect.objectContaining({ id: "account-1" }),
  {
    tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
  },
)
```

Add an alarm test asserting omitted source becomes `Background`, and a retry test asserting later retry alarms do not reuse an earlier popup source.

- [ ] **Step 2: Write failing New API provider tests**

Exercise both temporary paths with a popup context:

```ts
await newApiProvider.checkIn(mockAccount, {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
})
expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledWith(
  expect.objectContaining({
    tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
  }),
)
expect(tempWindowTurnstileFetch).toHaveBeenCalledWith(
  expect.objectContaining({
    tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
  }),
)
```

Also assert the initial API request, `checked_in_today` polling, and incognito Turnstile retry preserve the same source. In the AnyRouter, Veloera, Wong, and VoAPI v2 provider tests, pass popup context and assert each API request carries it; for VoAPI v2, assert the expired-auth resync and the retried request also retain it.

- [ ] **Step 3: Run tests and verify RED**

```bash
pnpm vitest run tests/components/AutoCheckinUiOpenPretrigger.test.tsx tests/entrypoints/options/AutoCheckinQuickRun.test.tsx tests/features/AccountManagement/components/AccountActionButtons.test.tsx tests/services/autoCheckin/scheduler.test.ts tests/services/autoCheckin/providers/newApi.test.ts tests/services/autoCheckin/providers/anyrouter.test.ts tests/services/autoCheckin/providers/veloera.test.ts tests/services/autoCheckin/providers/wong.test.ts tests/services/autoCheckin/providers/voapiV2.test.ts -t "source|pretrigger|Turnstile|native page|retry"
```

Expected: FAIL because messages, provider contracts, and scheduler run options do not carry source.

- [ ] **Step 4: Extend the typed auto-checkin contracts**

Add optional transient source to `AutoCheckinRunNowRequest` and `AutoCheckinPretriggerDailyOnUiOpenRequest`:

```ts
tempWindowRequestSource?: TempWindowRequestSource
```

Add a provider context without changing provider results:

```ts
export interface AutoCheckinProviderContext {
  tempWindowRequestSource: TempWindowRequestSource
}

checkIn(
  account: SiteAccount | AnyrouterCheckInParams,
  context?: AutoCheckinProviderContext,
): Promise<AutoCheckinProviderResult>
```

Existing providers may ignore the optional second argument.

- [ ] **Step 5: Capture source in UI callers**

Use `getCurrentTempWindowRequestSource()` immediately before sending `RunNow` or UI-open pretrigger messages. Do not persist it in preferences or status.

- [ ] **Step 6: Carry source through scheduler execution**

Normalize source at the background message boundary, then add it to `pretriggerDailyOnUiOpen`, `handleDailyAlarm`, `runCheckins`, `runAccountCheckinsInBatches`, and `runAccountCheckin` options. Default alarm/debug/retry calls to `TEMP_WINDOW_REQUEST_SOURCES.Background`.

Provider invocation becomes:

```ts
await provider.checkIn(account, {
  tempWindowRequestSource,
})
```

Do not write the source into `AutoCheckinStatus` or retry state.

- [ ] **Step 7: Carry source through every provider request and New API temporary attempt**

At each provider entry, normalize the optional context once to `Background`, then add the required value to every `ApiTransportRequest`. For New API, also add it to native page action params, `checked_in_today` polling, normal Turnstile params, preferred-incognito attempts, and fallback incognito attempts. For VoAPI v2, pass it to token resync and the retried request. Do not recompute source inside retry branches.

- [ ] **Step 8: Run tests and verify GREEN**

Run the Step 3 command without `-t`. Expected: all five files PASS.

- [ ] **Step 9: Commit the auto-checkin execution slice**

```bash
git add src/services/checkin/autoCheckin/messaging.ts src/hooks/useAutoCheckinUiOpenPretrigger.ts src/features/AutoCheckin/AutoCheckin.tsx src/features/AccountManagement/components/AccountActionButtons/index.tsx src/services/checkin/autoCheckin/providers/index.ts src/services/checkin/autoCheckin/providers/newApi.ts src/services/checkin/autoCheckin/providers/anyrouter.ts src/services/checkin/autoCheckin/providers/veloera.ts src/services/checkin/autoCheckin/providers/wong.ts src/services/checkin/autoCheckin/providers/voapiV2.ts src/services/checkin/autoCheckin/scheduler.ts tests/components/AutoCheckinUiOpenPretrigger.test.tsx tests/entrypoints/options/AutoCheckinQuickRun.test.tsx tests/features/AccountManagement/components/AccountActionButtons.test.tsx tests/services/autoCheckin/scheduler.test.ts tests/services/autoCheckin/providers/newApi.test.ts tests/services/autoCheckin/providers/anyrouter.test.ts tests/services/autoCheckin/providers/veloera.test.ts tests/services/autoCheckin/providers/wong.test.ts tests/services/autoCheckin/providers/voapiV2.test.ts
git commit -m "fix(auto-checkin): preserve temp window source"
```

### Task 5: Preserve Source Through Post-Checkin Account Refresh

**Files:**
- Modify: `src/services/accounts/accountStorage.ts`
- Modify: `src/services/checkin/autoCheckin/scheduler.ts`
- Modify: `tests/services/accountStorage.test.ts`
- Modify: `tests/services/autoCheckin/scheduler.test.ts`
- Modify: `tests/services/apiTransport/request.test.ts`

- [ ] **Step 1: Write the failing account-storage propagation test**

Add an account refresh case that supplies popup source and asserts both support detection and refresh receive it:

```ts
await accountStorage.refreshAccount("temp-window", true, {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
})

expect(mockFetchCheckInSupport).toHaveBeenCalledWith(
  expect.objectContaining({
    tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
  }),
)
expect(mockRefreshAccountData).toHaveBeenCalledWith(
  expect.objectContaining({
    tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
  }),
)
```

Add a transport assertion proving this metadata reaches `TempWindowFallbackContext` and resolves to `suppressMinimize: true` in the final runtime payload.

- [ ] **Step 2: Write the failing scheduler post-refresh test**

Extend `refreshAccountsAfterSuccessfulCheckins` coverage:

```ts
await (autoCheckinScheduler as any).refreshAccountsAfterSuccessfulCheckins({
  accountIds: ["account-1"],
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
})

expect(mockedAccountStorage.refreshAccount).toHaveBeenCalledWith(
  "account-1",
  true,
  {
    tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
  },
)
```

- [ ] **Step 3: Run tests and verify RED**

```bash
pnpm vitest run tests/services/accountStorage.test.ts tests/services/autoCheckin/scheduler.test.ts tests/services/apiTransport/request.test.ts -t "temp window source|post-checkin refresh|fallback"
```

Expected: FAIL because `RefreshAccountOptions` and account API requests drop source metadata.

- [ ] **Step 4: Propagate source through the real refresh chain**

Add `tempWindowRequestSource?: TempWindowRequestSource` to `RefreshAccountOptions`. Include it in the request objects passed to `fetchCheckInSupport` and `refreshAccount`. Extend `refreshAccountsAfterSuccessfulCheckins` to accept and pass the same source, and pass the run source from both normal and retry/manual success paths.

Do not add source to persisted account data, storage migrations, or balance-history records.

- [ ] **Step 5: Run tests and verify GREEN**

Run the Step 3 command without `-t`. Expected: all three files PASS.

- [ ] **Step 6: Commit the post-refresh slice**

```bash
git add src/services/accounts/accountStorage.ts src/services/checkin/autoCheckin/scheduler.ts tests/services/accountStorage.test.ts tests/services/autoCheckin/scheduler.test.ts tests/services/apiTransport/request.test.ts
git commit -m "fix(accounts): preserve temp window source on refresh"
```

### Task 6: Integration, Maintainability, and Release Gates

**Files:**
- Verify: all files touched in Tasks 1-5
- Verify existing behavior: `src/entrypoints/background/tempWindowPool.ts`
- Verify existing tests: `tests/entrypoints/background/tempWindowPoolOpenClose.test.ts`

- [ ] **Step 1: Run the complete focused regression set**

```bash
pnpm vitest run tests/utils/browser.test.ts tests/utils/tempWindowRequestSource.test.ts tests/utils/tempWindowFetch.background.test.ts tests/utils/tempWindowFetch.fallback.test.ts tests/services/apiTransport/request.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts tests/entrypoints/background/tempWindowPoolOpenClose.test.ts tests/services/autoDetectService.test.ts tests/services/accountBrowserSession/sessionReader.test.ts tests/services/apiService/sub2api/tokenResync.test.ts tests/services/apiService/sub2api/index.test.ts tests/services/apiService/voapiV2/tokenResync.test.ts tests/services/apiService/voapiV2/index.test.ts tests/components/AutoCheckinUiOpenPretrigger.test.tsx tests/entrypoints/options/AutoCheckinQuickRun.test.tsx tests/features/AccountManagement/components/AccountActionButtons.test.tsx tests/services/autoCheckin/scheduler.test.ts tests/services/autoCheckin/providers/newApi.test.ts tests/services/autoCheckin/providers/anyrouter.test.ts tests/services/autoCheckin/providers/veloera.test.ts tests/services/autoCheckin/providers/wong.test.ts tests/services/autoCheckin/providers/voapiV2.test.ts tests/services/accountStorage.test.ts
```

Expected: PASS with no unhandled rejections or warnings.

- [ ] **Step 2: Inspect the source-policy surface for duplicate rules**

```bash
rg -n "suppressMinimize|isExtensionPopup\(\)" src/types/tempWindowFetch.ts src/utils/browser src/services/apiTransport src/services/siteDetection src/services/accountBrowserSession src/services/checkin/autoCheckin src/services/accounts/accountStorage.ts src/entrypoints/background/tempWindowPool.ts
```

Expected:

- ordinary fallback callers use source context rather than duplicating `tempWindowRequestSource === "popup"`;
- no unconditional generic `suppressMinimize: true` remains;
- the explicit `OpenTempWindow` visible-window override remains;
- no popup liveness Port, polling, or storage state was added.

- [ ] **Step 3: Run shared TypeScript and dependency gates**

```bash
pnpm compile
pnpm run validate:push
```

Expected: PASS; `validate:push` completes both compile and knip successfully.

- [ ] **Step 4: Run the commit-equivalent staged gate on any final cleanup**

If Task 6 requires cleanup, stage only those task-scoped files and run:

```bash
pnpm run validate:staged
```

Expected: PASS. If no cleanup was needed, do not create a no-op commit.

- [ ] **Step 5: Inspect final history and worktree**

```bash
git status --short
git log --oneline -6
git diff 45bdea78a..HEAD --stat
```

Expected: clean worktree; only source-context implementation/test files changed after the design commit; commits remain task-scoped.

- [ ] **Step 6: Record the E2E and telemetry decisions in the handoff**

State explicitly:

- no new Playwright E2E was added because the current harness opens `popup.html` as a normal page and cannot reproduce toolbar-popup auto-hide;
- focused runtime-message, wrapper, scheduler, and pool tests cover the controllable contract;
- telemetry remains `none` because this is an internal correctness fix without a new user action or setting;
- no dynamic popup monitoring was introduced.
