# new-api-managed-secure-verification Specification

## Purpose
Define requirements for retrying protected New API managed-site actions after secure verification and for reusing the verified-session window safely.

## Requirements

### Requirement: Secure verification can resume the blocked New API managed-site action
When a New API managed-site action is blocked by secure verification, the extension MUST provide a verification flow that retries the same protected action against the same browser-backed session after verification succeeds.

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

### Requirement: Passkey-only secure verification remains manual guidance
The extension MUST NOT attempt to automate passkey verification for New API secure-verification flows.

If the authenticated New API account cannot complete secure verification in-extension through a verification code flow and passkey is the only available verification method, the extension MUST present user guidance to complete passkey verification on the site and MUST preserve a retry path once the user returns.

#### Scenario: Passkey-only verification shows manual guidance
- **GIVEN** a New API managed-site action is blocked because secure verification is required
- **AND** the authenticated account does not offer an in-extension verification-code path for that secure-verification step
- **AND** passkey is the only available verification method
- **WHEN** the extension determines which recovery paths are available
- **THEN** the extension MUST NOT attempt passkey automation
- **AND** the extension MUST show guidance to complete passkey verification on the site before retrying

### Requirement: Successful verification window is reused until it expires
After New API secure verification succeeds, the extension MUST reuse the backend's verified-session window for subsequent hidden channel-key reads and exact-match checks on the same managed-site origin until that verification window expires or the browser session becomes invalid.

#### Scenario: Follow-up hidden-key read reuses a still-valid verified session
- **GIVEN** secure verification has already succeeded for the configured New API managed-site origin
- **AND** the backend's verified-session window is still valid
- **WHEN** a later hidden channel-key read or exact-match check runs against the same origin
- **THEN** the extension MUST reuse the existing verified session
- **AND** the extension MUST NOT require the user to complete secure verification again before running that follow-up action

#### Scenario: Expired verified session requires a new verification step
- **GIVEN** secure verification has already succeeded for the configured New API managed-site origin
- **AND** the backend's verified-session window has expired or the login session is no longer valid
- **WHEN** a later hidden channel-key read or exact-match check runs against the same origin
- **THEN** the extension MUST require secure verification again before retrying the protected action

### Requirement: Verification assistance remains secret-safe
The extension MUST treat stored TOTP secrets, generated one-time codes, session cookies, and any secure-verification payloads as sensitive data.

The extension MUST NOT persist one-time verification codes or passkey assertions after the verification attempt ends, and it MUST NOT expose raw TOTP secrets, generated codes, passwords, or session cookies in user-facing errors, toasts, logs, or diagnostics.

#### Scenario: Verification failure reporting omits raw secrets
- **WHEN** New API secure verification fails or the protected action still fails after verification
- **THEN** the reported user-facing and diagnostic output MUST omit raw TOTP secrets
- **AND** the reported output MUST omit generated one-time codes, passwords, and session cookies
