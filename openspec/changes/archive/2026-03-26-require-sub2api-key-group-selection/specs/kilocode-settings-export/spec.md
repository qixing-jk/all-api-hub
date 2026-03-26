## MODIFIED Requirements

### Requirement: No-token sites are skipped by default, but token creation is available

If a site has no API tokens, the system MUST skip that site by default (it MUST NOT create tokens automatically).

The system SHALL provide a per-site action to create a default token. For `sub2api` sites, that action MUST resolve a valid current Sub2API group before the token is created. After the user clicks create:
- If exactly one valid current group is available, the system MUST use it without an extra selection step.
- If multiple valid current groups are available, the system MUST require explicit user selection.
- If no valid current groups are available, the system MUST block creation with a user-facing error.

When token creation succeeds, the system MUST refresh the token list for that site and preselect the newly created token for export.

#### Scenario: Site has no tokens and is skipped
- **WHEN** the user loads tokens for a site and the token list is empty
- **THEN** the system marks the site as skipped and indicates that no tokens are available for export

#### Scenario: Create a default token and select it
- **WHEN** the user clicks “Create default token” for a site with no tokens
- **AND** the site is not `sub2api`
- **THEN** the system creates a token, reloads the site’s tokens, and selects the created token for export

#### Scenario: Sub2API create-token action requires explicit group selection
- **WHEN** the user clicks the create-token action for a `sub2api` site with no tokens
- **AND** multiple valid current Sub2API groups are available
- **THEN** the system MUST require the user to choose a valid Sub2API group before sending the create request
- **AND** it MUST NOT create an ungrouped token
- **AND** after successful creation it MUST reload the site’s tokens and select the created token for export

#### Scenario: Sub2API create-token action auto-uses the only valid group
- **WHEN** the user clicks the create-token action for a `sub2api` site with no tokens
- **AND** exactly one valid current Sub2API group is available
- **THEN** the system MUST create the token using that single group
- **AND** it MUST NOT require an extra group-selection step
- **AND** after successful creation it MUST reload the site’s tokens and select the created token for export

#### Scenario: Sub2API create-token action fails when no valid groups exist
- **WHEN** the user clicks the create-token action for a `sub2api` site with no tokens
- **AND** no valid current Sub2API groups are available
- **THEN** the system MUST show a user-facing error
- **AND** it MUST NOT create a token
