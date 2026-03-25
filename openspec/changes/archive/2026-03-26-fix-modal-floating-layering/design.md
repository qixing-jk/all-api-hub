## Context

The nearest existing abstractions are:

- `Z_INDEX` in `src/constants/designTokens.ts`
  Reuse and extend this shared token map instead of reintroducing scattered raw `z-*` classes.
- Shared floating primitives in `src/components/ui/popover.tsx`, `src/components/ui/select.tsx`, `src/components/ui/dropdown-menu.tsx`, and `src/components/ui/combobox.tsx`
  Extend these components so they can render in the correct layer context, rather than patching individual callers with bespoke class overrides.
- Modal hosts in `src/components/ui/Dialog/Modal.tsx` and `src/components/ui/dialog.tsx`
  Preserve the current modal-layer semantics; do not lower the modal just to make nested floaters work.
- Modal-contained consumers such as `SearchableSelect` and token-management dialogs
  Reuse them as verification targets, not as new abstraction points.

The regression came from treating all floating surfaces as one class of layer. `#658` correctly separated page-shell layers from modal layers, but it still assumed modal-contained floaters could share the same layer as page-level floaters. That assumption is false for portal-based dropdowns and popovers opened from inside a modal.

## Goals / Non-Goals

**Goals:**
- Preserve the page-shell layering improvements introduced for sticky headers, sticky table cells, sidebars, and shared backdrops.
- Ensure popovers, selects, dropdown menus, and combobox popups opened from inside a modal render above the modal surface and remain interactive.
- Keep the solution centralized in shared layering tokens and shared floating primitives.
- Add focused validation that covers modal-contained floating interaction.

**Non-Goals:**
- Reverting the entire `#658` layering cleanup.
- Redesigning all overlay primitives around a new portal system.
- Changing unrelated animation, spacing, or visual styling.
- Introducing per-feature one-off z-index overrides unless a shared primitive cannot be safely extended.

## Decisions

### Decision: Split floating layers into page-level and modal-contained roles

`Z_INDEX` will distinguish between page-level floating surfaces and modal-contained floating surfaces.

Why:
- The regression is caused by a missing semantic layer, not by the idea of shared tokens itself.
- A dedicated modal-contained floating role makes the intended ordering explicit and reviewable.
- It avoids relying on DOM mount order or historical `z-50` accidents.

Alternatives considered:
- Revert all of `#658`.
  Rejected because it would also discard the sticky/page-shell layering fixes.
- Raise every floating surface above modals.
  Rejected because page-level dropdowns should still sit below open modals.

### Decision: Extend shared floating primitives instead of patching individual dialogs

Shared primitives such as `PopoverContent`, `SelectContent`, dropdown menu content, and combobox content will accept or infer the appropriate layer role for modal-contained usage.

Why:
- The bug affects a class of controls, not just one dialog.
- Fixing the primitives once prevents future modal-contained selectors from repeating the same issue.
- This keeps layering policy close to the components that portal content.

Alternatives considered:
- Add local class overrides only in Add Token dialog.
  Rejected because it would leave the same hazard in other modal-hosted selectors.

### Decision: Preserve modal z-index and lift contained floaters above it

The modal layer remains above page-shell layers. Modal-contained floaters move above the modal instead of lowering the modal back down.

Why:
- The modal must continue to dominate page-level floating UI and sticky surfaces.
- Lowering the modal would re-open the page-shell issues that `#658` set out to fix.

Alternatives considered:
- Put modal and contained floaters back on the same z-index.
  Rejected because it returns to mount-order-dependent behavior.

### Decision: Validate with a real modal-contained selector path

The verification surface will include both shared-primitive coverage for modal-hosted floating layers and an interaction test that opens a modal-contained selector and changes the selected value in the built extension runtime.

Why:
- Pure unit assertions on options are insufficient for layering regressions.
- The token-management group selector already reproduces the problem and is a stable regression target.
- A browser-runtime check reduces the risk that portal layering appears correct in jsdom but regresses in the actual extension page.

## Risks / Trade-offs

- [Risk] Some page-level floating components may accidentally be upgraded to the modal-contained layer. → Mitigation: keep the new role opt-in or context-driven only for modal-hosted primitives.
- [Risk] Different modal implementations (`HeadlessUI Modal` and Radix `Dialog`) may need the same layering contract. → Mitigation: validate both token definitions and shared primitive usage, not only one modal host.
- [Risk] The current fix may still rely on manual caller wiring if no shared context exists yet. → Mitigation: keep the first change minimal and localized to shared primitives, then follow up with context automation only if repeated call-site wiring appears.

## Migration Plan

- Add the missing modal-contained floating layer token.
- Update shared floating primitives to use that token for modal-contained usage.
- Verify modal-contained selectors and page-shell layering together with shared primitive tests and a browser-runtime Add Token selector flow.
- If a regression is discovered, rollback can target the new modal-contained floating token wiring without removing the broader `#658` page-shell ordering.

## Open Questions

- Should modal-contained floating be inferred automatically from a dialog context, or should shared primitives take an explicit layering prop initially?
- Are there any non-modal host surfaces, such as drawers or side panels, that also need a distinct contained-floating layer later?
