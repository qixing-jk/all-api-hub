# total-balance-exclusion Specification

## Purpose
Allow users to exclude specific enabled accounts from the “Total Balance” aggregate without disabling the account (so refresh/check-in and other behaviors remain available).

## ADDED Requirements

### Requirement: Persisted exclusion flag
Each `SiteAccount` MUST support a persisted boolean flag `excludeFromTotalBalance` that controls whether the account contributes to the Total Balance aggregate.

#### Scenario: Backward compatibility default
- **GIVEN** an existing stored account that does not have the `excludeFromTotalBalance` field
- **WHEN** the extension loads the account from storage
- **THEN** the account MUST be treated as included in Total Balance (`excludeFromTotalBalance = false`)

#### Scenario: Exclusion flag is durable
- **GIVEN** a user sets `excludeFromTotalBalance = true` for an account
- **WHEN** the extension is restarted or storage is reloaded
- **THEN** the account MUST remain excluded from Total Balance until the user turns the setting off

### Requirement: User can configure exclusion in account management
Users MUST be able to toggle `excludeFromTotalBalance` from the account add/edit UI.

#### Scenario: Toggle exclusion setting
- **GIVEN** a user is editing an account
- **WHEN** the user enables or disables “Exclude from Total Balance” and saves the account
- **THEN** the account’s persisted `excludeFromTotalBalance` value MUST match the user’s selection

### Requirement: Total Balance calculation respects exclusion
The Total Balance aggregate MUST include only accounts that are:
- enabled (`disabled = false`), AND
- not excluded (`excludeFromTotalBalance = false`).

#### Scenario: Total Balance excludes flagged accounts
- **GIVEN** a mix of accounts with different balances where some have `excludeFromTotalBalance = true`
- **WHEN** the UI computes or displays Total Balance
- **THEN** the excluded accounts MUST NOT contribute to the aggregate

#### Scenario: Disabled accounts remain excluded
- **GIVEN** an account is disabled (`disabled = true`) and has any value of `excludeFromTotalBalance`
- **WHEN** the UI computes or displays Total Balance
- **THEN** the disabled account MUST NOT contribute to the aggregate

