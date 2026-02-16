# account-key-empty-state-create-option Specification

## Purpose
Provide an actionable empty state when a user triggers the account “copy key” action but the account has no available API keys/tokens.

## ADDED Requirements

### Requirement: Empty token inventory is actionable from copy-key UI
When a user triggers the account “copy key” action and the token inventory is empty, the system MUST present a pop-up/dialog that indicates no keys are available and offers an explicit action to create a key.

#### Scenario: User opens copy-key UI with no tokens
- **WHEN** the user triggers the account copy-key action for an account whose token list is empty
- **THEN** the system opens a pop-up/dialog that indicates no keys are available
- **AND** the pop-up/dialog offers an action to create a key

### Requirement: Empty-state supports quick create and custom create
When the token inventory is empty, the dialog MUST support:
- A quick-create action that provisions a default token.
- A custom-create action that allows the user to manually configure token fields before creating.

### Requirement: Creating a key requires explicit user intent
The system MUST NOT create a key automatically solely because the token list is empty. The system MUST create a key only after the user explicitly selects the create-key action.

#### Scenario: Empty token list does not auto-create
- **WHEN** the user triggers the account copy-key action and the token list is empty
- **THEN** the system does not create any token until the user selects the create-key action

### Requirement: Create actions provision a token and refresh inventory
When the user selects either create-key action (quick-create or custom-create), the system MUST create a token for that account and then refresh the token inventory presented in the dialog.

#### Scenario: Quick-create provisions a default token and reloads list
- **GIVEN** the copy-key dialog is open for an account with zero tokens
- **WHEN** the user selects the quick-create action
- **THEN** the system creates a default token for that account
- **AND** the system reloads the token inventory for the account and renders the updated list

#### Scenario: Custom-create provisions a user-configured token and reloads list
- **GIVEN** the copy-key dialog is open for an account with zero tokens
- **WHEN** the user selects the custom-create action and submits the token form
- **THEN** the system creates a token using the user-configured fields
- **AND** the system reloads the token inventory for the account and renders the updated list

### Requirement: Success continues the original copy intent
After a successful key creation and token inventory refresh:
- If exactly one token is available, the system MUST copy that token key to the clipboard and provide success feedback.
- If multiple tokens are available, the system MUST allow the user to choose which key to copy.

#### Scenario: Created token is copied when it is the only token
- **GIVEN** the user creates a key from the empty-state dialog
- **AND** the refreshed token inventory contains exactly one token
- **WHEN** the refresh completes
- **THEN** the system copies that token key to the clipboard and shows success feedback

#### Scenario: User selects a key when multiple tokens exist
- **GIVEN** the user creates a key from the empty-state dialog
- **AND** the refreshed token inventory contains multiple tokens
- **WHEN** the user selects a token to copy
- **THEN** the system copies the selected token key to the clipboard and shows success feedback

### Requirement: Failure surfaces user-facing feedback and remains actionable
If token creation fails, or if the refreshed token inventory still contains no tokens, the system MUST show a user-facing error message and MUST keep the dialog open with the create-key action available for retry.

#### Scenario: Create key fails
- **GIVEN** the copy-key dialog is open for an account with zero tokens
- **WHEN** the user selects the create-key action and the create operation fails
- **THEN** the system shows an error message
- **AND** the system keeps the dialog open and allows retrying the create-key action

#### Scenario: Token not found after reported success
- **GIVEN** the system reports the create operation as successful
- **WHEN** the subsequent token inventory refresh returns zero tokens
- **THEN** the system shows an error message indicating that no key could be found
- **AND** the system keeps the dialog open and allows retrying the create-key action
