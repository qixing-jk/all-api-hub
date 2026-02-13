## ADDED Requirements

### Requirement: Models probe supports listing models for all supported API types

The system SHALL support running the API Verification `models` probe for all supported API types: OpenAI-compatible, OpenAI, Anthropic, and Google/Gemini.

When the `models` probe runs, it MUST attempt to retrieve a list of available model IDs for the selected API type.

#### Scenario: Models probe passes when models are returned
- **WHEN** the `models` probe runs and one or more model IDs are returned
- **THEN** the probe result status MUST be `pass`
- **AND** the probe result MUST report the model count
- **AND** the probe result MUST include a suggested model ID derived from the returned list

#### Scenario: Models probe fails when no models are returned
- **WHEN** the `models` probe runs and zero model IDs are returned
- **THEN** the probe result status MUST be `fail`
- **AND** the probe result MUST indicate that no models were returned

### Requirement: Models probe selects the correct listing endpoint per API type

The system SHALL use the correct model listing endpoint path for the selected API type:

- OpenAI-compatible/OpenAI/Anthropic: `/v1/models`
- Google/Gemini: `/v1beta/models`

The probe result MUST expose the selected endpoint path in its input diagnostics.

#### Scenario: OpenAI-family API types use `/v1/models`
- **WHEN** the `models` probe runs for OpenAI-compatible, OpenAI, or Anthropic
- **THEN** the probe input diagnostics MUST report `endpoint` as `/v1/models`

#### Scenario: Google-family API type uses `/v1beta/models`
- **WHEN** the `models` probe runs for Google/Gemini
- **THEN** the probe input diagnostics MUST report `endpoint` as `/v1beta/models`

### Requirement: Models probe summaries are sanitized

The system SHALL sanitize `models` probe failure summaries and MUST NOT include any secrets.

#### Scenario: Failure summary redacts secrets
- **WHEN** the `models` probe fails and the error message contains a secret string
- **THEN** the probe result summary MUST redact that secret string

### Requirement: Verification suite can resolve model id via the models probe

When running the API Verification suite, the system SHALL run the `models` probe first for all supported API types.

If the caller does not provide a model id, the system MUST use the `models` probe suggested model id for subsequent probes that require a model id.

#### Scenario: Suite uses suggested model id when caller omits it
- **WHEN** the suite runs with no explicit model id
- **AND** the `models` probe returns a suggested model id
- **THEN** the suite MUST use that model id to run the remaining probes that require a model id
- **AND** the verification report MUST expose the resolved model id
