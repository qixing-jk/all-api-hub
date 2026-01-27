## Context

The popup “Total Balance” value is computed from `DisplaySiteData[]` via `calculateTotalBalance(displayData)` in `entrypoints/popup/components/BalanceSection/BalanceTabs.tsx`.

Today, the only built-in exclusion mechanism is `SiteAccount.disabled`, which:
- excludes an account from aggregates (by design), and
- blocks account-related behaviors (refresh/check-in/actions).

Users need a lighter-weight option: exclude specific enabled accounts from Total Balance only.

## Goals / Non-Goals

**Goals:**
- Persist a per-account boolean `excludeFromTotalBalance` that survives reload/backup/sync.
- Provide a clear toggle in the account add/edit dialog.
- Update Total Balance aggregation so it excludes:
  - disabled accounts, and
  - enabled-but-excluded accounts.
- Add unit tests for aggregation + migration defaults (and a light UI/persistence wiring test if practical).

**Non-Goals:**
- Do not change the meaning of `disabled` or broaden its scope.
- Do not change other aggregates (today consumption/income) unless they already depend on Total Balance logic.
- Do not add a new global preference; this is per-account only.

## Decisions

### Decision 1: Store exclusion as a `SiteAccount` field and project to `DisplaySiteData`

**Choice:** Add `excludeFromTotalBalance?: boolean` to `SiteAccount` (persistence) and `DisplaySiteData` (UI projection).

**Rationale:**
- Matches existing patterns (`disabled` is stored on `SiteAccount` and projected into `DisplaySiteData`).
- Keeps aggregation logic (`calculateTotalBalance`) purely a function of display data, without re-querying storage.
- Ensures the setting naturally participates in backup/export/WebDAV sync because it lives with the account record.

**Alternatives considered:**
- Store a global list of excluded account ids in user preferences (rejected: more cross-entity coupling and sync complexity).

### Decision 2: Normalize old accounts via config migration

**Choice:** Bump the account config schema version and add a migration that normalizes `excludeFromTotalBalance` to a boolean (`true` only when explicitly true; otherwise `false`).

**Rationale:**
- Keeps stored data consistent (avoids “missing field” ambiguity in exports/backups).
- Follows the established `accountDataMigration` pattern used for `disabled`.

### Decision 3: Update Total Balance in one place (shared utility)

**Choice:** Implement the exclusion filter in `utils/formatters.ts` inside `calculateTotalBalance` (and by extension `calculateTotalBalanceForSites`).

**Rationale:**
- Single source of truth for the total-balance aggregation logic.
- Existing tests already cover `calculateTotalBalance`, making it cheap to extend coverage.

## Risks / Trade-offs

- **[UX] Users may confuse “Exclude from Total Balance” with “Disable account”** → Add descriptive copy in the dialog clarifying that exclusion only affects the total and does not disable refresh/check-in.
- **[Migration drift] Config version bumps may require test updates** → Update migration unit tests and keep the migration focused (boolean normalization only).

## Migration Plan

1. Add `excludeFromTotalBalance?: boolean` fields to the relevant types.
2. Add a new config migration step (version N+1) that normalizes the flag.
3. Ensure `accountStorage.getAllAccounts()` persists migrated accounts (already supported).
4. Release: existing accounts default to included; users can opt accounts out via the toggle.

Rollback: Removing the feature should treat the field as unused; stored values are inert without the UI/aggregation logic.

## Open Questions

- Should “Total Balance” be the only aggregate affected, or should Options/other screens that show totals also respect it? (This change targets the Total Balance aggregate only, per spec.)

