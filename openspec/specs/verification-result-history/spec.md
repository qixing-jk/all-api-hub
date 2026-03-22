# verification-result-history Specification

## Purpose
Define requirements for persisting sanitized AI API verification summaries for durable verification targets and surfacing or clearing that history across existing verification UI.

## Requirements
### Requirement: Supported verification targets persist the latest sanitized probe summary
The system SHALL persist the latest AI API verification summary for supported durable verification targets after probe execution completes.

Supported targets MUST include:
- stored API credential profiles
- model-scoped verification launched from Model Management for stored profiles
- model-scoped verification launched from Model Management for stored accounts

Persisted verification records MUST include only sanitized summary metadata needed for later rendering, including timestamps, overall status, per-probe status, latency, summary key, and bounded fallback summary text.

Persisted verification records MUST NOT include raw API keys, raw request payloads, raw response payloads, or unsanitized provider error bodies.

#### Scenario: Profile verification persists a latest summary
- **WHEN** the user runs AI API verification for a stored API credential profile
- **THEN** the system persists the latest sanitized verification summary for that profile target
- **AND** the persisted summary is available after the dialog is closed and reopened

#### Scenario: Model-scoped verification persists separately from other models
- **WHEN** the user runs AI API verification for a specific model row in Model Management
- **THEN** the system persists the latest sanitized verification summary for that source-and-model target
- **AND** that summary does not overwrite the verification summary for a different model target

#### Scenario: Persisted verification omits secrets and transient diagnostics
- **WHEN** the system saves a verification summary
- **THEN** the stored record excludes raw API keys and transient input/output diagnostics
- **AND** any persisted fallback message is sanitized before storage

### Requirement: Existing list and detail surfaces show the latest verification status
The system SHALL surface the latest persisted verification status and verified-at timestamp in existing list/detail UI surfaces for supported verification targets.

The status presentation MUST distinguish at least `pass`, `fail`, and `unverified`.

#### Scenario: Profile list shows last verified summary
- **GIVEN** a stored API credential profile has a persisted verification summary
- **WHEN** the user views the API Credential Profiles list
- **THEN** the profile row shows the latest verification status
- **AND** the row shows when the profile was last verified

#### Scenario: Model row shows last verified summary
- **GIVEN** a model-scoped verification summary exists for a Model Management row
- **WHEN** the user views that model row again
- **THEN** the model row shows the latest verification status
- **AND** the row shows when that model target was last verified

#### Scenario: Reopening a verification dialog restores the latest persisted summary
- **GIVEN** a supported verification target has a persisted latest summary
- **WHEN** the user reopens the corresponding AI API verification dialog
- **THEN** the dialog shows the previously persisted probe summaries before a new run starts
- **AND** the user can review the last verified status without rerunning probes

### Requirement: Users can clear persisted verification history for the current target
The system SHALL provide a clear-history action for supported verification targets that removes the persisted latest verification summary without deleting the underlying account or profile.

After clearing, the UI MUST return to the `unverified` state for that target.

#### Scenario: Clearing profile verification history resets the row summary
- **GIVEN** a stored API credential profile has a persisted verification summary
- **WHEN** the user clears verification history for that profile
- **THEN** the persisted summary for that profile target is removed
- **AND** the profile row shows `unverified`

#### Scenario: Clearing model-scoped verification history resets the dialog bootstrap state
- **GIVEN** a model-scoped verification summary exists for a Model Management row
- **WHEN** the user clears verification history for that model target
- **THEN** reopening the corresponding verification dialog shows no persisted probe summary
- **AND** the target is treated as `unverified` until probes are run again
