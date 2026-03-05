# account-duplicate-cleanup Specification

## Purpose
Define the duplicate-account scan and cleanup behavior: detect duplicates by normalized origin and safe upstream user id, then guide users through selecting a keep account and deleting the rest. Accounts with invalid URLs or missing/unsafe user IDs are treated as unscannable and excluded from automatic grouping.
## Requirements
### Requirement: System normalizes account URL to origin
The system MUST normalize each account’s configured site URL to a stable **origin** value (scheme + host + optional port) for duplicate detection.

#### Scenario: URL with path/query is normalized to origin
- **WHEN** an account has a site URL that includes a path and/or query string
- **THEN** the system derives the origin and uses it for duplicate detection

#### Scenario: Invalid URL is excluded from auto-dedupe
- **WHEN** an account’s site URL cannot be parsed into a valid origin
- **THEN** the system excludes that account from automatic duplicate grouping and surfaces it as “unscannable” (or equivalent) in scan results

### Requirement: System detects duplicates by origin and upstream user id
The system MUST identify duplicate accounts using the composite key: **normalized origin + upstream user id** (as returned by the site backend).

#### Scenario: Accounts with same origin and user id are grouped
- **WHEN** two or more accounts have the same normalized origin and the same upstream user id
- **THEN** the system groups them into a single duplicate set

#### Scenario: Accounts with different origin or different user id are not grouped
- **WHEN** two accounts differ by normalized origin OR upstream user id
- **THEN** the system does not place them in the same duplicate set

#### Scenario: Missing or non-numeric user id is excluded from auto-dedupe
- **WHEN** an account has a missing upstream user id (or a non-numeric value)
- **THEN** the system excludes that account from automatic duplicate grouping and surfaces it as “unscannable” (or equivalent) in scan results

### Requirement: Scan results are grouped and explainable
The system MUST present scan results grouped by duplicate set and MUST make it clear which accounts are considered duplicates and why.

#### Scenario: Duplicate set includes the dedupe key and member accounts
- **WHEN** a duplicate set is displayed
- **THEN** the system shows the normalized origin, the upstream user id, and the list of member accounts for that set

### Requirement: System recommends a keep account deterministically
For each duplicate set, the system MUST select a recommended “keep” account deterministically based on a user-selected strategy.

Supported strategies MUST include:
- Keep the pinned account (if any)
- Keep an enabled account (if any)
- Keep the most recently updated account (if timestamps exist)

#### Scenario: Recommendation is strategy-based and stable
- **WHEN** the user selects a recommendation strategy and re-runs the scan without changing account data
- **THEN** the system recommends the same keep account for each duplicate set

#### Scenario: Ties are broken deterministically
- **WHEN** multiple accounts are equivalent under the chosen strategy
- **THEN** the system applies a deterministic tie-break rule so exactly one keep account is selected

### Requirement: User can manually choose which account to keep
The system SHOULD allow the user to override the recommended keep account for a duplicate set by manually selecting a different account to keep before deletion.

#### Scenario: Manual keep selection is reflected in preview
- **WHEN** the user selects a different account to keep within a duplicate set
- **THEN** the preview reflects the manual keep selection and marks the other accounts for deletion

### Requirement: Bulk deletion requires preview and confirmation
The system MUST NOT delete any accounts during scanning. Bulk deletion of duplicates MUST require an explicit preview step and user confirmation.

#### Scenario: Preview shows keep vs delete
- **WHEN** the user initiates bulk deletion
- **THEN** the system shows a preview listing, for each duplicate set, which account will be kept and which accounts will be deleted

#### Scenario: Canceling preview does not delete
- **WHEN** the user cancels the preview/confirmation dialog
- **THEN** no account data is deleted or modified

### Requirement: Bulk deletion removes duplicates and reports results
After user confirmation, the system MUST delete all non-kept accounts in each duplicate set and MUST report the outcome to the user.

#### Scenario: One account remains per duplicate key
- **WHEN** the user confirms bulk deletion for a scan result
- **THEN** the system ensures that exactly one account remains for each origin+userId duplicate key

#### Scenario: Outcome is summarized
- **WHEN** bulk deletion completes
- **THEN** the system shows a summary including how many accounts were deleted and how many duplicate sets were affected

### Requirement: Bulk deletion reconciles account-id references
Bulk deletion MUST also reconcile stored account-id references so the UI and background services do not retain stale pointers.

#### Scenario: Deleted accounts are removed from pin/order lists
- **WHEN** bulk deletion completes
- **THEN** deleted account ids are removed from any pinned and manual-order entry lists

#### Scenario: Auto check-in status is pruned best-effort
- **WHEN** bulk deletion completes
- **THEN** the system SHOULD attempt to prune per-account auto check-in status entries for deleted account ids (best-effort; failure MUST NOT block the deletion outcome)
