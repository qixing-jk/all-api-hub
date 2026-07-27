# Temp Window Source Context Design

Date: 2026-07-16

## Purpose

Preserve the toolbar popup when a popup-originated task opens a temporary
browser context, without leaving background, options-page, or side-panel
temporary windows unnecessarily unminimized.

The current behavior is inconsistent. Some helpers infer popup state in the
context where they execute, which fails after work has crossed into the
background service worker. The generic API fallback also hard-codes
`suppressMinimize: true`, so background work does not follow the historical
"minimize unless a popup needs protection" policy.

## Decision

Carry an immutable source context with the task. Do not add live popup
monitoring, polling, storage-backed liveness, or a runtime Port in this slice.

The source context is captured when the task starts and remains valid even if
the toolbar popup closes before the background work finishes. This avoids a
check-then-act race between probing popup liveness and creating or minimizing a
temporary window.

## Historical Contract

The established behavior from popup-launched auto-detect is:

- toolbar popup source: do not minimize the temporary window;
- options page, side panel, and background source: minimize the temporary
  window to reduce disruption;
- explicit user action whose purpose is to open a temporary window: keep that
  window visible.

`focused: false` remains unchanged. `suppressMinimize` controls the subsequent
best-effort `windows.update(..., { state: "minimized" })`; it is not a focus
request and only matters when a new window-backed context is created.

## Goals

- Preserve popup origin across runtime-message and scheduler boundaries.
- Apply one source-to-minimization policy to generic API fallback,
  Turnstile-assisted requests, native-page auto-checkin, and post-checkin
  account refresh.
- Remove the generic fallback's unconditional `suppressMinimize: true`.
- Evaluate the existing Firefox popup safety rule from the task source rather
  than the background worker's execution location.
- Keep background alarms, retries, periodic refresh, options, and side-panel
  work quiet by default.
- Keep explicit open-window behavior unchanged.
- Centralize the policy so business callers do not duplicate boolean rules.

## Non-Goals

- Do not dynamically monitor whether a popup is still open.
- Do not add a popup/background Port or service-worker keepalive mechanism.
- Do not change temporary-context pooling, cleanup timing, focus flags, window
  dimensions, or window-versus-tab fallback behavior.
- Do not change Firefox's existing popup safety gate.
- Do not add a user setting, telemetry event, or user-facing copy.

## Source Context

Introduce `TEMP_WINDOW_REQUEST_SOURCES` as a runtime constant and derive the
`TempWindowRequestSource` union from it in the temporary-window contract. It
distinguishes:

- `popup`
- `options`
- `sidepanel`
- `background`

Runtime message boundaries validate unknown source values with a type guard.
The source is transient and must not be persisted.

A single resolver converts the source into the low-level window policy:

```ts
shouldSuppressTempWindowMinimize(source) => source === "popup"
```

The launch policy also exposes whether the existing browser-specific safety
rules allow a temporary window. In particular, a Firefox task whose source is
the toolbar popup remains blocked even after that task has crossed into the
background worker. Source context does not create a new Firefox policy; it
prevents the existing policy from being bypassed by delegation.

Resolution precedence is explicit:

1. an intentional low-level `suppressMinimize` boolean override;
2. a valid source supplied by the caller;
3. source captured from the current extension surface before delegation;
4. `background` when a runtime boundary receives a missing or invalid source.

This distinguishes a high-level wrapper that is still able to capture its
current popup surface from a background handler that must not guess where an
already-delegated request originated.

Explicit open-window operations remain an intentional low-level override and
do not use the ordinary fallback resolver.

## Data Flow

### UI-open auto-checkin

1. The shared UI hook determines its current source before sending the
   pretrigger message.
2. The typed auto-checkin message carries that source into the background.
3. The scheduler carries it through the daily-run invocation without storing
   it in scheduler status or retry state.
4. The per-account provider context receives the source.
5. New API native-page and Turnstile helpers derive `suppressMinimize` from the
   source.
6. Before opening a window, Firefox popup-source work applies the existing
   popup safety gate even though execution is now in the background.
7. Successful post-checkin account refresh receives the same source so its API
   fallback cannot later close the originating popup.

The post-checkin refresh propagation is end to end. The source travels through
the scheduler refresh request, `RefreshAccountOptions`,
`ApiServiceAccountRequest`/`ApiTransportRequest`, and
`TempWindowFallbackContext` before the fallback wrapper resolves the final
boolean. It must not stop at a scheduler-only option that downstream account
refresh silently drops.

Scheduled alarms and later retry alarms start with `background` source. They do
not inherit the source of an earlier UI pretrigger.

### Generic API fallback

1. API transport accepts an optional temporary-window source as transient
   request metadata.
2. The fallback context carries it to the temporary-window wrapper.
3. If an explicit source is present, the centralized resolver uses it.
4. If no source was passed, the wrapper captures the current extension surface
   before crossing into background. This preserves existing direct popup calls
   while allowing direct background calls to minimize normally.

The existing unconditional `suppressMinimize: true` is removed.

### Auto-detect and browser-session reads

Existing popup detection is routed through the same source resolver rather
than maintaining a separate boolean rule. Browser-session callers that already
know their source pass it explicitly. The background temp-window pool continues
to receive the resolved boolean and remains independent of React/UI modules.

### Rendered-title reads

`tempWindowGetRenderedTitle` uses the same resolver and precedence as fetch,
Turnstile, and page-action helpers. It must not retain a separate
`params.suppressMinimize ?? isExtensionPopup()` implementation.

### Explicit open-window action

`OpenTempWindow` intentionally presents a window to the user. Its composite
mode must continue suppressing minimization so it behaves like the standalone
window mode. This is an explicit presentation command, not a fallback request.

## Failure and Compatibility Behavior

- A high-level wrapper with no explicit source captures its current extension
  surface before delegation.
- A runtime/background boundary that receives a missing or invalid source
  falls back to `background`, which minimizes and preserves the previous
  background default.
- Firefox popup-source requests remain subject to the existing no-temp-window
  safety behavior after crossing into background.
- An explicit low-level `suppressMinimize` override remains supported where a
  caller truly owns window presentation behavior and takes precedence over a
  supplied or inferred source.
- Tab-backed contexts ignore minimization as they do today.
- Reused pooled contexts keep their existing window state; the policy affects
  creation of a new window-backed context only.
- Popup closure does not cancel background check-in work.

## Testing

Use TDD at the real propagation seams:

- source-policy resolver matrix for popup, options, side panel, background,
  missing, and invalid inputs;
- UI-open pretrigger captures and sends the current source;
- scheduler passes popup source to provider execution and successful
  post-checkin refresh;
- alarm and retry paths use background source;
- native-page and Turnstile wrappers receive the derived suppression policy;
- Firefox popup-source work is rejected by the existing safety gate even when
  the helper executes in background;
- popup-source post-checkin refresh carries the source through account storage,
  API service/transport request metadata, and `TempWindowFallbackContext`, then
  makes generic fallback suppress minimization at the final wrapper;
- generic API fallback no longer forces suppression and resolves popup versus
  background correctly;
- auto-detect keeps its popup protection through the shared source path;
- rendered-title reads use the same source resolver as the other temporary
  helpers;
- explicit `suppressMinimize: true` and `suppressMinimize: false` each override
  a conflicting source, while missing or invalid runtime source defaults to
  background;
- standalone window and composite window modes both skip minimization only
  when suppression resolves true;
- explicit `OpenTempWindow` remains visible.

Focused Vitest coverage is the correct primary layer because the contract is
runtime-message and request-metadata propagation. Existing Playwright tests
open `popup.html` as a normal page and cannot reproduce a real toolbar popup's
auto-hide semantics, so no new E2E test is planned for this slice.

Before handoff, run related Vitest suites, `pnpm run validate:staged`, and
`pnpm run validate:push` because shared TypeScript contracts and runtime wiring
will change.

## Release Readiness

- Telemetry: none. This is an internal correctness fix with no new user action,
  setting, or privacy-safe product question that needs measurement.
- Settings search/deep links: not applicable; no setting changes.
- Maintainability: centralize source resolution and retain the pool as the
  low-level window owner. Do not introduce popup-liveness state.
