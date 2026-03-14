## Context

- The active managed-site provider is chosen from user preferences, and both the account-level "Locate channel" action and Key Management channel-status checks assume that the provider can find channels by normalized `base_url`.
- That assumption is false for Veloera: the current service layer already short-circuits token channel status to an unsupported `unknown` reason, and the provider implementation documents that `/api/channel/search` cannot be treated as a reliable base-URL lookup.
- The UI is still inconsistent with that limitation. `AccountActionButtons` shows "Locate channel" whenever managed-site admin config is valid, and Key Management still auto-runs status checks, exposes a refresh action, and renders status/review affordances that look actionable even though Veloera cannot support them reliably.
- This change only covers the non-mutating "locate/review status" flows. Managed-site import and other channel-management features remain separate concerns.

## Goals / Non-Goals

**Goals:**

- Disable Veloera-only managed-site UX that depends on reliable base-URL channel lookup before the user enters a dead-end flow.
- Keep the unsupported behavior explicit so users understand it is a Veloera backend limitation rather than a missing local config.
- Reuse existing account-menu and Key Management surfaces with minimal structural change.
- Preserve a defensive Veloera guard in service code so unsupported checks still fail safely if another caller reaches them later.

**Non-Goals:**

- Change managed-site import, duplicate-check, or channel creation behavior.
- Add backend workarounds, polling, or alternate Veloera search strategies.
- Redesign Key Management layout or introduce a new settings page just for this limitation.
- Change behavior for non-Veloera managed-site providers.

## Decisions

### 1. Introduce one shared capability check for "reliable channel lookup by base URL"

Add a narrow managed-site capability helper, for example under `src/services/managedSites/utils/`, that answers whether the active managed-site provider supports reliable base-URL channel lookup for review/navigation flows. It should return `false` for `Veloera` and `true` for the currently supported alternatives.

This helper should be consumed by:

- `AccountActionButtons` when deciding whether the locate action is actionable
- Key Management orchestration when deciding whether to run managed-site status checks and expose refresh controls
- any future non-mutating channel review flows that depend on the same guarantee

Rationale:

- the limitation belongs to the managed-site provider, not to one specific screen
- a shared helper prevents the account menu, Key Management, and service-layer fallback from drifting into different Veloera behaviors

Alternative considered:

- duplicate `managedSiteType === VELOERA` checks in each caller
- rejected because the repo already has one Veloera-specific short-circuit, and scattering more checks would make future provider capability changes harder to audit

### 2. Keep the account menu entry visible on Veloera, but disable it with an inline explanation

When managed-site admin config is valid and the active managed-site provider is Veloera, the account "more actions" menu should still render the locate-channel row, but in a disabled state with a visible localized explanation. The explanation should be readable without hover so mobile/touch users are not forced to discover it through a tooltip.

The simplest implementation is to extend `AccountActionMenuItem` with optional secondary text for disabled informational states, then render:

- the existing "Locate channel" label
- disabled styling
- a short Veloera-specific explanation such as "Veloera does not support base-URL channel lookup"

When managed-site config is missing, the current behavior remains unchanged; the user should not see the Veloera-specific hint in place of the existing config gating.

Rationale:

- silently hiding the action makes Veloera look like a local configuration problem
- keeping the row visible shows users that the feature exists in general, while the inline explanation tells them why it is unavailable here

Alternative considered:

- remove the menu item entirely for Veloera
- rejected because it provides no hint and makes the missing feature ambiguous

### 3. Treat Key Management channel status as a page-level unsupported feature on Veloera

Key Management should disable the managed-site channel-status feature earlier than the current service short-circuit:

- `useKeyManagement` should derive an `isManagedSiteChannelStatusSupported` flag from the active managed-site provider
- when the flag is `false`, the hook should skip automatic status queues, skip manual refresh work, and clear or avoid populating per-token managed-site status entries
- `KeyManagement.tsx` / `Header.tsx` should suppress the managed-site status refresh action and show one localized page-level hint in the header description
- `TokenHeader` should not render managed-site status badges, signal badges, or review links for Veloera when the feature is disabled at the page level
- the post-import `refreshManagedSiteTokenStatusForToken` callback should not be passed when the feature is unsupported

Rationale:

- the user asked to disable the feature, not merely classify every token as `unknown`
- a page-level unsupported note avoids repeating the same warning on every token row in long lists
- removing refresh/review affordances prevents users from trying to "fix" a limitation that is not actionable client-side

Alternative considered:

- keep the existing per-token `unknown` status for Veloera and only improve the message copy
- rejected because it still presents managed-site status as an active verification feature and leaves refresh/review affordances conceptually available

### 4. Keep the existing Veloera service short-circuit as a defensive fallback

`getManagedSiteTokenChannelStatus(...)` should continue returning a Veloera unsupported result if called directly, even after UI-level gating stops normal Key Management flows from invoking it. This preserves the current safety net for other callers and keeps the provider limitation encoded near the status-resolution logic.

Tests should cover both layers:

- UI/hook tests proving Veloera no longer queues status checks or exposes refresh/review affordances
- service tests proving direct calls still resolve to the Veloera unsupported path

Rationale:

- UI gating prevents unnecessary work and misleading UX
- service fallback protects against future call sites that bypass the page-level guard

Alternative considered:

- remove the service short-circuit once the UI stops calling it
- rejected because it would make the unsupported behavior easier to regress through new non-UI callers

## Risks / Trade-offs

- [Risk] Users may miss the Key Management unsupported hint if they jump directly into a long token list. -> Mitigation: place the message in the page header description, where the refresh action previously lived conceptually, and keep token rows free of misleading status UI.
- [Risk] Adding secondary text support to account menu items slightly expands a shared component. -> Mitigation: keep the API minimal and only use the extra description path for disabled explanatory states.
- [Risk] The shared capability helper could become too broad if later providers have partial support. -> Mitigation: name it narrowly around reliable base-URL lookup for review/navigation flows, and back it with provider-specific tests.
- [Risk] Some future caller may still invoke token status resolution for Veloera and expect a richer assessment object. -> Mitigation: retain the service-layer unsupported result and document that Veloera does not participate in the shared verification flow.

## Migration Plan

No stored-data or backend migration is required. Implementation can land in safe steps:

1. Add the shared provider capability helper and update service-level tests to keep the Veloera fallback explicit.
2. Update account-menu rendering to show a disabled locate action with visible explanatory copy for Veloera.
3. Gate Key Management status orchestration and refresh UI behind the new capability check, then add the page-level hint and adjust UI tests.

Rollback is code-only: remove the UI gating and helper, while the existing service fallback remains harmless.

## Open Questions

- None at the design level. The only intentional product choice here is that Key Management uses a single page-level unsupported hint rather than repeating a Veloera warning on every token row.
