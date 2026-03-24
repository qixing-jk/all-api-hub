## MODIFIED Requirements

### Requirement: Secure verification can resume the blocked New API managed-site action
When a New API managed-site action is blocked by secure verification, the extension MUST provide a verification flow that retries the same protected action against the same browser-backed session after verification succeeds.

When the protected action depends on the shared browser-backed temp-context path, the extension MUST accept a recoverable window-to-tab rollback whenever popup-window creation is unavailable and the protected action does not require window-only isolation.

Protected actions covered by this requirement MUST include hidden channel-key reads from managed-site channel edit or reveal flows and any exact-match flow that depends on the hidden managed-site channel key.

#### Scenario: Manual secure verification retries the blocked action
- **GIVEN** a New API managed-site action is blocked because secure verification is required
- **AND** a valid authenticated browser session already exists for the configured managed-site origin
- **WHEN** the user enters a valid secure-verification code in the extension
- **THEN** the extension MUST submit the verification request to the backend
- **AND** the extension MUST retry the same blocked managed-site action after verification succeeds

#### Scenario: Automatic TOTP secure verification retries the blocked action
- **GIVEN** a New API managed-site action is blocked because secure verification is required
- **AND** a valid authenticated browser session already exists for the configured managed-site origin
- **AND** a valid TOTP secret is configured for automatic verification
- **WHEN** automatic secure verification runs
- **THEN** the extension MUST generate a TOTP code locally from the stored secret
- **AND** the extension MUST retry the same blocked managed-site action after verification succeeds

#### Scenario: Channel edit dialog retries hidden-key reveal after verification
- **GIVEN** the operator is editing an existing New API managed-site channel whose list payload does not expose the raw key
- **WHEN** the operator asks the dialog to load the real channel key
- **THEN** the extension MUST first attempt the hidden channel-key read immediately
- **AND** if login or secure verification is still required, the extension MUST open the shared verification flow in channel context
- **AND** after verification succeeds, the extension MUST retry the same hidden channel-key read and populate the dialog with the resolved key

#### Scenario: Hidden channel-key retry survives recoverable popup-window denial
- **GIVEN** a hidden channel-key read or exact-match retry uses the shared browser-backed temp-context path
- **AND** popup-window creation fails for a recoverable browser reason
- **WHEN** the extension retries the protected action
- **THEN** the extension MUST continue through a tab-backed temp context when the action does not require window-only isolation
- **AND** the extension MUST NOT fail the protected action solely because popup-window creation was unavailable
