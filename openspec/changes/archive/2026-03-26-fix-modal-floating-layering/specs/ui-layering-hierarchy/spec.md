## MODIFIED Requirements

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

### Requirement: Page-shell layering remains stable when modal-contained floating is fixed
The system MUST preserve the page-shell layering hierarchy for sticky headers, sticky table cells, sidebars, and shared backdrops while fixing modal-contained floating overlays.

#### Scenario: Modal does not fall behind page-shell layers
- **WHEN** a modal is opened on a page with sticky headers, sticky cells, or sidebars
- **THEN** the modal surface and its backdrop MUST continue to render above those page-shell layers

#### Scenario: Browser-runtime Add Token flow remains clickable
- **WHEN** the built extension opens the Add Token dialog in the Key Management page
- **AND** the dialog-hosted group selector opens its floating overlay
- **THEN** the user MUST be able to click and apply a non-default group selection in the real browser runtime
