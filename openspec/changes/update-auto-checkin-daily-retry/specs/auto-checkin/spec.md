## ADDED Requirements

### Requirement: Normal auto check-in runs once per day
When auto check-in is enabled, the extension MUST schedule and execute at most one **normal** auto check-in run per day within the user-configured time window.

#### Scenario: Random schedule does not reschedule the same day
- **GIVEN** auto check-in is enabled with schedule mode `random`
- **WHEN** the normal auto check-in run completes successfully within today’s window
- **THEN** the next normal auto check-in schedule MUST target the next day’s window (not later today)

#### Scenario: Deterministic schedule runs once per day
- **GIVEN** auto check-in is enabled with schedule mode `deterministic` at `09:00`
- **WHEN** the normal auto check-in run completes at `09:05` today
- **THEN** the next normal auto check-in schedule MUST be `09:00` tomorrow

### Requirement: The scheduler does not trust `isCheckedInToday`
The scheduler MUST NOT use `checkIn.siteStatus.isCheckedInToday` to decide whether to execute an account. Instead, it MUST rely on provider outcomes (including `already_checked`) to determine whether an account is considered checked-in for the day.

#### Scenario: Untrusted local flag does not block execution
- **GIVEN** an enabled account with `checkIn.siteStatus.isCheckedInToday = true`
- **AND** the provider can check in for the account
- **WHEN** a normal auto check-in run executes
- **THEN** the provider MUST still be called for that account

#### Scenario: Provider indicates already checked
- **GIVEN** an enabled account is already checked-in today according to the site
- **WHEN** the provider executes a check-in request
- **THEN** the result status MUST be recorded as `already_checked`
- **AND** the account MUST NOT be included in the automatic retry set

### Requirement: Retry scheduling uses a separate alarm
Automatic retries MUST be scheduled and triggered via a dedicated retry alarm distinct from the normal daily alarm. Scheduling retries MUST NOT override or replace the next normal daily schedule.

#### Scenario: Retry alarm does not affect daily alarm
- **GIVEN** a normal daily run is scheduled for tomorrow
- **AND** at least one account fails in today’s normal run and retries are enabled
- **WHEN** the retry alarm is scheduled
- **THEN** the next normal daily alarm schedule MUST remain unchanged

### Requirement: Automatic retries are account-scoped
When retries are enabled, retry executions MUST only target accounts that failed in the latest eligible run, and MUST NOT rerun accounts that have already succeeded or were skipped.

#### Scenario: Retry only failed accounts
- **GIVEN** account A succeeds and account B fails in the normal run
- **WHEN** a retry execution runs
- **THEN** the provider MUST be called only for account B
- **AND** the provider MUST NOT be called for account A

### Requirement: Retry attempts are limited per account per day
The scheduler MUST track retry attempts per account per day, and MUST NOT retry an account more than `retryStrategy.maxAttemptsPerDay` times on the same day.

#### Scenario: Stop retrying after max attempts
- **GIVEN** retries are enabled with `maxAttemptsPerDay = 3`
- **AND** an account has failed 3 retry attempts today
- **WHEN** the retry scheduler evaluates retry candidates
- **THEN** the account MUST NOT be scheduled for further retries today

### Requirement: Status reporting distinguishes normal vs retry scheduling
Auto check-in status MUST expose enough information to render:
- the next scheduled **normal** run time, and
- whether a retry is pending and (when scheduled) the next retry time.

#### Scenario: UI can show next daily and next retry times
- **GIVEN** a normal daily run is scheduled and a retry is also scheduled
- **WHEN** the options UI loads auto check-in status
- **THEN** it MUST be able to display both the next normal run time and the next retry time
