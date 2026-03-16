# new-api-managed-login-session Specification

## Purpose
Define requirements for storing New API login-assist credentials and establishing browser-backed managed-site sessions for verification-assisted workflows.

## Requirements

### Requirement: New API managed-site settings can store login-assist credentials
The extension MUST allow `managedSiteType = new-api` settings to store the browser-login credentials needed for session-assisted managed-site workflows.

The stored login-assist fields MUST include `username` and `password`, and the configuration MUST support an optional TOTP secret used only for automatic second-factor completion.

These login-assist fields MUST remain optional for ordinary admin-token-based New API managed-site CRUD and search flows, but they MUST be treated as required prerequisites for any session-assisted flow that needs a browser-backed login.

#### Scenario: User saves New API login-assist credentials
- **GIVEN** the active managed-site type is `new-api`
- **WHEN** the user saves a username, password, and optional TOTP secret in New API managed-site settings
- **THEN** the extension MUST persist those values under the New API managed-site configuration
- **AND** subsequent session-assisted managed-site workflows MUST use the persisted values

#### Scenario: Existing admin-token workflows remain available without login-assist credentials
- **GIVEN** the active managed-site type is `new-api`
- **WHEN** the user saves New API managed-site settings without username, password, or TOTP secret
- **THEN** the extension MUST keep ordinary admin-token-based managed-site CRUD and search flows available
- **AND** the extension MUST NOT require login-assist fields for those ordinary admin-token-based flows

### Requirement: New API settings can start a managed-session test flow
The `new-api` managed-site settings surface MUST expose a user-triggered action that runs the shared session-assisted login and verification flow against the currently edited base URL, user ID, username, password, and optional TOTP secret.

This settings action MUST remain separate from the ordinary admin-token CRUD/search controls and MUST stay disabled when no New API base URL has been entered.

#### Scenario: User tests the managed session from New API settings
- **GIVEN** the active managed-site type is `new-api`
- **AND** the settings form currently contains a non-empty New API base URL
- **WHEN** the user starts the managed-session test action from New API settings
- **THEN** the extension MUST open the shared session-assisted flow in the settings context using the currently edited login-assist inputs
- **AND** a successful run MUST report success for the settings context without changing the ordinary admin-token configuration contract

### Requirement: Session-assisted New API flows can establish or reuse a browser-backed login session
When a New API managed-site workflow requires a browser-backed authenticated session, the extension MUST reuse an existing valid login session for the same managed-site origin when available.

If no valid login session is available, the extension MUST attempt to establish one with the stored New API username and password before continuing the workflow.

If no valid login session is available and the required login-assist credentials are missing, the extension MUST stop the session-assisted workflow with a configuration-needed outcome rather than attempting a partial login flow.

#### Scenario: Existing authenticated session is reused
- **GIVEN** a valid authenticated New API browser session already exists for the configured managed-site origin
- **WHEN** a session-assisted managed-site workflow starts
- **THEN** the extension MUST reuse that existing login session
- **AND** the extension MUST NOT force a redundant username/password login step before continuing

#### Scenario: Stored username and password establish a new login session
- **GIVEN** no valid authenticated New API browser session exists for the configured managed-site origin
- **AND** stored New API username and password are available
- **WHEN** a session-assisted managed-site workflow starts
- **THEN** the extension MUST submit the login request with the stored username and password
- **AND** the workflow MUST continue only after the browser-backed login session has been established successfully

#### Scenario: Missing login-assist credentials block session establishment
- **GIVEN** no valid authenticated New API browser session exists for the configured managed-site origin
- **AND** stored New API username or password is missing
- **WHEN** a session-assisted managed-site workflow starts
- **THEN** the extension MUST NOT attempt a login request
- **AND** the workflow MUST report that New API login credentials are required before session-assisted recovery can continue

### Requirement: Login-session establishment supports second-factor completion
When the New API login flow reports that second-factor completion is required, the extension MUST support:

- manual code entry using a user-provided verification code accepted by the backend login-2FA endpoint
- optional automatic TOTP generation when a valid TOTP secret is configured

Automatic completion MUST be optional, and manual code entry MUST remain available even when a TOTP secret is stored.

#### Scenario: User completes login 2FA manually
- **GIVEN** stored New API username and password are valid
- **AND** the login response indicates that second-factor completion is required
- **AND** automatic TOTP completion is unavailable or not used
- **WHEN** the user provides a valid login verification code
- **THEN** the extension MUST submit that code to the New API login-2FA endpoint
- **AND** the browser-backed login session MUST be established for follow-up managed-site workflows

#### Scenario: Stored TOTP secret completes login 2FA automatically
- **GIVEN** stored New API username, password, and TOTP secret are valid
- **AND** the login response indicates that second-factor completion is required
- **WHEN** automatic login-2FA completion runs
- **THEN** the extension MUST generate a TOTP code locally from the stored secret
- **AND** the extension MUST submit the generated code to the New API login-2FA endpoint without requiring manual code entry

### Requirement: Login-assist secrets remain protected
The extension MUST treat stored New API password, stored TOTP secret, generated TOTP codes, and session-derived cookies as sensitive data.

Inputs that display the stored password or TOTP secret MUST be masked by default, and user-facing errors, toasts, logs, and diagnostics MUST NOT expose raw password, TOTP secret, generated one-time codes, or session cookies.

#### Scenario: Stored password and TOTP secret are masked in settings
- **WHEN** the user opens New API managed-site settings with a stored password or stored TOTP secret
- **THEN** the corresponding inputs MUST render masked by default
- **AND** revealing those values MUST require an explicit user action in the UI

#### Scenario: Login failure reporting omits raw secrets
- **WHEN** New API login-session establishment fails
- **THEN** the reported user-facing and diagnostic output MUST omit the raw password
- **AND** the reported output MUST omit the raw TOTP secret, generated one-time codes, and session cookies
