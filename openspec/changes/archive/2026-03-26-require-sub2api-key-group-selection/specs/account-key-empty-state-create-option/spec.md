## MODIFIED Requirements

### Requirement: Empty-state supports quick create and custom create
When the token inventory is empty, the dialog MUST support:
- A quick-create action that provisions a default token for sites that support implicit default-token creation.
- A custom-create action that allows the user to manually configure token fields before creating.

For `sub2api` accounts, the quick-create action MUST become a group-aware create flow. It MUST NOT provision a token with an empty group. After the user explicitly triggers creation:
- If exactly one valid current Sub2API group is available, the system MUST use it without an extra selection step.
- If multiple valid current Sub2API groups are available, the system MUST require explicit user selection.
- If no valid current Sub2API groups are available, the system MUST block creation with a user-facing error.

#### Scenario: User sees quick-create and custom-create options for supported sites
- **GIVEN** the copy-key dialog is open for an account with zero tokens
- **AND** the account is not `sub2api`
- **WHEN** the empty token list view is rendered
- **THEN** the dialog presents a quick-create action for creating a default token
- **AND** the dialog presents a custom-create action for opening the token configuration form

#### Scenario: Sub2API quick-create auto-uses the only valid group
- **GIVEN** the copy-key dialog is open for a `sub2api` account with zero tokens
- **WHEN** the user selects the quick-create action
- **AND** exactly one valid current Sub2API group is available
- **THEN** the system MUST create the token using that group
- **AND** it MUST NOT require an extra group-selection step

#### Scenario: Sub2API quick-create requires explicit choice for multiple groups
- **GIVEN** the copy-key dialog is open for a `sub2api` account with zero tokens
- **WHEN** the user selects the quick-create action
- **AND** multiple valid current Sub2API groups are available
- **THEN** the dialog MUST keep token creation user-triggered
- **AND** the create action MUST require the user to choose a valid Sub2API group before creating the token
- **AND** the dialog MUST NOT create a token while the group remains unresolved

#### Scenario: Sub2API quick-create fails when no valid groups exist
- **GIVEN** the copy-key dialog is open for a `sub2api` account with zero tokens
- **WHEN** the user selects the quick-create action
- **AND** no valid current Sub2API groups are available
- **THEN** the dialog MUST show an actionable error
- **AND** the dialog MUST NOT create a token

### Requirement: Create actions provision a token and refresh inventory
When the user selects either create-key action, the system MUST create a token for that account and then refresh the token inventory presented in the dialog.

For `sub2api` accounts, the token creation step MUST use a resolved valid group obtained from the group-aware create flow.

#### Scenario: Quick-create provisions a default token and reloads list
- **GIVEN** the copy-key dialog is open for an account with zero tokens
- **AND** the account is not `sub2api`
- **WHEN** the user selects the quick-create action
- **THEN** the system creates a default token for that account
- **AND** the system reloads the token inventory for the account and renders the updated list

#### Scenario: Sub2API create provisions a grouped token and reloads list
- **GIVEN** the copy-key dialog is open for a `sub2api` account with zero tokens
- **WHEN** the user completes the required Sub2API group resolution and confirms creation
- **THEN** the system creates the token using the resolved valid group
- **AND** the system reloads the token inventory for the account and renders the updated list
