## ADDED Requirements

### Requirement: Modal-contained floating overlays remain interactive
The system MUST render floating overlays opened from within a modal above the owning modal surface so that users can see and interact with them.

#### Scenario: Modal-contained group selector remains selectable
- **WHEN** a user opens a modal that contains a searchable group selector
- **AND** the selector opens its floating overlay
- **THEN** the floating overlay MUST render above the modal surface
- **AND** the user MUST be able to select a non-default option from that overlay

### Requirement: Page-shell layering remains stable when modal-contained floating is fixed
The system MUST preserve the page-shell layering hierarchy for sticky headers, sticky table cells, sidebars, and shared backdrops while fixing modal-contained floating overlays.

#### Scenario: Modal does not fall behind page-shell layers
- **WHEN** a modal is opened on a page with sticky headers, sticky cells, or sidebars
- **THEN** the modal surface and its backdrop MUST continue to render above those page-shell layers

### Requirement: Shared floating primitives support contained overlay layering
The system MUST provide a shared layering role for floating primitives that are hosted inside modal surfaces instead of relying on mount order or one-off z-index overrides.

#### Scenario: Shared popover-based controls use modal-contained floating layer
- **WHEN** a shared popover, select, dropdown menu, or combobox popup is opened from within a modal
- **THEN** the shared primitive MUST use the modal-contained floating layer
- **AND** callers MUST NOT need to introduce ad hoc per-feature z-index hacks to restore interaction
