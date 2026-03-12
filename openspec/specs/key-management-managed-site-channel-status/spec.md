# key-management-managed-site-channel-status Specification

## Purpose
Define requirements for showing managed-site channel status in Key Management, including automatic refresh behavior, invalidation rules, and secret-safe status feedback.

## Requirements

### Requirement: Key Management shows managed-site channel status for each loaded key
The system MUST display a managed-site channel status for each token rendered in Key Management for the currently configured managed-site context.

The status model MUST distinguish at least these outcomes:

- `added`
- `not added`
- `unknown`

#### Scenario: Exact channel match is shown as added
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** the system can prepare comparable channel inputs for the token
- **WHEN** the managed-site status check finds an exact channel match using the token's derived channel inputs
- **THEN** the system shows the token status as `added`
- **AND** the system identifies the matched channel for follow-up actions

#### Scenario: Exact comparison completes without a match
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** the system can prepare comparable channel inputs for the token, including exact key material
- **WHEN** the managed-site status check completes without finding an exact channel match
- **AND** no base-url-and-models match or base-url-only match is found
- **THEN** the system shows the token status as `not added`

#### Scenario: Weak matching is available but exact verification is not
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** the managed-site service can only confirm a base-url-and-models match because comparable key material is unavailable or hidden
- **WHEN** the managed-site status check completes
- **THEN** the system shows the token status as `unknown`
- **AND** the system explains that exact verification is unavailable
- **AND** the system provides a way to open or filter managed-site channel management for manual confirmation

#### Scenario: Only the base URL matches an existing managed-site channel
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** the managed-site status check finds a base-url-only match but not a base-url-and-models match
- **WHEN** the managed-site status check completes
- **THEN** the system shows the token status as `unknown`
- **AND** the system explains that the match is weaker than model-level verification
- **AND** the system provides a way to open or filter managed-site channel management for manual confirmation

#### Scenario: Exact verification is unavailable and no weak match exists
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** the prepared comparable channel inputs do not include exact key material
- **AND** no base-url-and-models match or base-url-only match is found
- **WHEN** the managed-site status check completes
- **THEN** the system shows the token status as `unknown`
- **AND** the system explains that exact verification is unavailable

#### Scenario: New API unknown states include hidden-key guidance
- **GIVEN** a token is rendered in Key Management
- **AND** the managed-site type is `new-api`
- **AND** the token status resolves to `unknown` because exact verification is unavailable from the current comparable inputs or only a weak match was found
- **WHEN** the system renders the status explanation
- **THEN** the system clarifies that managed-site channel keys may remain unavailable until backend verification is completed

#### Scenario: Managed-site configuration is missing
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is missing or invalid
- **WHEN** the system determines the token's managed-site channel status
- **THEN** the system shows the token status as `unknown`
- **AND** the system explains that managed-site configuration is required before verification can run

#### Scenario: Veloera cannot support reliable absence checks
- **GIVEN** a token is rendered in Key Management
- **AND** the managed-site type is `Veloera`
- **WHEN** the system determines the token's managed-site channel status
- **THEN** the system shows the token status as `unknown`
- **AND** the system explains that Veloera channel lookup does not reliably support base-url search for this verification flow
- **AND** the system does not treat an empty search result as proof that the token is not added

#### Scenario: Status check fails unexpectedly
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **WHEN** preparing comparable inputs or searching the managed-site backend fails unexpectedly
- **THEN** the system shows the token status as `unknown`
- **AND** the system informs the user that verification could not be completed

### Requirement: Status checks run automatically and support manual refresh
The system MUST begin managed-site status checks for the tokens in the current Key Management selection after their token inventory is available.

The system MUST provide a page-level manual refresh action that reruns managed-site status checks for the current Key Management selection.

The system MUST reuse in-memory status results for unchanged tokens until a refresh or invalidation event occurs.

The system MUST use bounded concurrency for bulk status checks so the managed-site backend is not flooded with one request per rendered token at once.

#### Scenario: Status checks start after token inventory loads
- **GIVEN** Key Management finishes loading token inventory for the current selection
- **WHEN** the token list is rendered
- **THEN** the system begins managed-site status checks for those tokens without requiring the user to start an import flow

#### Scenario: Manual refresh reruns current-selection checks
- **GIVEN** Key Management is showing managed-site status results for the current selection
- **WHEN** the user triggers the refresh action for managed-site status checks
- **THEN** the system reruns status checks for the tokens in the current selection
- **AND** the system replaces the prior results with the refreshed results when the rerun completes

#### Scenario: Unchanged tokens reuse cached results in the current session
- **GIVEN** a token already has a completed managed-site status result in the current Key Management session
- **AND** the token data and managed-site configuration have not changed
- **WHEN** Key Management rerenders without a refresh or invalidation event
- **THEN** the system reuses the existing managed-site status result for that token

### Requirement: Status results stay in sync with token and managed-site changes
The system MUST invalidate affected managed-site status results when local token state or managed-site configuration changes could make those results stale.

#### Scenario: Successful managed-site import refreshes the affected token
- **GIVEN** a token is shown with managed-site status `not added` or `unknown`
- **WHEN** the user successfully imports that token to the managed site from Key Management
- **THEN** the system invalidates the cached managed-site status for that token
- **AND** the system refreshes the token's managed-site status without requiring a full-page reload

#### Scenario: Token edits or deletion invalidate prior status
- **GIVEN** a token already has a managed-site status result
- **WHEN** the token is edited or deleted in Key Management
- **THEN** the system invalidates the affected managed-site status result
- **AND** the system does not continue to show the stale result as final

#### Scenario: Managed-site preference changes invalidate prior results
- **GIVEN** one or more tokens already have managed-site status results
- **WHEN** the managed-site type or managed-site admin configuration changes
- **THEN** the system invalidates the affected managed-site status results
- **AND** the system reruns managed-site status checks before showing refreshed final results

### Requirement: Status feedback does not expose secrets
The system MUST NOT include raw token keys, managed-site admin tokens, or other plaintext credentials in managed-site status labels, explanations, error messages, toasts, or logs emitted for this feature.

#### Scenario: Verification failure is reported without secret leakage
- **GIVEN** a managed-site status check fails while processing a token
- **WHEN** the system reports the failure to the user or records diagnostics for the feature
- **THEN** the reported output omits the raw token key and managed-site credentials
