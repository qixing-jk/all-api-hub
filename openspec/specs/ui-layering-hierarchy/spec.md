# ui-layering-hierarchy Specification

## Purpose
Ensure the Options page shell surfaces, sticky table layers, and shared floating primitives consume the same semantic layering source so their relative stacking order is predictable and configurable from the existing design-token system, including modal-contained floating overlays that must remain interactive above their owning dialogs.

## Requirements
### Requirement: Options layering roles MUST use a shared semantic source
The system MUST define application-level layering roles for the Options page and shared overlay primitives from one shared source in the existing design-token system. That shared source MUST be expressive enough to distinguish at least `tableStickyCell`, `tableStickyHeader`, `pageHeader`, `backdrop`, `sidebar`, `floating`, `modal`, and `tooltip`.
The system MUST NOT introduce a second parallel z-index token system for these roles unless a documented migration plan explicitly proves that the existing token source cannot be evolved safely.

#### Scenario: Options shell layers consume one shared source
- **WHEN** the Options page renders its header, sidebar backdrop, sidebar drawer, sticky table surfaces, and shared floating primitives
- **THEN** those layers MUST use one shared semantic layering source
- **AND** that source MUST be the evolved existing design-token system rather than a new parallel z-index registry

#### Scenario: A new page-level surface is added after this change
- **WHEN** a new Options page shell surface or shared overlay surface needs application-level layering
- **THEN** it MUST map to the shared semantic layering source
- **AND** it MUST NOT introduce another unrelated global z-index convention for the same scope

### Requirement: Sticky table surfaces MUST preserve scroll visibility without outranking page shell overlays
The system MUST keep sticky action columns visible during horizontal scrolling while ensuring they remain below page-level backdrop and sidebar surfaces. Sticky table headers MUST render above sticky table cells, but MUST NOT outrank page-level overlays or shared floating surfaces.

#### Scenario: Sticky actions stay visible during horizontal scroll
- **WHEN** the user horizontally scrolls a table with a sticky actions column in the Options page
- **THEN** the sticky actions column MUST remain visible and aligned to the table edge
- **AND** the sticky actions layer MUST remain above ordinary scrolling table content

#### Scenario: Sidebar and backdrop outrank sticky table actions
- **WHEN** the mobile sidebar drawer or its backdrop is visible above an Options table with sticky action cells
- **THEN** the table's sticky action cells and sticky action headers MUST render below the backdrop and drawer
- **AND** the sticky table surface MUST NOT visually cover or intercept the drawer-facing layer

#### Scenario: Sticky header outranks sticky cell without outranking page overlays
- **WHEN** a table uses both a sticky header surface and a sticky action cell surface
- **THEN** the sticky header MUST render above the sticky cell
- **AND** both surfaces MUST remain below page-level overlay layers such as the backdrop, sidebar, modal, and tooltip tiers

### Requirement: Shared floating primitives MUST participate in the same hierarchy across portal boundaries
The system MUST assign common floating primitives such as dropdown, popover, select, combobox, dialog, and tooltip to shared semantic overlay tiers so their ordering remains predictable even when they render through portals or inside transformed or isolated containers.
The system MUST distinguish page-level floating overlays from modal-contained floating overlays so page-level floaters stay below open modals while modal-contained floaters remain visible and interactive above the owning modal surface.

#### Scenario: Portal-based floating content uses shared overlay tiers
- **WHEN** a shared floating primitive renders its content through a portal
- **THEN** the rendered content MUST use the shared semantic overlay tier assigned to its role
- **AND** it MUST NOT rely on an unrelated hard-coded global z-index value

#### Scenario: Modal-contained group selector remains selectable
- **WHEN** a user opens a modal that contains a searchable group selector
- **AND** the selector opens its floating overlay
- **THEN** the floating overlay MUST render above the modal surface
- **AND** the user MUST be able to select a non-default option from that overlay

#### Scenario: Modal-contained floating layer is exercised in shared primitives
- **WHEN** a shared select, dropdown menu, or combobox popup is opened from within a modal host
- **THEN** the shared primitive MUST use the modal-contained floating layer
- **AND** the validation suite MUST cover that shared behavior without relying only on one feature-specific dialog path

#### Scenario: Modal and tooltip tiers remain ordered above ordinary floating content
- **WHEN** ordinary floating content, dialog content, and tooltip content are all present in the application
- **THEN** dialog or modal surfaces MUST render above ordinary floating content
- **AND** tooltip surfaces MUST render above both ordinary floating content and modal surfaces

#### Scenario: Browser-runtime Add Token flow remains clickable
- **WHEN** the built extension opens the Add Token dialog in the Key Management page
- **AND** the dialog-hosted group selector opens its floating overlay
- **THEN** the user MUST be able to click and apply a non-default group selection in the real browser runtime
