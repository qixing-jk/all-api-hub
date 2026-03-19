# auto-checkin Delta Specification

## ADDED Requirements

### Requirement: Auto Check-in results page provides a bulk manual sign-in action for failed accounts
When the Auto Check-in results view has failed accounts in the latest stored execution result, the page MUST provide a page-level action that opens manual sign-in pages for those failed accounts in one user action.

The target set for the bulk action MUST be derived from the latest stored failed account results, not from transient table filter or search state.

If the latest stored execution result contains no failed accounts, the system MUST prevent the bulk action from starting and MUST provide a user-facing error or disabled state.

#### Scenario: Failed accounts can be opened from one page-level action
- **GIVEN** the latest stored Auto Check-in result contains failed accounts A and B
- **WHEN** the user triggers the page-level bulk manual sign-in action
- **THEN** the system MUST attempt to open manual sign-in pages for account A and account B

#### Scenario: Filters do not redefine the bulk target set
- **GIVEN** the latest stored Auto Check-in result contains failed accounts A and B
- **AND** the user has applied a table search or filter that hides account B
- **WHEN** the user triggers the page-level bulk manual sign-in action
- **THEN** the system MUST still target both failed accounts A and B

#### Scenario: Shift-click requests opening failed pages in a dedicated window
- **GIVEN** the latest stored Auto Check-in result contains failed accounts A and B
- **WHEN** the user Shift-clicks the page-level bulk manual sign-in action
- **THEN** the system MUST request opening the failed accounts' manual sign-in pages in a dedicated new browser window
- **AND** the system MUST reuse that window for subsequent failed-account pages when the browser supports it

#### Scenario: The new-window modifier is discoverable from the page
- **GIVEN** the latest stored Auto Check-in result contains failed accounts
- **WHEN** the Auto Check-in results page renders the bulk manual sign-in action
- **THEN** the system MUST show a user-facing hint that Shift-click opens the failed manual sign-in pages in a new window

#### Scenario: Bulk action is blocked when there are no failed accounts
- **GIVEN** the latest stored Auto Check-in result contains no failed accounts
- **WHEN** the user attempts to trigger the page-level bulk manual sign-in action
- **THEN** the system MUST NOT start any account-opening attempts
- **AND** the user MUST receive feedback that no failed accounts are available to open

### Requirement: Bulk manual sign-in reuses the existing manual-open destination and reports partial failures
The bulk manual sign-in action MUST reuse the same account resolution and page-opening behavior as the existing single-account "Manual sign-in" action for each targeted account.

Bulk opening MUST be best-effort: if resolving or opening one failed account does not succeed, the system MUST continue attempting the remaining targeted failed accounts.

After the bulk action completes, the system MUST provide user-facing feedback describing whether all targeted pages opened successfully or whether some accounts failed to open.

#### Scenario: Bulk action reuses the same destination semantics as the row action
- **GIVEN** account A appears in the latest stored Auto Check-in result as failed
- **WHEN** the user opens account A from the page-level bulk manual sign-in action
- **THEN** the system MUST use the same account resolution and navigation behavior as the single-account "Manual sign-in" action for account A

#### Scenario: One failed account does not block the others
- **GIVEN** the latest stored Auto Check-in result contains failed accounts A, B, and C
- **AND** opening account B fails
- **WHEN** the user triggers the page-level bulk manual sign-in action
- **THEN** the system MUST still attempt to open accounts A and C
- **AND** the user-facing completion feedback MUST report that at least one targeted account failed to open
