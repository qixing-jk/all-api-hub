## MODIFIED Requirements

### Requirement: Eligibility gating for key auto-provisioning

Key auto-provisioning (both on-add and manual repair) MUST only operate on eligible accounts.

An account is eligible when all of the following are true:
- The account is enabled (`disabled = false`)
- The account has credentials suitable for token management (`authType != "none"`)
- The account is not `site_type = "sub2api"`

Automated account-add provisioning and background repair MUST continue skipping `sub2api` accounts. However, when the manual repair UI reports a skipped `sub2api` account and the underlying account record is available in the current results view, the system MUST expose an explicit user-triggered create-key follow-up action for that account.

#### Scenario: Sub2API accounts are skipped
- **GIVEN** an account has `site_type = "sub2api"`
- **WHEN** key auto-provisioning is triggered (on-add or manual repair)
- **THEN** the system MUST skip that account and MUST NOT call token-management endpoints for it

#### Scenario: Manual repair offers explicit follow-up key creation for skipped Sub2API accounts
- **GIVEN** the manual repair flow reports a skipped `sub2api` account
- **AND** the underlying account record is available in the current results view
- **WHEN** the user reviews the repair results
- **THEN** the UI MUST offer an explicit create-key action for that account
- **AND** the action MUST remain user-triggered
- **AND** any follow-up token creation MUST use the shared Sub2API group-aware create flow instead of background auto-provisioning
