## Why

Some users primarily use All API Hub for daily check-in (auto check-in + check-in status detection) and do not want to see “today” cashflow numbers (today consumption/outcome + today income). Today’s cashflow is currently derived from paginated log queries, which can be slow/noisy and may trigger rate limits or failures on certain deployments. Providing a switch to disable these stats reduces UI clutter and avoids unnecessary network requests. (Related issue: #437)

## What Changes

- Add a persisted user preference to disable “today cashflow” (today consumption/outcome + today income) display across the extension UI.
- When disabled:
  - UI sections that show today consumption/income are hidden or replaced with a minimal placeholder (e.g., popup summary, account list).
  - Manual/automatic refresh flows skip fetching today usage/income data and only fetch what’s still needed (e.g., quota/balance and check-in related requests).
  - Any dependent aggregates/sorts that rely on today consumption/income adjust accordingly (e.g., hidden, disabled, or treated as zero) to avoid misleading/stale values.
- Backward compatibility: existing users keep current behavior by default (feature remains enabled unless the user turns it off).

## Capabilities

### New Capabilities

- `today-cashflow-disable`: Users can turn off today cashflow (consumption + income) display and the underlying data fetching logic, while keeping check-in-related features usable.

### Modified Capabilities

<!-- None -->

## Impact

- UI: popup balance summary and account list rows/headers that show today consumption/income; any related totals/sorting UI.
- Services: account refresh pipeline and API service implementations that currently fetch today usage/income from logs.
- Preferences/storage: new preference flag + defaults/migration.
- Tests: add/update unit tests to ensure the toggle hides UI and prevents today cashflow network requests.
