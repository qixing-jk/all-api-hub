## MODIFIED Requirements

### Requirement: Auto-provision on account add is configurable
The system MUST provide a user setting to enable or disable automatic default-key (token) provisioning when adding an account.

The setting MUST be persisted in user preferences as `autoProvisionKeyOnAccountAdd` and MUST default to **disabled**.

#### Scenario: Auto-provision enabled runs after successful add
- **GIVEN** auto-provision on add is enabled
- **WHEN** a user successfully adds an account
- **THEN** the system MUST run the key auto-provisioning flow for that account

#### Scenario: Auto-provision disabled does not run after successful add
- **GIVEN** auto-provision on add is disabled
- **WHEN** a user successfully adds an account
- **THEN** the system MUST NOT run the key auto-provisioning flow for that account
