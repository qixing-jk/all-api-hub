## ADDED Requirements

### Requirement: Managed-site channel import remains available when model preload fails
The system MUST keep the managed-site channel import/export dialog available when a token's live upstream model-list preload fails during dialog preparation.

When the live upstream model-list request does not yield usable models, the system MUST still open the dialog with an editable model field instead of aborting the flow.

#### Scenario: No automatic model source is available
- **WHEN** the user starts exporting a key into a managed-site channel
- **AND** the live upstream model-list request fails or returns no usable models
- **THEN** the system opens the channel dialog successfully
- **AND** the models field remains editable for manual entry
- **AND** the dialog shows a non-blocking warning that automatic model loading failed and models must be entered manually
- **AND** the system MUST NOT abort the import/export flow solely because automatic model preloading failed

### Requirement: Model preload failures do not become fatal preparation errors
The system MUST treat model preload failures during managed-site channel dialog preparation as non-blocking preparation diagnostics rather than fatal action failures.

The system MUST preserve the existing save-time requirement that a created channel contains an explicit final model list.

#### Scenario: Preparation failure is recoverable in the dialog
- **WHEN** a model preload step fails during managed-site channel dialog preparation
- **THEN** the system does not fail the overall action before opening the dialog
- **AND** the user can continue by entering models manually after reading the warning guidance

#### Scenario: Channel creation still requires explicit models
- **WHEN** the managed-site channel dialog is open after a preload failure
- **AND** the models field is still empty
- **THEN** the system keeps channel creation unavailable until the user provides at least one model
