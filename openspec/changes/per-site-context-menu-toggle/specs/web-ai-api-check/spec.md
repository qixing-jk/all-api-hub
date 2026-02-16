# Web AI API Check

## MODIFIED Requirements

### Requirement: Manual context-menu trigger opens an in-page API Check modal

When the “AI API Check” context menu entry is enabled in settings, the system SHALL provide a browser context-menu entry that opens an in-page “AI API Check” modal on the current webpage.

The manual trigger MUST be available regardless of auto-detect settings and whitelist configuration.

The modal MUST open on user request even when no API credentials can be extracted from the current selection, so the user can paste or edit values manually.

#### Scenario: Open modal from selected text
- **GIVEN** the “AI API Check” context menu entry is enabled in settings
- **WHEN** the user selects text on a webpage and triggers “AI API Check” from the context menu
- **THEN** the system opens a centered in-page modal on the current webpage
- **AND** it pre-fills extracted values from the selected text when possible

#### Scenario: Open modal with no selection
- **GIVEN** the “AI API Check” context menu entry is enabled in settings
- **WHEN** the user triggers “AI API Check” from the context menu without selecting any text
- **THEN** the system opens the modal with empty inputs ready for manual entry
