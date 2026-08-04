# Toolbar Side Panel Cold-Start Design

## Context

GitHub issue #1245 reports that Edge can require two toolbar-icon clicks before
the configured side panel opens. The current Manifest V3 background entrypoint
registers the action-click listener only after unrelated asynchronous service
initialization and a preference read. If the service worker is asleep, the
first click can wake the worker before that listener exists, so the event is
lost. A separate race lets the settings UI finish before the background has
actually applied the new browser action configuration.

The saved `actionClickBehavior` preference remains the product source of truth.
Browser action popup state and Chromium side-panel behavior are an execution
projection that must be reconciled from that preference whenever the background
context loads and whenever the setting changes.

## Considered Approaches

### 1. Use Chromium's native action-to-side-panel behavior (recommended)

For Chromium side-panel mode, clear the popup and enable
`sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`. The browser can
then open the panel without waiting for the extension service worker. Register
one stable action listener synchronously for modes and browsers that still need
extension-managed routing.

This directly removes the cold-worker dependency from the reported path. It
also preserves Firefox through its existing `sidebarAction` path and permits a
manual fallback when native Chromium configuration cannot be applied. The
trade-off is that Chromium no longer provides reliable toolbar-click attribution
to the current manual click telemetry.

### 2. Keep manual opening but register a dispatcher synchronously

A top-level listener could read the saved preference and call `sidePanel.open`
for every click. It would receive the cold-start event, but an asynchronous
storage read before `sidePanel.open` can leave the original user-gesture scope.
That makes the central browser API call unreliable, so this does not fully fix
the reported failure.

### 3. Move the current asynchronous setup earlier

Loading preferences before the other services would shorten the race window,
but the listener would still be absent during an asynchronous storage read. This
reduces frequency without removing the root cause.

## Design

### Stable event registration

The background entrypoint will synchronously register a single toolbar action
listener before starting any asynchronous initialization. The listener will not
be added and removed as preferences change. It will dispatch only the modes that
need extension code:

- `options`: open the options page.
- Firefox `sidepanel`: use the existing sidebar-opening path.
- Chromium manual fallback: use the existing side-panel-or-options fallback if
  native action behavior could not be enabled.
- `popup` and Chromium native `sidepanel`: do nothing in the listener because
  the browser owns those clicks.

The applied behavior is cached only as runtime routing state. On a fresh
background context, the dispatcher may load the durable preference if early
reconciliation has not completed. It must not treat the cache as persistence.

### Browser configuration projection

The browser API wrapper will expose a symmetric operation for enabling or
disabling Chromium's native side-panel action behavior and report whether the
configuration was applied. The action behavior reconciler will project each
effective mode as follows:

| Effective mode | Popup | Chromium native side panel | Extension dispatcher |
| --- | --- | --- | --- |
| `popup` | `popup.html` | disabled | no-op |
| Chromium `sidepanel` | empty | enabled | no-op, or manual fallback if enabling fails |
| Firefox `sidepanel` | empty | unavailable/disabled | open Firefox sidebar |
| `options` | empty | disabled | open options |
| unsupported `sidepanel` | `popup.html` | disabled | no-op |

The current unsupported-side-panel fallback to the popup remains unchanged.

### Startup and update ordering

Toolbar configuration reconciliation will start before unrelated background
services. On browser startup, extension update, or extension reload, it restores
the runtime projection from `chrome.storage`. Chromium's native side-panel
preference survives service-worker suspension, so ordinary worker cold starts no
longer depend on this asynchronous reconciliation; early reconciliation covers
extension/browser lifecycle reloads where dynamic action state may be rebuilt.

Calls that apply action behavior will be serialized. A later setting change
cannot be overwritten by an older, slower browser API call.

### Settings acknowledgement and failures

The background preferences message handler will await the complete browser
configuration operation before responding. The React preferences provider will
also await that response before its update promise settles.

The durable preference write remains successful if the runtime message channel
is unavailable. The failure is logged, and the next background startup retries
projection from storage. A rejected browser configuration operation produces a
failure response instead of an early success response.

### Telemetry

No new telemetry fields or events will be added. Existing exact
`OpenSidepanelFromToolbarAction` tracking remains for Firefox and Chromium's
manual fallback. The Chromium native path will not claim exact click attribution
because the action listener is not a reliable source once the browser owns the
open. Existing side-panel entrypoint/navigation telemetry remains available for
overall usage. Reliability takes precedence over preserving an ambiguous event.

No settings search or localization changes are required because the setting and
its copy do not change.

## Validation

Focused Vitest coverage will prove:

- Chromium side-panel mode clears the popup and enables native action behavior
  without installing a conditional listener.
- popup/options/unsupported/Firefox paths retain their expected routing.
- the stable dispatcher exists before asynchronous reconciliation and can route
  modes that require extension code.
- concurrent configuration calls finish in request order.
- the runtime preference response waits for configuration and reports an
  asynchronous failure.
- the preferences provider waits for the runtime response while preserving its
  current durable-write fallback semantics.

The existing Playwright settings flow will be updated to assert the native
Chromium panel behavior in addition to popup state. Playwright cannot reliably
click the browser toolbar in the current extension harness, so the final browser
check for this regression will be a manual Edge cold-worker scenario: select
Side panel, allow the worker to stop, and verify one toolbar click opens it. The
focused tests cover the architectural invariant that prevents the first event
from depending on late listener registration.

## Scope Boundaries

This change will not remove the manifest popup, redesign settings UI, add a
service-worker keepalive, change side-panel content, or introduce new analytics
contracts. Broader toolbar telemetry attribution through browser-specific
side-panel lifecycle events is a separate concern.
