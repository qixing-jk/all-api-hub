## 1. Recon and Reuse

- [ ] 1.1 Inspect `src/constants/designTokens.ts`, `src/components/ui/Dialog/Modal.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/popover.tsx`, `src/components/ui/select.tsx`, `src/components/ui/dropdown-menu.tsx`, `src/components/ui/combobox.tsx`, and the nearest modal-hosted selector flows before changing behavior.
- [ ] 1.2 Confirm which shared floating primitives can be extended for modal-contained layering so the fix does not introduce one-off z-index overrides in feature code.

## 2. Layering Model

- [ ] 2.1 Update the shared `Z_INDEX` model to distinguish page-shell floating surfaces from modal-contained floating surfaces while preserving the page-shell ordering introduced by `#658`.
- [ ] 2.2 Update shared floating primitives to use the modal-contained floating layer where appropriate, and add brief clarifying comments where the contained-vs-page layering rule is non-obvious.

## 3. Regression Coverage

- [ ] 3.1 Verify the Add Token / modal-hosted searchable selector path uses the corrected shared layering behavior without reintroducing local z-index hacks.
- [ ] 3.2 Add or update focused tests for modal-contained floating interaction and page-shell layering expectations in the nearest existing test suites.

## 4. Verification

- [ ] 4.1 Run `pnpm lint` and the smallest related automated test command covering modal-contained floating controls; if the shared primitive impact warrants it, broaden to compile or additional related tests and document any blockers.
