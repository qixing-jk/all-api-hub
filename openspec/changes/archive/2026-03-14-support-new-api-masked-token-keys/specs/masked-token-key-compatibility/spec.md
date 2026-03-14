# masked-token-key-compatibility Specification

## ADDED Requirements

### Requirement: Token inventory remains usable when backend key fields are masked
The system MUST continue loading and rendering account token inventories when a supported backend returns masked key values in token list, detail, or search responses.

The system MUST treat inventory key values as display-oriented data unless a later flow explicitly requires the full secret key.

#### Scenario: Masked inventory loads without eager secret retrieval
- **GIVEN** a supported backend returns masked key values in token inventory responses
- **WHEN** the system loads token inventory for an account-scoped UI
- **THEN** it renders the token inventory successfully using the returned token data
- **AND** it does not require immediate full-key retrieval just to display the inventory

#### Scenario: Legacy full-key inventory remains supported
- **GIVEN** a backend returns usable full token keys directly in token inventory responses
- **WHEN** the system loads token inventory
- **THEN** the same token workflows remain available
- **AND** the system does not require a user-facing compatibility toggle to distinguish backend behavior

### Requirement: Secret-dependent token actions resolve full keys on demand
The system MUST obtain a usable full token key before executing any user-initiated action that depends on the real secret value.

Actions covered by this requirement MUST include clipboard copy, credential-profile save, downstream export or integration handoff, and any other flow that sends or stores the token as a usable credential.

#### Scenario: Copy action resolves a masked backend key
- **GIVEN** token inventory contains a masked key value for a supported backend
- **WHEN** the user initiates a copy-key action for that token
- **THEN** the system retrieves the full key through the backend's explicit secret-fetch path before completing the action
- **AND** it copies the usable full key rather than the masked inventory value

#### Scenario: Export or integration action resolves a masked backend key
- **GIVEN** token inventory contains a masked key value for a supported backend
- **WHEN** the user initiates an export, import, or integration action that requires the token secret
- **THEN** the system uses the resolved full key in the generated payload or outbound request
- **AND** it does not pass the masked inventory value as the credential

#### Scenario: Legacy backend action can proceed without secret fetch fallback
- **GIVEN** token inventory already contains a usable full key
- **WHEN** the user initiates a secret-dependent token action
- **THEN** the action completes with that usable key
- **AND** the system does not fail solely because no separate secret-fetch step is needed

### Requirement: Exact token comparison flows can resolve hidden keys
The system MUST resolve a full token key before any exact-comparison flow that depends on the token secret to detect duplicates or build a downstream managed-site payload.

If full-key resolution cannot be completed for a non-user-initiated verification flow, the system MUST fall back to a conservative indeterminate result rather than declaring an exact negative match.

#### Scenario: Managed-site import resolves a hidden key for exact duplicate detection
- **GIVEN** a supported backend returns a masked inventory key for a token
- **AND** the user initiates a managed-site import flow for that token
- **WHEN** the system performs exact duplicate detection or prepares the managed-site payload
- **THEN** it resolves the full token key before exact comparison
- **AND** the exact-match decision uses the resolved key rather than the masked inventory value

#### Scenario: Background exact verification cannot resolve the full key
- **GIVEN** a background verification flow requires exact token comparison
- **AND** the full key cannot be resolved for the token
- **WHEN** the verification completes
- **THEN** the system does not classify the token as an exact non-match
- **AND** it reports a conservative indeterminate result instead

### Requirement: Secret resolution failures remain safe and localized
When full-key resolution fails, the system MUST fail only the secret-dependent action or verification step that requested the secret.

The system MUST NOT overwrite inventory state with unresolved secret material, and it MUST NOT expose raw secrets in user-facing errors, logs, diagnostics, or cached summaries.

#### Scenario: Secret-dependent action fails without corrupting inventory state
- **GIVEN** token inventory contains a masked key value
- **AND** full-key resolution fails for a user-initiated secret action
- **WHEN** the action ends
- **THEN** the system leaves the existing token inventory visible and usable for non-secret interactions
- **AND** it reports the failure without replacing the token's inventory key with a bogus or partial secret value

#### Scenario: Failure reporting omits raw secret values
- **GIVEN** full-key resolution or a follow-on secret-dependent action fails
- **WHEN** the system surfaces an error or records diagnostics for the flow
- **THEN** the output omits raw token key material
- **AND** the output omits any backend credential values used to fetch the key
