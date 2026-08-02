# Protection-Bypass Adaptive Focus Design

Date: 2026-08-01

## Purpose

Reduce website-verification interruptions without forcing users to choose
between a foreground-stealing browser window and temporary pages mixed into
their everyday tab strip.

The feature adds an outcome-oriented automatic opening preference, a small
development-only focus readout under the existing Protection Bypass trigger,
and privacy-safe focus outcome counters in the existing bounded daily summary.
It does not claim that a particular focus change was caused by the extension.

## Goals

- Add an explicit `auto` opening preference and recommend it to new users.
- Keep the three current concrete choices exact and available:
  `tab`, `composite`, and `window`.
- Reuse an existing shared verification window whenever it is alive.
- When automatic selection must create a context:
  - use the shared-window path while this browser is focused;
  - use an inactive tab while this browser is unfocused or focus is unknown.
- Preserve window-backed isolation for incognito/private contexts.
- Show developers the start, during, and end focus state for the current Dev
  trigger run.
- Add controlled daily-summary counters that measure observed focus outcomes
  and resolved concrete modes without URLs, window IDs, or free-form values.
- Preserve the Coordinator's acquire-time policy and resource-currentness
  invariants.

## Non-Goals

- Do not identify which application received focus outside the browser.
- Do not state that the extension, user, operating system, or another extension
  definitively caused a focus change.
- Do not restore focus to an external application after a window opens.
- Do not add a persistent focus monitor, focus history, per-run analytics
  events, raw timelines, window IDs, URLs, request IDs, or diagnostic exports.
- Do not silently change the meaning of the three existing concrete modes.
- Do not defer ordinary protected work until the user returns to the browser.
- Do not add a first-run modal, repeated toast, or operating-system
  notification for automatic mode selection.

## Approaches Considered

### A. Change Composite Mode Implicitly

Composite mode could fall back to the user's ordinary tab strip whenever the
browser is in the background. This is small, but the setting would no longer
mean "single shared window." It is rejected because the label and behavior
would diverge.

### B. Add A Separate Background-Protection Toggle

A second toggle could modify Window and Composite behavior. It preserves the
existing mode list, but creates interacting controls that users must mentally
combine. It is rejected as unnecessary settings complexity.

### C. Add An Explicit Automatic Preference

This is the selected approach. Users who care mainly about interruption can
choose one recommended outcome-oriented option, while users who require exact
placement retain deterministic concrete choices.

## User Experience

Keep the existing `Opening method` segmented control and add `Automatic` as the
first option:

1. Automatic (Recommended)
2. Tab in current window
3. Single shared window
4. New window each time

Move the existing recommended indicator from Tab to Automatic. Keep one
selected-mode description below the control rather than placing explanatory
copy inside every segment.

Recommended Chinese intent:

> 自动选择
>
> 优先避免打断当前工作。你正在使用浏览器时，验证页面会集中在共享窗口；浏览器在后台时，会使用一个非活动标签页，并在完成后自动关闭。

The copy describes the result. It does not mention `getLastFocused`, browser
focus events, service workers, Adapters, or fallback internals.

Concrete-mode descriptions remain candid:

- Tab avoids bringing the browser forward but temporarily shares the ordinary
  tab strip.
- Composite keeps verification pages together but its first window creation
  may bring the browser forward.
- Window creates a separate window for every verification and is the most
  interruptive option.

Do not show a live "browser focused" indicator in normal settings. Focus is a
short-lived fact and a live label would imply more certainty than the product
can provide.

## Preference Model And Migration

Keep concrete runtime modes separate from the preference-only automatic value:

```ts
const TEMP_CONTEXT_MODES = {
  Window: "window",
  Composite: "composite",
  Tab: "tab",
} as const

const TEMP_CONTEXT_PREFERENCE_MODES = {
  Auto: "auto",
  ...TEMP_CONTEXT_MODES,
} as const
```

`TempContextMode` remains the concrete runtime Adapter union.
`TempContextPreferenceMode` adds `auto` and becomes the persisted
`tempContextMode` preference type. This prevents `auto` from leaking into code
that requires an actual tab or window lifecycle.

No preference-version migration is required. Adding one accepted enum value is
backward-compatible, and existing users do not need any stored value rewritten.
Keep the current preference schema version at v27.

Separate two defaults that previously shared one constant:

```ts
const DEFAULT_NEW_INSTALL_TEMP_CONTEXT_PREFERENCE =
  TEMP_CONTEXT_PREFERENCE_MODES.Auto
const LEGACY_TEMP_CONTEXT_MODE_FALLBACK = TEMP_CONTEXT_MODES.Tab
```

- `DEFAULT_PREFERENCES` and `createDefaultPreferences()` use the new-install
  Auto default.
- Existing stored concrete values remain unchanged.
- Normalization of older stored, imported, or WebDAV data with a missing or
  invalid mode uses the previous effective Tab fallback.
- Reading preferences never writes or materializes a replacement mode merely
  because the application default changed.

This keeps current users on their exact effective behavior, including users
whose older or partial data never stored a valid mode, while new installations
receive Auto without a migration.

The settings snapshot allow-list accepts the new controlled `auto` preference.

## Focus State Boundary

Add one cross-browser helper that returns a tri-state value:

```ts
type BrowserFocusState = "focused" | "unfocused" | "unknown"
```

The helper uses `browser.windows.getLastFocused({})` and reads the returned
window's `focused` property. Unsupported APIs, no available window, browser
shutdown, rejected calls, and malformed results return `unknown`.

`unknown` is not equivalent to a confirmed unfocused state for diagnostics or
telemetry. It deliberately selects the same least-disruptive automatic opening
behavior as `unfocused`.

The helper observes only windows visible to the current extension/browser
profile. It does not identify another profile, another browser, or an external
foreground application.

## Automatic Mode Resolution

Resolve `auto` inside the temporary-context pool, where shared-window liveness,
incognito requirements, creation fallback, and cleanup are already owned.

The decision order is:

```text
incognito/private isolation required -> window
live shared verification window       -> composite
browser focused                       -> composite
browser unfocused                     -> tab
focus unknown                         -> tab
```

Fixed `tab`, `composite`, and `window` preferences keep their current behavior,
including existing recoverable non-incognito window-to-tab fallback.

Read focus inside the same-origin acquire lock immediately before the final
authorization callback. The callback still performs the last asynchronous
policy, capability, and resource-currentness validation. After it allows the
task, the pool proceeds directly into reuse or creation using the already-read
focus snapshot. Focus lookup must not become an unrelated await after the
authoritative current-resource check.

The focus value is a recent decision input, not an atomic guarantee. A user may
change focus between the snapshot and browser creation call.

## Development Focus Readout

Extend the existing development-only Protection Bypass trigger in settings.
Each run shows one compact local result:

```text
本次检测
开始：浏览器在后台
过程中：浏览器曾回到前台
结束：浏览器在前台
```

The states are:

- Start: read immediately after the optional countdown, before submitting the
  protected task.
- During: listen only while that Dev request is pending and reduce events to
  `remained_focused`, `remained_unfocused`, `foregrounded`, `backgrounded`,
  `mixed`, or `unknown`.
- End: read when the Dev request resolves or rejects.

The options page owns this diagnostic observation. It reuses the shared focus
state and transition reducer but does not change the protected-task wire
contract. The listener is registered only for one run and removed in `finally`,
on cancellation, and on component unmount.

Every run replaces the previous readout. The result is not persisted, sent to
analytics, copied to logs, or shown outside development mode. Cancellation
before execution clears the readout; an executed request that fails still
shows its focus result alongside the existing failure feedback.

The Dev readout presents observed state only. It does not display window IDs,
timestamps, confidence scores, or a suspected cause.

## Telemetry

Reuse `shield_bypass_summary_captured`; do not add a per-operation event.

The pool observes focus only around actual temporary-context opening or reuse,
not across the entire network/verification task. This bounds user-driven focus
changes and measures the lifecycle most relevant to foreground activation.

Use the same controlled focus-state and transition reducer as the Dev readout,
but keep its observer in the background pool. Register `onFocusChanged` only
for the bounded opening span and always remove it in `finally`.

Extend the existing local daily summary with fixed counters for:

- focus observation start: focused, unfocused, unknown;
- focus observation end: focused, unfocused, unknown;
- transition summary: remained focused, remained unfocused, foregrounded,
  backgrounded, mixed, unknown;
- background-start observations by resolved concrete mode;
- foreground activation observed after a confirmed background start, by
  resolved concrete mode;
- unknown/incomplete observations by resolved concrete mode.

The per-mode denominator and foreground-activation counters allow comparison
of Tab, Composite, and Window without emitting a joined raw record. Existing
policy `adapterCounts` keep their current decision/preference semantics and add
`auto` where the stored preference is counted; focus counters use only the
resolved concrete Adapter.

Name the outcome as "foreground activation observed," never "focus stolen" or
"extension caused focus change." A confirmed foreground activation requires:

```text
start == unfocused
and either an observed transition to focused or end == focused
```

If start is unknown, the observation cannot contribute to a foreground-rate
numerator or denominator. It contributes only to unknown counters.

Update the typed daily-summary state, atomic increment/merge logic, fixed
scalar property catalog, event payload, privacy allow-list, numeric-property
sanitizer, empty-summary builder, activity detector, and focused tests together.

Never record or transmit:

- window or tab IDs;
- URLs, origins, hosts, paths, site types, account IDs, or request IDs;
- event timestamps or raw focus-event sequences;
- user input or external application identity;
- free-form causes, errors, or browser messages.

## Failure And Compatibility Behavior

- Desktop Chromium, Firefox, and Safari-compatible WebExtensions use the
  shared focus helper when the method exists.
- Firefox Android and any partial/unsupported environment return `unknown` and
  automatic mode resolves to Tab unless private isolation requires Window.
- A failed focus read never blocks a protected task.
- A failed telemetry increment never blocks context creation or task cleanup.
- A Dev observation failure renders `无法判断` while preserving the trigger's
  ordinary success or error result.
- Incognito/private requests never downgrade into an ordinary-profile Tab.
- If no suitable ordinary window exists for Tab creation, retain the current
  browser error/fallback classification rather than claiming focus safety.

## Testing

### Focus helper and reducer

- focused, unfocused, missing API, rejected API, no-window, and malformed-result
  cases;
- no events, transition to focused, transition to unfocused, multiple changes,
  and unknown start/end;
- listener cleanup on success, failure, cancellation, and unmount.

### Automatic resolution and preference compatibility

- Auto reuses a live shared window without creating another window;
- focused Auto selects Composite;
- unfocused and unknown Auto select Tab;
- private isolation selects Window regardless of focus;
- fixed modes preserve current behavior;
- final authorization remains after the focus read and immediately before
  acquire/reuse;
- fresh defaults use Auto without changing the schema version;
- existing concrete modes survive ordinary normalization unchanged;
- missing or invalid legacy modes normalize to Tab without being persisted by
  a read;
- current backup/WebDAV paths accept Auto while older or partial data retain
  the Tab compatibility fallback.

### Settings and Dev UI

- Automatic is first and carries the recommended accessible label;
- all four modes render with the correct selected description;
- settings search still targets the canonical opening-method control;
- all supported application locales keep the same key shape;
- delayed execution samples start at actual submission time;
- success and failure both display start/during/end states;
- repeated runs replace prior observations;
- cancellation and unmount remove listeners without stale updates.

### Telemetry and privacy

- each fixed focus state and transition increments the expected daily counter;
- confirmed background-to-foreground outcomes increment the resolved-mode
  numerator and denominator;
- unknown starts never enter the foreground-rate denominator;
- daily summary merge and UTC rollover preserve focus counters atomically;
- the emitted event contains only the fixed scalar properties;
- privacy sanitization rejects unlisted keys and nonnumeric counter values;
- no URL, ID, timestamp, event sequence, or free-form cause enters state or
  payloads.

## Browser-Level Validation Decision

Do not add an automated Playwright assertion for operating-system focus. Focus
and window-manager behavior is not deterministic in headed/headless CI and a
green result would overstate the guarantee.

Retain existing browser-level temporary-context coverage for tab/window
creation and cleanup. Use the enhanced Dev trigger for manual headed smoke
checks on at least Chromium and Firefox:

1. start a delayed run and move the browser to the background;
2. verify Auto uses the noninterrupting path and inspect the three focus states;
3. repeat while the browser is focused;
4. compare fixed Tab, Composite, and Window behavior;
5. verify private isolation remains window-backed where supported.

Vitest covers deterministic mode resolution, listener reduction, preference
compatibility, UI state, and telemetry privacy contracts.

## Maintainability Decision

Reuse the existing temporary-context pool, Shield settings, Dev trigger, and
bounded daily summary. Add one shared browser-focus state/reducer module rather
than duplicating focus literals and transition semantics between UI and
background code.

Keep preference intent and resolved runtime Adapter types separate. This avoids
teaching every existing concrete lifecycle switch that `auto` is a real window
or tab implementation.

Do not add a long-lived focus service, persistent event log, generic diagnostic
framework, or new analytics event. Those abstractions would exceed the narrow
decision, local readout, and daily-summary requirements.
