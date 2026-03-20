## ADDED Requirements

### Requirement: CC Switch export exposes all supported target apps

The system SHALL present a shared CC Switch export dialog for account-token and API-credential-profile exports that allows selecting any supported CC Switch provider app identifier.

Supported target apps MUST include:

- `claude`
- `codex`
- `gemini`
- `opencode`
- `openclaw`

#### Scenario: Key Management export shows the full app list
- **WHEN** the user opens the CC Switch export dialog from a Key Management token action
- **THEN** the app selector shows `claude`, `codex`, `gemini`, `opencode`, and `openclaw`

#### Scenario: API credential profile export reuses the same app list
- **WHEN** the user opens the CC Switch export dialog from API Credential Profiles
- **THEN** the app selector shows the same supported app list as the Key Management export flow

### Requirement: CC Switch export uses the selected app identifier in the deeplink payload

When the user confirms a CC Switch export, the system MUST generate a `ccswitch://v1/import` provider deeplink that includes the selected supported app identifier together with the resolved provider name, homepage, endpoint, and API key.

If the selected app identifier is not one of the supported CC Switch apps, the system MUST reject the export instead of opening a deeplink.

Optional model and notes fields MAY be included when the user provides them.

For `opencode` and `openclaw`, the system MUST treat AI service API format configuration as limited by CC Switch's current external import support.

The system MUST inform the user about this limitation before export so they understand that CC Switch does not support configuring that API format through external import and it still needs to be adjusted inside CC Switch after import.

#### Scenario: Export to OpenCode
- **WHEN** the user selects `opencode` in the CC Switch export dialog and submits the export
- **THEN** the generated deeplink contains `app=opencode`
- **AND** the deeplink still includes the resolved provider name, homepage, endpoint, and API key fields
- **AND** the dialog informs the user that CC Switch does not support configuring this AI service API format through external import

#### Scenario: Export to OpenClaw
- **WHEN** the user selects `openclaw` in the CC Switch export dialog and submits the export
- **THEN** the generated deeplink contains `app=openclaw`
- **AND** the deeplink still includes the resolved provider name, homepage, endpoint, and API key fields
- **AND** the dialog informs the user that CC Switch does not support configuring this AI service API format through external import

### Requirement: CC Switch export keeps app-specific default endpoint behavior

The system SHALL derive the default endpoint field in the CC Switch export dialog from the selected account or profile base URL.

For `codex`, the default endpoint MUST be coerced to end with `/v1` without duplicating the suffix.

For `claude`, `gemini`, `opencode`, and `openclaw`, the default endpoint MUST preserve the stored base URL without forcing an additional `/v1` suffix.

Once the user manually edits the endpoint field, the system MUST preserve that custom endpoint instead of overwriting it during later app changes in the same dialog session.

#### Scenario: Codex keeps the existing /v1 default
- **WHEN** the selected account base URL is `https://example.com` and the user switches the CC Switch app to `codex`
- **THEN** the default endpoint becomes `https://example.com/v1`

#### Scenario: OpenCode uses the stored base URL by default
- **WHEN** the selected account base URL is `https://example.com` and the user switches the CC Switch app to `opencode`
- **THEN** the default endpoint remains `https://example.com`

#### Scenario: Custom endpoint survives later app changes
- **WHEN** the user manually edits the endpoint field in the CC Switch export dialog
- **THEN** later app changes in that open dialog session do not overwrite the custom endpoint value
