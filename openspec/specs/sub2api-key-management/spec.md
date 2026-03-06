# sub2api-key-management Specification

## Purpose
This specification defines the requirements for integrating Sub2API key management into the extension's shared token workflows.
## Requirements
### Requirement: The extension SHALL expose Sub2API key inventory through shared key workflows

The system SHALL allow existing shared key inventory workflows to query API keys for `sub2api` accounts using the authenticated Sub2API user key API and normalize the result into the shared `ApiToken` model.

#### Scenario: Key Management loads Sub2API keys
- **WHEN** the user opens Key Management for a `sub2api` account
- **THEN** the system MUST request that account's key inventory from the Sub2API authenticated user key API
- **AND** it MUST render the returned keys in the existing shared token list instead of treating the site type as unsupported

#### Scenario: Copy-key workflow consumes normalized Sub2API tokens
- **WHEN** the user triggers the copy-key flow for a `sub2api` account and the inventory contains key records
- **THEN** the system MUST expose the key values to the existing copy/export workflows using the shared token model
- **AND** it MUST preserve key status, quota, expiration, and group metadata in the normalized result

### Requirement: Sub2API key data MUST be normalized for shared token semantics

The system MUST translate Sub2API key metadata into the shared token semantics used by the UI, including enabled/disabled status, quota values, expiration, and supported allow-list/group metadata.

#### Scenario: USD quota is converted into internal quota units
- **WHEN** a Sub2API key response contains quota or usage values in USD
- **THEN** the normalized token MUST convert those values into the extension's internal quota units using `UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR`

#### Scenario: ISO expiration is converted into shared expiry timestamps
- **WHEN** a Sub2API key response contains an expiration timestamp or no expiration
- **THEN** the normalized token MUST expose `expired_time` in epoch seconds
- **AND** it MUST use the shared unlimited or absent expiration sentinel when the key does not expire

### Requirement: The extension SHALL allow Sub2API keys to be created, edited, and deleted from shared token-management UI

The system SHALL support create, edit, and delete operations for `sub2api` account keys from the existing shared token-management surfaces using the subset of fields supported by Sub2API.

#### Scenario: User creates a Sub2API key from the shared dialog
- **WHEN** the user submits the shared add-token dialog for a `sub2api` account
- **THEN** the system MUST create the key through the Sub2API authenticated user key API
- **AND** it MUST persist the submitted shared fields that Sub2API supports, including name, quota or unlimited quota, expiration, group, and IP allow list
- **AND** it MUST refresh the account's key inventory after the create succeeds

#### Scenario: User updates a Sub2API key from the shared dialog
- **WHEN** the user edits an existing `sub2api` key and saves
- **THEN** the system MUST update that key through the Sub2API authenticated user key API
- **AND** it MUST refresh the displayed key data after the update succeeds

#### Scenario: User deletes a Sub2API key
- **WHEN** the user confirms deletion of a `sub2api` key
- **THEN** the system MUST delete that key through the Sub2API authenticated user key API
- **AND** it MUST remove the key from the refreshed inventory after deletion succeeds

### Requirement: Sub2API key forms MUST expose only supported advanced settings

The system MUST adapt the shared token form for `sub2api` accounts so unsupported configuration is not presented or implied as available.

#### Scenario: Model-limit controls are hidden for Sub2API keys
- **WHEN** the add-token or edit-token dialog is opened for a `sub2api` account
- **THEN** the system MUST NOT render model-limit configuration controls for that account type

#### Scenario: Group selection is resolved against current Sub2API groups
- **WHEN** the shared token form loads for a `sub2api` account
- **THEN** the system MUST populate the group selector using the current user-available Sub2API groups
- **AND** it MUST resolve the selected group against the current upstream group list when creating or updating the key

#### Scenario: Missing selected group fails safely
- **WHEN** the user submits a `sub2api` key create or update and the selected group can no longer be resolved upstream
- **THEN** the system MUST fail the operation with a user-facing error
- **AND** it MUST NOT silently remap the key to a different group

### Requirement: Sub2API key-management requests MUST recover from expired session credentials when possible

Any `sub2api` key list or mutation request that encounters expired JWT credentials MUST reuse the existing Sub2API recovery behavior before surfacing failure.

#### Scenario: Expired JWT is recovered by refresh-token renewal
- **WHEN** a `sub2api` key-management request fails because the JWT is expired
- **AND** the account has a valid stored Sub2API refresh token
- **THEN** the system MUST renew the JWT and retry the original key-management request once
- **AND** it MUST persist any rotated credentials needed for later requests

#### Scenario: Expired JWT is recovered by dashboard-session re-sync
- **WHEN** a `sub2api` key-management request fails because the JWT is expired
- **AND** the account does not have a usable refresh token
- **AND** a logged-in dashboard session is available for that origin
- **THEN** the system MUST attempt to re-sync the JWT from the dashboard context
- **AND** it MUST retry the original key-management request once using the re-synced credentials

#### Scenario: Unrecoverable auth failure requires re-login
- **WHEN** a `sub2api` key-management request fails with expired or invalid credentials
- **AND** credential recovery does not succeed
- **THEN** the system MUST show an actionable error telling the user to log in to the Sub2API dashboard again
- **AND** it MUST NOT classify the `sub2api` site type as unsupported for key management
