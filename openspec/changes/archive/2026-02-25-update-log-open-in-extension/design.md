## Context

Before this change, the extension supported an “open changelog after update” flow:

- Background writes a pending version marker on update (see `services/changelogOnUpdateState.ts` and background update handling).
- When any UI surface opens (popup/options/sidepanel), `components/ChangelogOnUpdateUiOpenHandler.tsx` consumes the pending marker and (when `openChangelogOnUpdate` is enabled) opens the docs changelog URL in a **new active browser tab** via `createTab(getDocsChangelogUrl(version), true)`.

This change keeps the at-most-once semantics but changes *where* the update log is shown: inside the extension UI instead of an external browser tab.

## Goals / Non-Goals

**Goals:**
- Show the update log inline inside the extension UI on first UI open after update (at most once per version).
- Do not create an external docs tab automatically as part of the update flow.
- Keep the existing atomic pending-marker consumption behavior across concurrent UI contexts.
- Keep the existing `openChangelogOnUpdate` preference semantics (default enabled, persisted).

**Non-Goals:**
- Redesign the full documentation site or replace the docs changelog page.
- Guarantee offline availability for update-log content.
- (Unless explicitly requested) change other manual changelog entry points (e.g. version badges/links) beyond the update-triggered flow.

## Decisions

### 1) UI presentation: in-app modal/dialog (not navigation)
**Decision:** Render an “Update log / What’s New” dialog/panel inside the active UI surface (popup/options/sidepanel) using existing modal patterns, wired from `AppLayout`.

**Rationale:**
- Works uniformly across UI surfaces without requiring cross-surface navigation or opening tabs.
- Keeps user context (they’re already in the extension UI) and avoids disruptive focus changes.

**Alternatives considered:**
- **Open options page to an internal “Changelog” route**: still opens/focuses a tab and feels tab-like; more disruptive than a modal.
- **Bundle changelog content and render locally**: avoids network/framing issues, but requires ongoing parsing/rendering logic and can drift from the docs site presentation.

### 2) Content source: embed the docs changelog page via iframe (best-effort)
**Decision:** Embed the docs changelog page URL (anchored to the updated version) inside the dialog using an `iframe`.

**Rationale:**
- Keeps rendering consistent with the docs site without adding a markdown renderer/parsing pipeline to the extension.
- Reduces maintenance overhead and avoids needing to keep a “mini changelog renderer” in sync with docs formatting changes.

**Alternatives considered:**
- **Bundle markdown and render locally**: more reliable offline and avoids framing headers, but increases bundle size and requires parser/renderer logic.
- **Open the docs changelog in a new tab**: simplest technically, but disruptive UX (what we’re explicitly avoiding for the automatic flow).

### 3) Fallback behavior for iframe load failures
**Decision:** If the embedded preview fails to load (e.g., due to framing headers/CSP or network), show a minimal inline message and provide a user-invoked action to open the full docs changelog page anchored to the version in a new tab.

**Rationale:** Preserves a good UX even when inline embedding cannot render.

**Implementation note:** Iframe failures cannot be reliably detected everywhere, so the UI treats “not loaded within a short timeout” as a best-effort failure signal and shows the fallback message.

### 4) Preference control: allow toggling auto-open from the dialog
**Decision:** The inline update-log dialog provides a user-invoked action to enable/disable `openChangelogOnUpdate`.

**Rationale:** If a user finds the dialog disruptive, they can disable future automatic opening immediately without navigating to settings.

## Risks / Trade-offs

- **[Network dependency]** The iframe preview depends on being able to load the docs page → Mitigation: show a clear failure message + provide “Open full changelog” as an escape hatch.
- **[Framing restrictions]** The docs site may block embedding via CSP/X-Frame-Options → Mitigation: same as above (preview becomes best-effort only).
- **[Popup space constraints]** Release notes may be long for popup/sidepanel → Mitigation: scrollable content area + “Open full changelog” action.

## Migration Plan

- No storage migrations required.
- Update specs/tests to reflect the new inline behavior.
- Release as a behavioral UX change; rollback is reverting to tab-opening logic if needed.

## Open Questions

- Should the inline update log appear as a modal everywhere, or should popup route users to sidepanel/options for a larger reading surface?
- Should manual changelog entry points (e.g., `VersionBadge` link) also open the in-extension viewer, or remain external?
