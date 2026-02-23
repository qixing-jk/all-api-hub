## Context

The extension provides multiple UI entrypoints (popup, options, side panel). Users can configure what the toolbar icon click does via the `actionClickBehavior` preference (`popup` vs `sidepanel`). Today, the runtime wiring attempts to open the side panel and falls back when that fails, but side panel support varies across browsers (Chromium vs Firefox, desktop vs Android) and across API versions (method availability and parameter shapes).

This change standardizes side panel capability detection and ensures toolbar/command entrypoints always resolve to a supported UI surface without relying on exception-driven control flow.

## Goals / Non-Goals

**Goals:**
- Detect whether the current runtime supports opening a side panel/sidebar.
- Apply the user’s configured toolbar click behavior using an *effective behavior* that falls back when side panel is unsupported.
- Clearly communicate side panel support on the current device and how toolbar clicks will fall back when unsupported.
- Ensure keyboard commands (popup/sidebar) use the same capability detection and fallback logic.
- Add tests for supported/unsupported environments.

**Non-Goals:**
- Redesign the side panel UI or change its navigation/feature set.
- Automatically rewrite persisted preferences based on runtime capability detection (avoid multi-device configuration sync side effects).
- Guarantee side panel opening in all environments (only best-effort with explicit fallback).

## Decisions

1. **Centralize side panel capability detection**
   - Add a shared helper (e.g. `getSidePanelSupport()` / `isSidePanelSupported()`) in `utils/browserApi.ts` that classifies support as:
     - Firefox: `browser.sidebarAction?.open` exists
     - Chromium: `chrome.sidePanel?.open` exists
     - None: missing API or missing open method
   - The helper returns a structured result (supported + kind + optional reason) so UI can explain why the option is unavailable.

2. **Compute an effective toolbar-click behavior**
   - In the background wiring (`applyActionClickBehavior`), compute:
     - `effectiveBehavior = requestedBehavior` when side panel is supported
     - `effectiveBehavior = "popup"` when side panel is unsupported
   - Only apply side-panel-specific wiring (clearing popup, setting panel behavior, click listener to open side panel) when `effectiveBehavior === "sidepanel"`.
   - When falling back to popup, keep (or restore) `popup.html` as the toolbar popup so the click experience remains native and predictable.

3. **Keep “open side panel” best-effort, with a last-resort fallback**
   - `openSidePanel()` remains best-effort and may still throw (missing active tab/window, user gesture constraints, API mismatch).
   - When `openSidePanel()` fails at runtime, fall back to opening a stable surface the user can act on (options settings as a last resort), but the primary fallback path is to apply an effective popup behavior on unsupported devices (without changing the stored preference).

4. **User messaging without auto-normalization (multi-device safe)**
   - The system MUST NOT automatically change the persisted `actionClickBehavior` value based on side panel support detection, because preferences may be synced across devices.
   - In Options UI, show a clear warning when side panel is unsupported on the current device, including when the stored preference is `sidepanel`.
   - If the user selects `sidepanel` on an unsupported device, keep the preference as requested but communicate that this device will fall back to opening the popup.

5. **Reuse the same capability logic for keyboard shortcuts**
   - Introduce a single background entrypoint action (e.g. `openPrimaryUiSurface(prefer: "popup" | "sidepanel")`) used by toolbar clicks and keyboard commands so behavior stays consistent.

## Risks / Trade-offs

- **[Side panel APIs evolve / differ]** → Mitigation: treat method availability as the support gate; keep `openSidePanel()` defensive and fall back gracefully.
- **[Active tab/window not available in service worker]** → Mitigation: use robust tab/window lookup; if unavailable, fall back to opening options.
- **[Preference appears “set” but behavior falls back]** → Mitigation: surface explicit UI messaging on unsupported devices (and when users select `sidepanel`) so the fallback is expected.
- **[Auto-normalization breaks multi-device sync expectations]** → Mitigation: never write back fallback values automatically; rely on runtime effective behavior + UI messaging.

## Migration Plan

- No schema migration required.
- Do not auto-normalize persisted preferences; runtime uses an effective behavior fallback without writing to storage.
- Rollback: revert to the previous wiring; no user data loss expected.

## Open Questions (Resolved)

- “Unsupported + fallback” messaging is displayed via inline settings helper text, plus a toast when the user selects side panel on an unsupported device.
- When `openSidePanel()` fails despite support being detected, the fallback opens the options/settings surface.
