## MODIFIED Requirements

### Requirement: Unsupported Claude Code Hub managed-site actions are not exposed
The extension MUST NOT expose managed-site actions for Claude Code Hub when those actions depend on semantics not implemented for Claude Code Hub.

This includes managed-site model sync, model redirect, and full provider-key reveal unless a later requirement explicitly adds Claude Code Hub support for those actions. Channel migration is supported only through the guarded create-only managed-site migration workflow and MUST remain hidden or unavailable when Claude Code Hub lacks complete configuration or when the selected operation cannot be represented safely.

#### Scenario: Claude Code Hub can be offered in the migration workflow when eligible
- **WHEN** the user opens an existing managed-site channel migration workflow
- **AND** Claude Code Hub has complete saved admin configuration
- **AND** Claude Code Hub is not the active source managed-site type
- **THEN** the extension MUST offer Claude Code Hub as a migration target
- **AND** the extension MUST convert selected source channels into Claude Code Hub provider drafts only through the managed-site migration preview

#### Scenario: Claude Code Hub migration is unavailable when not eligible
- **WHEN** the user opens an existing managed-site channel migration workflow
- **AND** Claude Code Hub does not have complete saved admin configuration or is already the active source managed-site type
- **THEN** the extension MUST NOT offer Claude Code Hub as a migration target
- **AND** the extension MUST NOT automatically convert channels into Claude Code Hub providers outside the managed-site migration workflow

#### Scenario: Claude Code Hub hides unsupported managed-site controls
- **WHEN** the user manages Claude Code Hub channels/providers
- **THEN** the extension MUST hide or disable controls that require unsupported managed-site features
- **AND** disabled controls MUST provide local explanatory copy rather than failing silently

#### Scenario: Full key reveal is not offered without a supported endpoint
- **WHEN** a Claude Code Hub provider row only includes a masked key
- **AND** no supported Claude Code Hub management endpoint is available to retrieve the unmasked provider key
- **THEN** the extension MUST NOT offer a full key reveal action for that provider
