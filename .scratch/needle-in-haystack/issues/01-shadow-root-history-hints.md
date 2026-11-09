# History hint popups cannot resolve webpage shadow-root anchors

Status: ready-for-agent
Scope: shared Tooltip shadow-root compatibility; follow-up to the behavior-preserving verification refactor.

## Evidence

The webpage needle workflow restores measurements and exposes the history text through the badge's accessible description, but clicking its `Previously: ...` button does not open a tooltip. Native extension-page badges do open their hints.

The source before this refactor (`a935cb9778`) already uses `VerificationHistoryBadge` with `anchorAsChild`, `openOnClick`, and a `document.body` portal. `react-tooltip` resolves `anchorId` through `document.querySelector`, which cannot find the anchor inside the webpage check's ShadowRoot. Its outside-click handler also uses document-level anchor lookup; changing the portal alone cannot establish correct interaction.

The failing browser assertion clicked the restored needle history badge, then expected `page.getByRole("tooltip").filter({ hasText: "History keeps measurements" })` to be visible. This failed deterministically after the provider requests and history readback succeeded. Local diagnostic evidence is retained in `../artifacts/scout-refactor-20261109/e2e-web-fixed.log` and `../artifacts/scout-refactor-20261109/e2e-web-fixed/`. These are local ignored artifacts, not published evidence.

## Completion conditions

- Add focused shadow-root regression coverage before changing the shared anchor/positioning mechanism; prefer an existing ref-based floating-layer primitive over document selector workarounds.
- Verify hover, keyboard focus, click/touch, Escape, and outside-click dismissal in native and webpage workspaces. Escape must dismiss the hint before its containing verification dialog.
- Preserve the accessible history description, clipping behavior, and distinct history appearance. Review real native and shadow-root rendering.
- Re-run the webpage needle history workflow and representative existing Tooltip/Modal consumers. The current refactor's passing request/history tests do not establish popup compatibility.

This changes existing shared compatibility behavior and is intentionally not included in the pure refactor. No Tooltip production code was changed by that refactor.
