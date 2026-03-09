# account-default-normalization Specification

## Purpose
Defines canonical normalization requirements for persisted account storage and `SiteAccount` records so account services always operate on stable default shapes and deterministic partial-update merge semantics.

## Requirements
### Requirement: Account storage config uses canonical defaults
The system MUST normalize persisted account storage data against a canonical `AccountStorageConfig` default shape whenever account storage is created, read, written, imported, or restored, so downstream account services always receive defined top-level collections and metadata.

#### Scenario: Missing top-level collections default during read
- **WHEN** the persisted account storage blob is missing `accounts`, `bookmarks`, `pinnedAccountIds`, or `orderedAccountIds`
- **THEN** the system MUST expose those fields as empty arrays to downstream services

#### Scenario: Missing storage timestamp defaults during read
- **WHEN** the persisted account storage blob is missing `last_updated`
- **THEN** the system MUST expose a numeric `last_updated` value

#### Scenario: Imported collections remain authoritative
- **WHEN** the system imports account storage with explicit collection values
- **THEN** the system MUST preserve the provided collection values rather than appending default array contents

### Requirement: SiteAccount records are normalized from a canonical default shape
The system MUST normalize each persisted, imported, or exported `SiteAccount` against a canonical default shape before account services use it, serialize it for export, or persist further mutations, so additive fields have stable fallback values without field-specific magic defaults scattered across call sites.

#### Scenario: Missing persisted booleans use backward-compatible defaults
- **WHEN** a stored account omits `disabled` or `excludeFromTotalBalance`
- **THEN** the system MUST treat those fields as `false`

#### Scenario: Missing account tag ids default consistently
- **WHEN** a stored account omits `tagIds`
- **THEN** the system MUST expose `tagIds` as an empty array before downstream services read the account

#### Scenario: Missing auth type defaults consistently
- **WHEN** a stored account omits `authType`
- **THEN** the system MUST expose `authType` as `AccessToken` before downstream auth-specific services use the account

#### Scenario: Missing check-in configuration keeps backward-compatible defaults
- **WHEN** a stored account lacks a `checkIn` object
- **THEN** the system MUST expose a normalized check-in configuration with `enableDetection` set to `false`
- **AND** the system MUST keep backward-compatible flags such as `autoCheckInEnabled` enabled unless a stored value explicitly sets them to `false`

#### Scenario: Explicit persisted values override defaults
- **WHEN** a stored account already contains explicit values for normalized fields
- **THEN** the system MUST preserve those explicit values instead of overwriting them with canonical defaults

#### Scenario: Exported legacy accounts use canonical shape
- **WHEN** the system exports account storage containing legacy accounts that are missing additive fields
- **THEN** the exported account records MUST include the normalized canonical shape after any required account migrations run

### Requirement: Partial account updates use deterministic deep-merge semantics
The system MUST apply partial `SiteAccount` updates by deep merging the update payload onto the normalized stored account, while replacing arrays instead of concatenating them.

#### Scenario: Nested partial update preserves sibling data
- **WHEN** a partial update changes one nested account object such as `checkIn.siteStatus` or `health.status`
- **THEN** the system MUST preserve sibling nested fields that are not part of the update payload

#### Scenario: Array updates replace previous values
- **WHEN** a partial update supplies an array field such as `tagIds`
- **THEN** the system MUST replace the previously stored array with the provided array instead of merging their contents

#### Scenario: Normalized partial updates remain compatible with legacy records
- **WHEN** a legacy stored account is missing additive fields and receives a partial update
- **THEN** the system MUST apply the update against the normalized account shape without requiring a separate additive-field migration first
