## Why

The recent UI layering change stabilized sticky tables and shared page overlays, but it also made modal-contained popovers render below the modal surface. That breaks interactive controls such as the Add Token group selector, where the dropdown opens behind the dialog and becomes effectively unselectable.

## What Changes

- Introduce a distinct layering rule for floating surfaces that are opened from within a modal.
- Keep the page-shell layering introduced for sticky headers, sidebars, and backdrops intact.
- Update shared floating primitives so modal-contained popovers, selects, comboboxes, and dropdown menus render above the owning modal instead of below it.
- Add focused validation at both the shared-primitive level and the real Add Token browser flow, so future layering work cannot silently regress these interactions.

## Capabilities

### Modified Capabilities
- `ui-layering-hierarchy`: extend the existing layering hierarchy so modal-contained floating overlays are distinguished from page-level floating overlays without disturbing page-shell ordering.

## Impact

- Affected code:
  - `src/constants/designTokens.ts`
  - shared floating primitives under `src/components/ui/`
  - `src/components/ui/Dialog/Modal.tsx`
  - modal-hosted controls that depend on shared popover/select behavior
- Affected UX:
  - dropdown-like controls opened inside dialogs must remain selectable
  - sticky tables, headers, and sidebars must keep the stabilized layering from `#658`
- Validation impact:
  - add shared primitive tests for modal-hosted select, dropdown, and combobox layers
  - add focused interaction coverage for the Add Token group selector path
  - add a browser-runtime E2E check that the modal-hosted selector remains clickable in the built extension
