## Why

The Options page currently mixes page shell layers, sticky table surfaces, and portal-based floating UI through unrelated `z-*` values with no shared semantic ordering. That makes bugs like sticky action columns rendering above the mobile sidebar backdrop or drawer a governance problem, not a one-off class bug, and it will keep recurring as more tables and overlays are added.

## What Changes

- Introduce a shared UI layering capability that defines stable semantic roles for page header, backdrop, sidebar or drawer, table sticky cells, table sticky headers, floating menus, modals, and tooltips.
- Evolve the existing `src/constants/designTokens.ts` layering tokens instead of creating a second parallel z-index system.
- Migrate the highest-risk Options surfaces first:
  - Options header, mobile sidebar backdrop, and sidebar drawer
  - Sticky action columns in `ManagedSiteChannels`, `UsageHistorySyncStateTable`, and `AutoCheckin` results
  - Shared floating primitives used by Options flows such as dropdown, popover, select, dialog, combobox, and tooltip
- Document where local hard-coded layering remains temporarily acceptable and where future work must reuse the shared source.
- Preserve current UI structure and behavior where layering is already correct; this change is not a full UI-system redesign.

## Capabilities

### New Capabilities
- `ui-layering-hierarchy`: defines the shared semantic layering contract for Options shell surfaces, sticky tables, and common floating UI so overlay ordering stays predictable and compatible with the current UI architecture.

### Modified Capabilities
None.

## Impact

- Affected code:
  - `src/constants/designTokens.ts`
  - `src/entrypoints/options/components/Header.tsx`
  - `src/entrypoints/options/components/Sidebar.tsx`
  - `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`
  - `src/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncStateTable.tsx`
  - `src/features/AutoCheckin/components/ResultsTable.tsx`
  - Shared floating UI primitives under `src/components/ui/` and `src/components/Tooltip.tsx`
- Affected UX:
  - Sticky table actions remain visible during horizontal scroll without covering the Options drawer or backdrop.
  - Header, sidebar, backdrop, and floating overlays follow one predictable order instead of unrelated numeric z-index choices.
- Validation impact:
  - Options layout and shared floating primitives need staged validation plus one broader related validation because the change touches shared tokens and base overlay components.
