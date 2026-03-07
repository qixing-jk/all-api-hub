# cli-proxy-provider-type-import Specification

## Purpose
Define requirements for importing credentials into CLIProxyAPI with an explicit provider type and provider-family-specific endpoint normalization.

## ADDED Requirements

### Requirement: CLIProxy import exposes provider type selection
The system SHALL show a provider type selector in the CLIProxy import dialog.

The selector MUST support the following CLIProxy provider families:
- `openai-compatibility`
- `codex-api-key`
- `claude-api-key`
- `gemini-api-key`

The selected provider type MUST be included in the submitted import request.

#### Scenario: Account or token import opens with OpenAI-compatible default
- **WHEN** the user opens the CLIProxy import dialog from an account or token flow that does not carry an explicit API-type hint
- **THEN** the dialog MUST preselect `openai-compatibility`
- **AND** the user MUST be able to change the provider type before submitting

### Requirement: Source API type preselects the matching CLIProxy provider family
When the source credentials include an explicit API type hint, the system MUST preselect the matching CLIProxy provider family.

The required mapping is:
- `openai-compatible` → `openai-compatibility`
- `openai` → `codex-api-key`
- `anthropic` → `claude-api-key`
- `google` → `gemini-api-key`

#### Scenario: OpenAI profile maps to Codex
- **WHEN** the user opens the CLIProxy import dialog from an API credential profile whose `apiType` is `openai`
- **THEN** the dialog MUST preselect `codex-api-key`
- **AND** it MUST NOT preselect `openai-compatibility`

#### Scenario: OpenAI-compatible profile maps to OpenAI compatibility
- **WHEN** the user opens the CLIProxy import dialog from an API credential profile whose `apiType` is `openai-compatible`
- **THEN** the dialog MUST preselect `openai-compatibility`

#### Scenario: Anthropic profile maps to Claude
- **WHEN** the user opens the CLIProxy import dialog from an API credential profile whose `apiType` is `anthropic`
- **THEN** the dialog MUST preselect `claude-api-key`

#### Scenario: Google profile maps to Gemini
- **WHEN** the user opens the CLIProxy import dialog from an API credential profile whose `apiType` is `google`
- **THEN** the dialog MUST preselect `gemini-api-key`

### Requirement: Import fields adapt to the selected provider family
The CLIProxy import dialog MUST change its visible inputs and validation rules when the selected provider type changes.

The dialog MUST enforce the following field behavior:
- `providerName` MUST be shown only for `openai-compatibility`
- `baseUrl` MUST be required for `openai-compatibility` and `codex-api-key`
- `baseUrl` MUST be optional for `claude-api-key` and `gemini-api-key`
- when `baseUrl` is optional, the dialog MUST explain that CLIProxyAPI's default upstream will be used if the field is left empty
- `models` MUST allow manual entry for every supported provider type
- `models` MUST show provider-family-specific suggestions when the selected provider type has a supported upstream model-list endpoint and the request succeeds

#### Scenario: Switching from OpenAI compatibility to Claude hides provider name
- **WHEN** the dialog currently shows `openai-compatibility` and the user changes the provider type to `claude-api-key`
- **THEN** the `providerName` input MUST be hidden
- **AND** the `baseUrl` field MUST become optional

#### Scenario: Switching from Claude to Codex makes base URL required
- **WHEN** the dialog currently shows `claude-api-key` and the user changes the provider type to `codex-api-key`
- **THEN** the `baseUrl` field MUST become required
- **AND** the dialog MUST preserve manual model-entry capability

### Requirement: Model suggestions match the selected CLIProxy provider family
The system MUST load model suggestions using the upstream model-list API corresponding to the selected CLIProxy provider family.

The system MUST:
- use OpenAI-compatible model listing for `openai-compatibility` and `codex-api-key`
- use Anthropic model listing for `claude-api-key`
- use Google/Gemini model listing for `gemini-api-key`
- continue allowing manual model entry when suggestion loading fails or returns no models

#### Scenario: Anthropic import shows Claude model suggestions
- **WHEN** the dialog opens with `claude-api-key` selected
- **THEN** the system MUST request model suggestions from the Anthropic model-list endpoint
- **AND** it MUST NOT request OpenAI-compatible model suggestions for that state

#### Scenario: Google import shows Gemini model suggestions
- **WHEN** the dialog opens with `gemini-api-key` selected
- **THEN** the system MUST request model suggestions from the Google/Gemini model-list endpoint
- **AND** it MUST NOT request OpenAI-compatible or Anthropic model suggestions for that state

#### Scenario: OpenAI import shows Codex-compatible model suggestions
- **WHEN** the dialog opens with `codex-api-key` selected because the source API type is `openai`
- **THEN** the system MUST request model suggestions using the OpenAI-compatible model-list endpoint
- **AND** the dialog MUST still submit the import to the `codex-api-key` provider list

### Requirement: Base URL input is normalized per provider family
The system MUST normalize the submitted `baseUrl` according to the selected provider family before writing the entry to CLIProxyAPI.

Normalization MUST:
- drop query and hash fragments
- preserve deployment subpaths
- avoid duplicated provider-specific request suffixes
- produce the configuration value expected by the selected CLIProxy provider family

#### Scenario: OpenAI-compatible base URL ends with /v1
- **WHEN** the selected provider type is `openai-compatibility` and the user enters `https://example.com/gateway`
- **THEN** the imported entry MUST use `https://example.com/gateway/v1` as `base-url`

#### Scenario: Claude endpoint is reduced to provider base
- **WHEN** the selected provider type is `claude-api-key` and the user enters `https://example.com/proxy/v1/messages?beta=true`
- **THEN** the imported entry MUST use `https://example.com/proxy` as `base-url`

#### Scenario: Empty Claude base URL keeps upstream default
- **WHEN** the selected provider type is `claude-api-key` and the user leaves `baseUrl` empty
- **THEN** the import MUST succeed without storing a custom `base-url`

#### Scenario: Gemini endpoint is reduced to provider base
- **WHEN** the selected provider type is `gemini-api-key` and the user enters `https://example.com/genai/v1beta/models/gemini-2.5-pro:generateContent`
- **THEN** the imported entry MUST use `https://example.com/genai` as `base-url`

#### Scenario: Codex endpoint is reduced to provider base
- **WHEN** the selected provider type is `codex-api-key` and the user enters `https://example.com/router/backend-api/codex/v1/chat/completions`
- **THEN** the imported entry MUST use `https://example.com/router` as `base-url`

### Requirement: Import writes to the selected CLIProxy provider list
The system MUST create or update the provider entry in the management list matching the selected provider type.

The system MUST NOT write the same submission to any other provider list.

#### Scenario: OpenAI profile imports into Codex list
- **WHEN** an API credential profile with `apiType = openai` is imported using the preselected `codex-api-key` provider type
- **THEN** the system MUST create or update an entry under the `codex-api-key` management list
- **AND** it MUST NOT create or update an entry under `openai-compatibility`

#### Scenario: User overrides inferred provider type before submit
- **WHEN** the dialog preselects `codex-api-key` for an OpenAI profile and the user changes the selection to `openai-compatibility` before submitting
- **THEN** the system MUST write only to the `openai-compatibility` management list
- **AND** the saved entry MUST follow `openai-compatibility` field and normalization rules

### Requirement: Import updates matching entries instead of creating duplicates
The system MUST update a matching entry in the selected provider list instead of appending a duplicate entry.

Matching MUST use provider-family-specific identity rules:
- `openai-compatibility`: normalized `base-url` first, then `providerName`
- `claude-api-key`: `api-key`, optionally combined with normalized `base-url` when one is supplied
- `gemini-api-key`: `api-key`, optionally combined with normalized `base-url` when one is supplied
- `codex-api-key`: normalized `base-url` and `api-key`, with `api-key` fallback when necessary

#### Scenario: Re-importing the same OpenAI-compatible provider updates in place
- **WHEN** an existing `openai-compatibility` entry has the same normalized `base-url` as the submitted import
- **THEN** the system MUST update that entry in place
- **AND** the `openai-compatibility` list MUST still contain exactly one matching entry after import

#### Scenario: Re-importing the same Codex credentials updates in place
- **WHEN** an existing `codex-api-key` entry has the same normalized `base-url` and `api-key` as the submitted import
- **THEN** the system MUST update that entry in place
- **AND** the `codex-api-key` list MUST still contain exactly one matching entry after import
