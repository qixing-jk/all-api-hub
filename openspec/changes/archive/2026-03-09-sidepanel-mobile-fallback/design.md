## Context

The current side panel support flow treats API presence as equivalent to usable support. In practice, some mobile browser environments expose `browser.sidebarAction.open` or `chrome.sidePanel.open` but cannot actually present a usable side panel UI.

This false-positive signal affects multiple surfaces:

- Background toolbar action wiring can disable the popup and rely on side panel opening.
- Chromium-specific browser-managed action behavior can attempt to open the panel outside our fallback path.
- Popup-side direct entry points can try to open side panel without sharing the same fallback semantics or unsupported-state affordance rules.
- Settings can communicate side panel availability based on optimistic detection rather than effective usability.
- Device classification was previously split across narrower UA checks, making mobile/tablet false positives harder to reason about consistently across support detection and adjacent popup flows.

The change is cross-cutting because support detection, toolbar behavior, popup navigation, and settings messaging all depend on the same concept of side panel availability.

## Goals / Non-Goals

**Goals:**
- Define side panel support in terms of effective usability on the current device/runtime, not raw API presence alone.
- Ensure toolbar clicks never enter a dead state where no usable extension surface appears.
- Reuse one fallback model for toolbar clicks and direct side-panel entry points.
- Preserve the stored `actionClickBehavior` preference even when the current device cannot use side panel.

**Non-Goals:**
- Redesign the popup, options, or side panel UX.
- Introduce sync-time preference rewriting across devices.
- Guarantee perfect pre-open detection for every browser fork before an open attempt is made.

## Decisions

### Decision: Distinguish effective support from raw API presence
The implementation should evaluate whether side panel is effectively usable on the current device/runtime, rather than assuming API exposure is sufficient. It should combine narrow pre-open runtime heuristics with an observed-failure degradation signal after a real open attempt fails. The form-factor heuristics should stay aligned with the shared device-classification helper used by nearby popup flows.

**Rationale:**
- The observed bug is specifically a false-positive runtime.
- This keeps UI messaging and action behavior aligned with what users can actually do.

**Alternatives considered:**
- Trust API presence only: rejected because it preserves the current mobile false-positive bug.
- Use only a hardcoded mobile user-agent denylist: rejected because it is too brittle on its own and does not account for observed runtime failures.

### Decision: Centralize device classification heuristics in shared browser utilities
The implementation should move mobile/tablet/desktop detection into a shared helper that side panel support checks can call directly, and adjacent popup/device-aware flows can reuse.

**Rationale:**
- Side panel false positives depend on device form factor, so the support check needs something more robust than duplicated UA-only helpers.
- Reusing the same helper in nearby popup flows reduces drift between what the runtime is classified as and how the UI behaves on that runtime.

**Alternatives considered:**
- Keep separate UA-only helpers for each caller: rejected because it would preserve inconsistent device classification logic.
- Inline device heuristics inside side panel support detection only: rejected because other flows on this branch already benefit from the same runtime classification.

### Decision: Keep toolbar side-panel opening on an extension-managed path
Toolbar behavior wiring should keep Chromium on an extension-managed path whenever runtime action behavior is applied, and the `sidepanel` preference should route through that path instead of depending on a browser-managed auto-open path that can fail without invoking our recovery logic.

**Rationale:**
- The dead-click risk comes from losing control over the open attempt.
- An extension-managed path allows `openSidePanel()` failure to be caught and redirected to a usable surface.

**Alternatives considered:**
- Continue using browser-managed auto-open where available: rejected because it can bypass the existing fallback handler on false-positive runtimes.

### Decision: Share a single side-panel fallback contract across entry points
Direct side-panel affordances, such as popup header actions, should use the same open-or-fallback semantics as toolbar behavior. When support is already known to be unavailable, popup-side affordances should stop advertising side panel entry entirely. When an open attempt still fails, the shared fallback should route to the Basic settings surface.

**Rationale:**
- Without a shared contract, different entry points can diverge and regress independently.
- The fallback destination should be predictable and testable.

**Alternatives considered:**
- Handle background and popup failures separately: rejected because it duplicates logic and increases mismatch risk.

## Risks / Trade-offs

- [Risk] Conservative detection may hide side panel on some runtimes that could work. -> Mitigation: keep heuristics narrow and prefer runtime fallback behavior over broad static deny rules.
- [Risk] Removing browser-managed auto-open may slightly change click wiring on Chromium. -> Mitigation: keep behavior identical from the user perspective and cover with focused action-click tests.
- [Risk] A service worker restart may clear any in-memory runtime degradation signal. -> Mitigation: make the fallback path itself safe even without persistent degradation state.

## Migration Plan

- No data migration is required.
- No persisted preference changes are required.
- Rollback is low-risk because the affected behavior is limited to side panel support detection and opening flows.

## Open Questions

- None currently.
