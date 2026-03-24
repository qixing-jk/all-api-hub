## 1. Recon and Shared Source

- [x] 1.1 Confirm the current layering inventory across `src/constants/designTokens.ts`, `src/entrypoints/options/components/Header.tsx`, `src/entrypoints/options/components/Sidebar.tsx`, `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`, `src/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncStateTable.tsx`, `src/features/AutoCheckin/components/ResultsTable.tsx`, and the shared floating primitives under `src/components/ui/` before changing behavior.
- [x] 1.2 Evolve the existing `Z_INDEX` tokens in `src/constants/designTokens.ts` into finer semantic roles for sticky tables, page shell layers, floating overlays, modal surfaces, and tooltips without introducing a second parallel layering source.

## 2. High-Risk Surface Migration

- [x] 2.1 Migrate the Options page header, mobile sidebar backdrop, and sidebar drawer to the shared semantic layering roles, keeping the current layout and animation behavior intact.
- [x] 2.2 Migrate sticky action headers and sticky action cells in `ManagedSiteChannels`, `UsageHistorySyncStateTable`, and `AutoCheckin` results to the shared sticky-table roles so horizontal scrolling remains usable without outranking the drawer or backdrop.
- [x] 2.3 Migrate shared floating primitives used by Options flows (`dropdown-menu`, `popover`, `select`, `dialog`, `combobox`, and `Tooltip`) to the shared overlay roles, and add brief comments only where portal or stacking-context constraints would otherwise be non-obvious.

## 3. Deferred and Local Exceptions

- [x] 3.1 Review remaining hard-coded `z-*` usages touched by the inventory and keep only the isolated local cases that do not compete with page-level layering, documenting the retained out-of-scope cases in the change artifacts.

## 4. Verification

- [x] 4.1 Run `pnpm run validate:staged` as the minimum staged-validation equivalent for the touched Options and shared UI surfaces.
- [x] 4.2 Because the change touches shared tokens and base floating primitives, run one broader related validation command for the affected UI surface area and document any blockers or retained risks.
