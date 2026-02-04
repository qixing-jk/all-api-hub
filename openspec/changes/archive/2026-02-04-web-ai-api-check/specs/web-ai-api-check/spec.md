# Web AI API Check

## ADDED Requirements

### Requirement: Manual context-menu trigger opens an in-page API Check modal

The system SHALL provide a browser context-menu entry that opens an in-page “AI API Check” modal on the current webpage.

The manual trigger MUST be available regardless of auto-detect settings and whitelist configuration.

The modal MUST open on user request even when no API credentials can be extracted from the current selection, so the user can paste or edit values manually.

#### Scenario: Open modal from selected text
- **WHEN** the user selects text on a webpage and triggers “AI API Check” from the context menu
- **THEN** the system opens a centered in-page modal on the current webpage
- **AND** it pre-fills extracted values from the selected text when possible

#### Scenario: Open modal with no selection
- **WHEN** the user triggers “AI API Check” from the context menu without selecting any text
- **THEN** the system opens the modal with empty inputs ready for manual entry

### Requirement: Modal allows editing extracted connection details

The modal SHALL allow the user to edit `baseUrl`, `apiKey`, `apiType`, and `modelId` before running any network action.

`baseUrl` MUST support including a path segment (not just an origin) so deployments that mount under a subpath are supported.

#### Scenario: User edits parameters before testing
- **WHEN** the user edits `baseUrl`, `apiKey`, `apiType`, or `modelId` in the modal
- **THEN** subsequent actions use the edited values

#### Scenario: Base URL with subpath is preserved
- **WHEN** the user sets `baseUrl` to a URL containing a path prefix (for example `https://example.com/api`)
- **THEN** the system preserves the path prefix when constructing OpenAI-compatible requests

### Requirement: Best-effort extraction supports re-extract

The system SHALL support extracting `baseUrl` and `apiKey` from a user-provided text blob (initial selection and any pasted text).

The system SHALL provide an explicit “Re-extract” action that re-runs extraction on the current text and updates candidate values in the modal.

The system MUST allow the user to override extracted values at any time by editing the inputs directly.

#### Scenario: Re-extract updates candidates
- **WHEN** the user pastes a new text blob into the modal and clicks “Re-extract”
- **THEN** the system updates the candidate `baseUrl` and `apiKey` values based on the pasted text
- **AND** the user can still edit the fields after re-extraction

### Requirement: API type selection supports known families

The system SHALL allow selecting an `apiType` from: OpenAI-compatible, OpenAI, Anthropic, and Google.

#### Scenario: Selecting API type updates validation and actions
- **WHEN** the user changes the `apiType` selection
- **THEN** the modal updates available actions and validation rules for that API type

### Requirement: Fetching model list is available for OpenAI/OpenAI-compatible

When `apiType` is OpenAI or OpenAI-compatible and both `baseUrl` and `apiKey` are present, the system SHALL provide a “Fetch models” action that requests the OpenAI-compatible model listing endpoint.

The system MUST normalize the request base so the final model list URL ends with exactly one `/v1/models` path segment (avoiding duplicated segments such as `/v1/v1/models`).

#### Scenario: Fetch models succeeds
- **WHEN** the user clicks “Fetch models” with a valid OpenAI/OpenAI-compatible configuration
- **THEN** the system requests `GET <normalizedBaseUrl>/v1/models`
- **AND** it presents returned model IDs for selection

#### Scenario: Fetch models failure does not block manual model entry
- **WHEN** fetching models fails
- **THEN** the system shows a user-friendly error message without exposing the raw API key
- **AND** the user can still enter `modelId` manually

### Requirement: Users can run verification probes for all supported API types

The system SHALL provide a “Test” action that runs API verification probes using the current `baseUrl`, `apiKey`, `apiType`, and (when required) `modelId`.

The system MUST support running this action for OpenAI-compatible, OpenAI, Anthropic, and Google API types.

#### Scenario: Missing required inputs block testing
- **WHEN** the user clicks “Test” without providing required inputs for the selected `apiType`
- **THEN** the system prevents the test from running and indicates which inputs are missing

#### Scenario: Test results are shown in the modal
- **WHEN** the user runs “Test” with valid inputs
- **THEN** the system displays per-probe success/failure results in the modal
- **AND** any error details shown are sanitized to avoid leaking secrets

### Requirement: Auto-detect is opt-in and whitelist-gated

The system SHALL ship with auto-detect disabled by default.

When auto-detect is enabled, the system MUST only attempt detection on webpages whose URL matches a user-configured whitelist.

#### Scenario: Auto-detect is off by default
- **WHEN** a user installs or updates to a version containing this feature
- **THEN** auto-detect does not run until the user enables it in settings

#### Scenario: Auto-detect does not run on non-whitelisted pages
- **WHEN** auto-detect is enabled and the current webpage URL does not match any whitelist pattern
- **THEN** the system does not prompt the user and does not open the API Check modal automatically

### Requirement: Auto-detect requires explicit user confirmation before opening the modal

When auto-detect identifies both a `baseUrl` and an `apiKey` from a user action, the system MUST show a top-right confirmation prompt and MUST NOT open the centered modal unless the user confirms.

#### Scenario: Confirmation is required before opening modal
- **WHEN** auto-detect extracts both `baseUrl` and `apiKey` on a whitelisted page
- **THEN** the system shows a top-right confirmation prompt
- **AND** it opens the centered modal only if the user confirms

### Requirement: Auto-detect prompting is rate-limited per page

To avoid repeated interruptions, the system MUST rate-limit auto-detect confirmation prompts on the same page after a dismissal or completion.

#### Scenario: Cooldown prevents repeated prompts
- **WHEN** the user dismisses the auto-detect confirmation prompt
- **THEN** the system does not show another auto-detect confirmation prompt on that page until a cooldown period has elapsed

### Requirement: Users can configure auto-detect and whitelist patterns

The options UI SHALL provide controls to enable/disable auto-detect and to edit the URL whitelist as a list of RegExp patterns (one pattern per line).

Invalid patterns MUST be handled safely: they MUST NOT crash the UI and MUST be treated as non-matching.

#### Scenario: Enabling auto-detect with a matching whitelist allows prompting
- **WHEN** the user enables auto-detect and adds a whitelist pattern that matches the current page URL
- **THEN** auto-detect is allowed to show the confirmation prompt on that page

#### Scenario: Invalid patterns are ignored
- **WHEN** the user adds an invalid RegExp pattern to the whitelist
- **THEN** the system reports the pattern as invalid and treats it as non-matching

### Requirement: API keys are treated as secrets

The system MUST treat API keys as secrets:

- The UI MUST mask API key values by default.
- The system MUST NOT persist extracted API keys by default.
- The system MUST NOT log raw API keys.
- Errors and results returned from background operations MUST be sanitized so that raw API keys are not exposed.

#### Scenario: Sanitized error messages do not include secrets
- **WHEN** a fetch-models or test action fails
- **THEN** the user-facing error does not include the raw API key
