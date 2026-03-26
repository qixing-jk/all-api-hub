## MODIFIED Requirements

### Requirement: The extension SHALL allow Sub2API keys to be created, edited, and deleted from shared token-management UI

The system SHALL support create, edit, and delete operations for `sub2api` account keys from the existing shared token-management surfaces using the subset of fields supported by Sub2API.

Sub2API create operations MUST resolve an upstream-valid group before creating a key. The system MUST NOT send a create request with an empty or unresolved group and MUST NOT rely on omitted `group_id` semantics for default-token creation.

For user-triggered Sub2API quick-create flows:
- If exactly one valid current Sub2API group is available, the system MUST use that group without requiring an extra selection step.
- If multiple valid current Sub2API groups are available, the system MUST require explicit user selection through a constrained shared token dialog.
- If no valid current Sub2API groups are available, the system MUST block creation with a user-facing error.
- The system MUST NOT create a Sub2API key before the user triggers the create action.

#### Scenario: User creates a Sub2API key from the shared dialog
- **WHEN** the user submits the shared add-token dialog for a `sub2api` account
- **THEN** the system MUST create the key through the Sub2API authenticated user key API
- **AND** it MUST persist the submitted shared fields that Sub2API supports, including name, quota or unlimited quota, expiration, group, and IP allow list
- **AND** it MUST resolve the selected group against the current upstream group list before creating the key
- **AND** it MUST refresh the account's key inventory after the create succeeds

#### Scenario: Quick-create auto-uses the only available group
- **WHEN** a user-triggered shared quick-create flow loads current groups for a `sub2api` account
- **AND** exactly one valid current group is available
- **THEN** the system MUST create the key using that single group
- **AND** it MUST NOT require an extra group-selection step

#### Scenario: Quick-create requires explicit choice when multiple groups are available
- **WHEN** a user-triggered shared quick-create flow loads current groups for a `sub2api` account
- **AND** multiple valid current groups are available
- **THEN** the system MUST stop before sending the create request
- **AND** it MUST require the user to select one of the valid groups through a constrained shared token dialog

#### Scenario: Quick-create fails safely when no valid group is available
- **WHEN** a user-triggered shared quick-create flow loads current groups for a `sub2api` account
- **AND** no valid current groups are available
- **THEN** the system MUST stop before sending the create request
- **AND** it MUST show a user-facing error that creation requires an available group

#### Scenario: Managed-site channel import resumes after explicit Sub2API token creation
- **WHEN** a user-triggered managed-site channel import flow needs a token for a `sub2api` account
- **AND** multiple valid current groups are available
- **THEN** the system MUST open the constrained shared token dialog instead of creating an ungrouped key
- **AND** it MUST defer opening the managed-site channel dialog until token creation succeeds
- **AND** after token creation succeeds it MUST resume the original managed-site import flow

#### Scenario: Saving a Sub2API account can trigger first-key follow-up creation
- **WHEN** the user saves a `sub2api` account
- **AND** the save flow does not explicitly suppress the follow-up prompt
- **AND** the saved account still has no keys
- **THEN** the system MUST open the constrained shared token dialog as an immediate follow-up flow
- **AND** any created token MUST still obey the same valid-group resolution rules

#### Scenario: User updates a Sub2API key from the shared dialog
- **WHEN** the user edits an existing `sub2api` key and saves
- **THEN** the system MUST update that key through the Sub2API authenticated user key API
- **AND** it MUST refresh the displayed key data after the update succeeds

#### Scenario: User deletes a Sub2API key
- **WHEN** the user confirms deletion of a `sub2api` key
- **THEN** the system MUST delete that key through the Sub2API authenticated user key API
- **AND** it MUST remove the key from the refreshed inventory after deletion succeeds

### Requirement: Sub2API key forms MUST expose only supported advanced settings

The system MUST adapt shared token form and quick-create flows for `sub2api` accounts so unsupported configuration is not presented or implied as available.

Sub2API key creation MUST be group-aware:
- The system MUST populate group choices from the current user-available Sub2API groups.
- The system MUST submit only a valid group that was either explicitly selected by the user or auto-used because it was the only valid current choice after the user triggered creation.
- The system MUST NOT silently replace an empty group with a guessed fallback.

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

#### Scenario: Quick-create entry points use safe group resolution
- **WHEN** a shared quick-create flow needs to create a key for a `sub2api` account
- **THEN** the system MUST resolve the current valid Sub2API groups before creating the key
- **AND** it MUST auto-use the group only when exactly one valid choice exists
- **AND** it MUST require explicit user selection when more than one valid choice exists
- **AND** it MUST NOT create the key until the final request includes a resolved valid group
