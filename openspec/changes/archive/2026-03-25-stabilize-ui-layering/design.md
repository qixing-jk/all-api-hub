## Context

The current Options UI mixes several kinds of layers that operate at different scopes:

- Page shell layers:
  - `Header.tsx` uses `sticky top-0 z-50`
  - `Sidebar.tsx` uses a mobile backdrop at `z-30` and a drawer at `z-40`
- Sticky table surfaces:
  - `ManagedSiteChannels.tsx`, `UsageHistorySyncStateTable.tsx`, and `ResultsTable.tsx` hard-code sticky action headers and cells with `z-20` or `z-10`
- Shared floating primitives:
  - `popover.tsx`, `dropdown-menu.tsx`, `select.tsx`, `dialog.tsx`, and `combobox.tsx` hard-code `z-50`
  - `Tooltip.tsx` hard-codes `z-9999`
- Existing design token source:
  - `src/constants/designTokens.ts` exports `Z_INDEX`, but it only contains coarse buckets such as `sticky`, `fixed`, `popover`, and `modal`
  - those tokens are currently exported but not actually consumed by the high-risk Options shell or shared floating primitives

The current token names are too coarse to encode the real layering relationships now present in the app. In practice, the Options page needs to distinguish at least:

- ordinary content
- table sticky cell
- table sticky header
- page header
- backdrop or overlay
- sidebar or drawer
- shared floating menu or popover
- modal or dialog
- tooltip

The main technical risk is not only numeric `z-index` collisions. Several components also create local stacking contexts:

- `Sidebar.tsx` applies `transform` to the drawer container, which creates a stacking context
- sticky table cells operate inside nested `overflow-auto` containers
- Radix/Base UI floating content portals escape local DOM hierarchy and compete at the document level
- `combobox.tsx` explicitly uses `isolate`

The nearest existing abstractions are:

- `src/constants/designTokens.ts`
  Reuse and extend this as the only shared source of global z-index semantics.
- `src/entrypoints/options/components/Header.tsx` and `Sidebar.tsx`
  Reuse these components and replace their raw z-index classes with semantic token usage.
- `src/components/ui/popover.tsx`, `dropdown-menu.tsx`, `select.tsx`, `dialog.tsx`, and `combobox.tsx`
  Reuse these base primitives as the shared application-level floating entry points instead of patching every call site.
- `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`, `src/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncStateTable.tsx`, and `src/features/AutoCheckin/components/ResultsTable.tsx`
  Extend these high-risk table surfaces first because they currently hard-code sticky action layers and reproduce the same bug pattern.

## Goals / Non-Goals

**Goals:**
- Define a single semantic layering order for Options shell surfaces, sticky tables, and common floating UI.
- Evolve `src/constants/designTokens.ts` instead of creating a second parallel token system.
- Ensure sticky action columns remain visible during horizontal scroll but stay below the sidebar and backdrop when those are visible.
- Ensure sticky headers render above sticky cells without outranking page-level overlays, menus, or dialogs.
- Make portal-based floating primitives participate in the same shared hierarchy so their ordering is intentional rather than incidental.
- Fix the highest-risk current conflict points with the smallest practical code change.

**Non-Goals:**
- Redesign the entire UI system or restyle every component that currently uses a `z-*` class.
- Normalize every local component-internal overlay in the repository during this change.
- Introduce ownership-specific layering rules for every possible future overlay combination.
- Change content-script overlay strategy that intentionally uses extreme z-index values to escape arbitrary host pages.

## Decisions

### Decision: Evolve the existing `Z_INDEX` token source instead of creating a second layering system

`src/constants/designTokens.ts` will remain the single shared source for application-level z-index semantics. The current coarse keys will be replaced or expanded with finer semantic roles such as:

- `tableStickyCell`
- `tableStickyHeader`
- `pageHeader`
- `backdrop`
- `sidebar`
- `floating`
- `modal`
- `tooltip`

Why:
- The existing file already represents the repo’s design-token home, so extending it is the narrowest compatible change.
- The current bug exists partly because the existing tokens are too generic to express the actual relationships we need.
- A second token file or helper would recreate the same ambiguity under a different name.

Alternatives considered:
- Add a new `layering.ts` helper next to `designTokens.ts`.
  Rejected because it would create a parallel source of truth for the same concern.
- Keep current token names and only change the numeric values.
  Rejected because names like `sticky` and `fixed` still do not distinguish sticky headers from sticky cells or sidebar from backdrop.

### Decision: Use a finer semantic ordering that separates structural layout surfaces from sticky table surfaces

The shared ordering will be defined from lower to higher priority roughly as:

1. regular page content
2. `tableStickyCell`
3. `tableStickyHeader`
4. `pageHeader`
5. `backdrop`
6. `sidebar`
7. `floating`
8. `modal`
9. `tooltip`

Why:
- Sticky cells need to stay above scrolled table content, but they do not represent page-level overlays.
- Sticky headers must stay above sticky cells to keep labels readable while scrolling.
- Header, backdrop, and sidebar are structural layout layers and must not be preempted by table internals.
- Shared floating menus need a consistent tier above page shell surfaces because they portal to `document.body` today and can be opened from header- or drawer-owned controls.
- Modal and tooltip remain above ordinary floating content to preserve expected focus and affordance behavior.

Alternatives considered:
- Keep floating menus below sidebar or backdrop.
  Rejected for this change because current shared primitives portal to the document root and some are used from page-shell controls; moving them below drawer layers would require additional per-owner portal-container work.
- Collapse sticky header and sticky cell into one `sticky` tier.
  Rejected because the table already has two distinct visual roles and the user requirement explicitly needs the header above the sticky cell.

### Decision: Treat sticky table roles as shared application semantics, not per-table local guesses

The three high-risk tables will stop hard-coding `z-10` and `z-20` directly and will instead read from the shared token source for:

- sticky action cell
- sticky action header

Why:
- The same right-sticky action pattern already exists in multiple Options tables.
- Fixing only one table would leave the repository open to immediate regression the next time another table is added or copied.
- Shared semantic naming makes it obvious that `sticky header > sticky cell`, whereas `z-20 > z-10` does not explain intent.

Alternatives considered:
- Patch only the specific table currently reported as broken.
  Rejected because the same bug pattern already exists in at least three tables.
- Create a new shared table wrapper in this change.
  Rejected because it is broader than necessary; the current tables can adopt shared token usage with smaller edits.

### Decision: Shared portal-based floating primitives must consume the same global tier definitions

Base application floaters such as dropdown, popover, select, combobox, dialog, and tooltip will use the semantic z-index source instead of hard-coded `z-50` or `z-9999`.

Why:
- Portal-based components do not inherit the stacking assumptions of their trigger location.
- If portal content keeps using unrelated numbers, page-shell fixes can still be undermined by a later floating component.
- Updating shared primitives gives the repo one stable entry point for common overlay behavior without editing every call site.

Alternatives considered:
- Leave shared primitives alone and only patch Options shell surfaces.
  Rejected because the change goal includes predictable ordering between common floating UI and fixed layout surfaces.
- Force all portal-based components to render inside their local owner container.
  Rejected because it would be a larger architectural change and is not necessary to resolve the current structural conflict.

### Decision: Keep component-local z-index hard-coding only for isolated, non-global cases

This change will continue allowing local hard-coded z-index usage only when the layer does not compete with app-shell or document-level surfaces, for example:

- content-script overlays that intentionally use extreme values like `z-2147483647` to escape arbitrary host websites
- local drag or loading overlays that only need to order content inside an already bounded surface
- close buttons or local adornments inside an already-layered modal or card

Why:
- Not every `z-*` is a global layering contract.
- Forcing every local internal surface through the shared token set would create noise without reducing the current regression risk.

Alternatives considered:
- Replace every `z-*` in the repository.
  Rejected because it is out of scope and would add unnecessary regression risk.

## Risks / Trade-offs

- [Risk] Floating menus will remain globally above sidebar and backdrop because current shared primitives portal to the document root. → Mitigation: document this compatibility trade-off now, keep sticky table surfaces safely below structural overlays, and treat owner-specific portal layering as a follow-up only if it becomes a real UX issue.
- [Risk] Existing local hard-coded overlays outside the migrated surface area can still introduce future collisions. → Mitigation: centralize the app-level roles now and document that future page-shell or floating surfaces must use the shared source.
- [Risk] `transform`, `sticky`, `overflow`, and `isolate` can still confuse developers even when numeric values are correct. → Mitigation: keep page-level overlays assigned at the outer rendered surface, keep portal components on shared tiers, and avoid relying on descendant-local numbers to beat parent stacking contexts.
- [Risk] Changing shared floating primitives affects surfaces outside the Options page. → Mitigation: keep the new ordering compatible with existing relative expectations and run one broader related validation after staged validation.

## Migration Plan

- Step 1: inventory and document the current layering roles plus the known conflict points.
- Step 2: evolve `Z_INDEX` into finer semantic roles and migrate the Options header, sidebar backdrop, and sidebar drawer to those roles.
- Step 3: migrate the three known sticky-table action surfaces to shared `tableStickyCell` and `tableStickyHeader` roles.
- Step 4: migrate shared floating primitives to the shared `floating`, `modal`, and `tooltip` roles.
- Step 5: leave isolated local hard-coded z-index usage untouched, but note the retained cases in the change artifacts.
- Retained local or out-of-scope cases for this change:
  - `src/entrypoints/content/**` overlays that use `z-2147483647` remain unchanged because they must escape arbitrary host-page stacking.
  - local drag or inline loading surfaces such as sortable list items, repeatable inputs, dialog-internal spinners, and modal close buttons remain unchanged because they only compete inside an already bounded surface.
  - local menu implementations such as `src/components/ui/MultiSelect.tsx`, `src/features/AccountManagement/components/AccountActionButtons/index.tsx`, and `src/features/SiteBookmarks/components/BookmarkListItem.tsx` remain unchanged because they are not part of the shared base overlay primitives migrated here; if they later conflict with page-shell surfaces, a follow-up change should either move them onto the shared primitives or document a component-scoped ownership rule.
- Rollback is straightforward: revert the token expansion and the few affected consumers if a shared ordering regression appears.

## Open Questions

- Do we eventually need separate floating tiers for page-owned menus versus overlay-owned menus, or is one shared `floating` tier sufficient for current product surfaces?
- Should a later cleanup introduce shared helper class names for sticky action columns and sticky headers after this change proves the semantic ordering works as intended?
