## Context

- The background script registers two extension-owned browser context menu items unconditionally at startup via `setupContextMenus()` (`entrypoints/background/index.ts` → `entrypoints/background/contextMenus.ts`):
  - `redemption-assist-context-menu` (selection only)
  - `ai-api-check-context-menu` (page + selection)
- Users reported the right-click menu becomes visually noisy / too wide, especially due to the “Quickly test the functional availability of AI APIs” entry (#479). They want to hide specific entries they don’t use without disabling the underlying feature.
- This codebase already applies preference-driven side effects in background via runtime messages (e.g., `RuntimeActionIds.PreferencesUpdateActionClickBehavior` handled in `entrypoints/background/runtimeMessages.ts`).
- New requirement: per-context-menu-entry visibility toggles, applied immediately by notifying background when the related setting changes.

## Goals / Non-Goals

**Goals:**

- Persist a per-entry “show in right-click menu” toggle for extension-owned context menu entries (at minimum: Web AI API Check; optionally: Redemption Assist for symmetry).
- Default to “shown” for backward compatibility (existing users see no behavior change until they opt out).
- Apply changes immediately without requiring extension reload (Options → save/toggle → background refreshes menu items).
- Keep `setupContextMenus()` refresh-safe (idempotent) so repeated refreshes do not accumulate click listeners.
- Maintain MV3 (Chromium service worker) and MV2 (Firefox background page) compatibility.

**Non-Goals:**

- Per-site / per-URL context menu visibility rules (this change is per-entry only).
- Renaming/rewording menu titles or changing which `contexts` they appear in.
- Reworking the underlying Redemption Assist / Web AI API Check feature flows beyond menu visibility.

## Decisions

### 1) Store visibility as feature-scoped preferences (not a single global toggle)

**Decision:** Add a dedicated `contextMenu` visibility flag under each feature’s preferences that owns a menu entry:

- `webAiApiCheck.contextMenu.enabled` (default `true`)
- `redemptionAssist.contextMenu.enabled` (default `true`, if included in-scope)

**Rationale:**

- The UI for these features is already organized by feature sections (`WebAiApiCheckSettings`, `RedemptionAssistSettings`), so the toggle is most discoverable inside the corresponding section.
- This satisfies the “per-menu-entry, not global control” requirement while keeping the schema extensible (future entries can add their own `contextMenu` toggles).

**Alternatives considered:**

- A single global `contextMenusEnabled` switch: rejected because it cannot hide one entry without hiding all.
- A centralized `preferences.contextMenus.{apiCheck,redemptionAssist,...}` map: viable, but less discoverable in the UI and introduces a cross-feature settings surface earlier than needed.

### 2) Background refresh triggered via runtime message (with optional storage fallback)

**Decision:** Introduce a new runtime action (under the existing Preferences namespace) that tells background to refresh context menus immediately after a relevant preference update.

- New action id: `preferences:refreshContextMenus` (added to `constants/runtimeActions.ts`)
- Background handler: add a branch in `entrypoints/background/runtimeMessages.ts` that calls a new `refreshContextMenus()` (or calls `setupContextMenus()` if it becomes refresh-safe) and returns `{ success: true }`.
- UI trigger: after persisting the relevant preference update, send the runtime message from `contexts/UserPreferencesContext.tsx` (so both Options and Popup benefit consistently).

**Rationale:**

- Aligns with existing “preference change → runtime message → background side effect” patterns (e.g., action click behavior).
- Ensures immediate UX feedback and reliably wakes MV3 service workers.

**Optional hardening (if needed):**

- Add a `browser.storage.onChanged` listener in background for the user-preferences storage key to refresh menus when preferences change outside the UI path (e.g., migrations/import). This is a resilience improvement, not required for the primary UX.

### 3) Make context menu setup refresh-safe (avoid duplicate click listeners)

**Decision:** Refactor `entrypoints/background/contextMenus.ts` into:

- `ensureContextMenuClickListener()` which registers `browser.contextMenus.onClicked` exactly once (or removes the previous listener before adding).
- `refreshContextMenus(preferences)` which:
  - Removes extension-owned menu ids best-effort.
  - Conditionally re-creates menu entries based on current preferences.

`setupContextMenus()` becomes a thin wrapper that loads preferences and calls both helpers.

**Rationale:**

- The new feature requires calling the refresh path multiple times. The current implementation attaches an `onClicked` listener each time, which would cause duplicate handlers if reused.

### 4) Visibility gating combines feature enable + context-menu visibility

**Decision:** Only create a menu entry when both are true:

- Feature master enable (`webAiApiCheck.enabled` / `redemptionAssist.enabled`)
- Context menu visibility (`*.contextMenu.enabled`)

**Rationale:**

- The context menu is a manual entrypoint; if a feature is disabled, the menu should not advertise an action that will not function as expected.
- Keeps behavior consistent with existing preference semantics (Web AI API Check comment indicates manual triggers are tied to `enabled`).

**Alternative considered:**

- Allow context menu even when feature disabled: rejected for now to avoid inconsistent UX; can be revisited if users request “manual-only” behavior.

### 5) Settings UX placement

**Decision:** Add a “Show in browser right-click menu” switch:

- In `entrypoints/options/pages/BasicSettings/components/WebAiApiCheckSettings.tsx` (required; directly addresses #479).
- In `entrypoints/options/pages/BasicSettings/components/RedemptionAssistSettings.tsx` (optional but recommended to keep controls consistent across both context-menu-backed features).

All user-facing strings must be i18n’d (existing namespaces: `webAiApiCheck`, `redemptionAssist`, `settings`).

## Risks / Trade-offs

- **[Risk] Duplicate listeners if refresh is naive** → **Mitigation:** isolate click listener registration and guarantee single attachment.
- **[Risk] Preference save → refresh race** → **Mitigation:** send the refresh runtime message only after `savePreferences()` resolves successfully.
- **[Risk] MV3 lifecycle (service worker sleep/wake)** → **Mitigation:** runtime message-based refresh wakes the worker; keep refresh logic fast and idempotent.
- **[Trade-off] Extra background work on frequent toggles** → **Mitigation:** refresh is limited to removing/creating two ids; optional debounce can be added if needed.

## Migration Plan

- Add new preference fields with defaults (`true`) in `DEFAULT_PREFERENCES`; rely on existing `deepOverride(DEFAULT_PREFERENCES, stored)` behavior so missing fields in stored prefs are treated as enabled.
- No destructive migrations required; rollback is safe because older builds will ignore unknown fields and still create menus as before.

## Open Questions

- Scope: implement the toggle only for Web AI API Check (issue #479) or include Redemption Assist in the same change to fully cover “per-menu-entry” behavior?
- Do we want the optional `storage.onChanged` fallback in background immediately, or keep only runtime-message refresh for simplicity and add fallback if a real-world gap is reported?
