## Context

Today `DisplaySiteData.name` is a direct projection of `SiteAccount.site_name` (see `accountStorage.convertToDisplayData`). Many UI surfaces and dialogs render `DisplaySiteData.name` as the primary account label (Account list, Key Management account selector, Model list, toast messages, etc.). When multiple stored accounts share the same `site_name`, the UI becomes ambiguous and increases the likelihood of acting on the wrong account (copying/exporting a key, editing models, running management actions).

The codebase already contains multiple, inconsistent “label” patterns:

- `DisplaySiteData.name` is just `site_name` (no disambiguation).
- Some flows render `site_name` and `username` together (e.g. the dedupe dialog helper uses `siteName · username`).
- Other flows log/label accounts as `${site_name} - ${username}` (auto check-in scheduler).
- Some filtering UIs disambiguate a different axis (e.g. a username collision) with ad-hoc formatting.

This change introduces a single, global display-name strategy driven by the full stored account set, while keeping persistence unchanged.

Constraints and inputs:

- The “base name” is the existing per-account `site_name` (user-controlled / configured).
- The disambiguation suffix comes from `account_info.username` (may be empty for some site types such as Sub2API).
- This is a presentation-only change; `SiteAccount.site_name` and storage exports must not be rewritten.

## Goals / Non-Goals

**Goals:**

- Provide a unified, deterministic account display-name strategy across the extension.
- When and only when “same base name” collisions exist (global scope), disambiguate colliding entries by appending `username` to the rendered name.
- Keep storage schema and persisted names unchanged (no migrations).
- Ensure search and sorting behavior remains clear and stable:
  - search should match both the base name and the appended username
  - sorting by name should be deterministic and effectively behave as base-name first, then username
- Minimize churn by implementing the core behavior once and reusing it broadly.

**Non-Goals:**

- Detecting or deleting duplicate accounts (dedupe/cleanup) is out of scope.
- Forcing users to rename accounts is out of scope.
- Introducing new external dependencies is out of scope.
- “Fixing” username-empty duplicates by adding other fallbacks (userId/origin) is out of scope for this change.

## Decisions

### 1. Centralize display-name computation in the account-to-display adapter

**Decision:** Compute disambiguated display names as part of `accountStorage.convertToDisplayData` when the input is an account array (full set). This is the primary data path consumed by most UI surfaces via `useAccountData()`.

Implementation approach:

- Introduce a small helper module (e.g. `src/services/accounts/utils/accountDisplayName.ts`) that:
  - normalizes a base name into a stable “duplicate key”
  - computes the set of duplicate keys for a full account list
  - formats the final display label given `(baseName, username, isDuplicate)`
- Update `convertToDisplayData(accounts: SiteAccount[])` to:
  - compute duplicates once per call
  - assign `DisplaySiteData.name` as either:
    - `site_name` when not duplicated, or when `username` is empty
    - `site_name + <separator> + username` when duplicated and username is non-empty

Rationale:

- Most UI surfaces already render `DisplaySiteData.name`; changing it in one place maximizes coverage and keeps behavior consistent.
- Computing duplicates needs a full list; `convertToDisplayData` is one of the few centralized list adapters.
- Avoids re-implementing duplicate detection across each feature module.

Alternatives considered:

- Compute per-screen (each list/hook/selector builds its own duplicate set).
  - Rejected: leads to drift and inconsistent “global” behavior; higher maintenance and test burden.
- Add a new field `displayName` to `DisplaySiteData` and migrate all UI to use it.
  - Rejected for now: larger surface area change and higher risk of missing a render path.

### 2. Define a stable normalization for duplicate detection

**Decision:** Duplicate detection key uses a normalized version of the base display name:

- trim leading/trailing whitespace
- collapse internal whitespace
- case-insensitive comparison via `toLowerCase()`
- convert full-width characters to half-width (consistent with existing search normalization)

Rationale:

- Prevents “looks-the-same” names from bypassing disambiguation.
- Aligns with existing behavior in `src/services/search/accountSearch.ts` (which already normalizes full-width/half-width and whitespace).

Alternative considered:

- Exact string equality.
  - Rejected: too easy to miss duplicates due to incidental formatting differences.

### 3. Standardize the separator used in disambiguated labels

**Decision:** Use a single, code-defined separator constant (initially `" · "`), and keep it out of i18n because it is punctuation-only.

Rationale:

- Avoids the existing mix of `" - "`, `" · "`, parentheses, etc.
- Middle-dot is already used in the codebase as a compact visual delimiter.

Alternative considered:

- Localized separator string.
  - Deferred: likely unnecessary for punctuation and increases translation surface.

### 4. Search and sort behavior piggybacks on existing account fields

**Decision:** Keep `DisplaySiteData.username` unchanged and rely on:

- label-based search (e.g. `SearchableSelect` that filters by `label`) working for duplicates because the label includes the username when needed
- structured account search (`searchAccounts`) continuing to match both `account.name` and `account.username`
- existing “sort by name” logic (which uses `DisplaySiteData.name`) naturally sorting by base name and then username for duplicated entries because the suffix is appended after the base name

Rationale:

- Minimal changes to search/sort infrastructure.
- Avoids introducing a second “name” field (base vs display) unless proven necessary.

## Risks / Trade-offs

- [Risk] Some UI surfaces may still render `SiteAccount.site_name` directly and remain ambiguous.
  - Mitigation: during implementation, grep for direct `site_name` rendering in UI and migrate key surfaces to use `DisplaySiteData` or the shared formatter helper.
- [Risk] Display labels may become longer and truncate more often.
  - Mitigation: most relevant components already use truncation/overflow guards; validate in Account list + Key Management selectors.
- [Risk] Disambiguation computed “globally” can cause a suffix to appear in a view where the other colliding account is hidden (e.g. disabled account excluded from a selector).
  - Mitigation: accept as a trade-off for consistency; revisit only if users report confusion.
- [Risk] Downstream integrations that use `account.name` as a free-form label (exports, dialogs, toasts) will now include the suffix for duplicates.
  - Mitigation: this is intended to reduce mis-operations; verify any integration that uses `account.name` only for display does not treat it as an identifier.

## Migration Plan

- No storage/data migration required.
- Implement helper + `convertToDisplayData` update, then validate the primary impacted surfaces:
  - Account Management account list
  - Key Management account selector and token group headers
  - Model list account labels
- Add unit tests for the helper to lock behavior (duplicate detection, username-empty behavior, formatting).
- Rollback strategy: revert the adapter/helper change; persisted account records remain unchanged.

## Open Questions

- Should duplicates include disabled accounts in the “global” collision set, or only accounts visible in the current view?
- Should the separator be `" · "` or `" - "` for best readability across fonts and locales?
- If a base-name collision exists but `username` is empty, do we want a future fallback (userId, origin hostname) to fully eliminate ambiguity, or is “no username → unchanged” sufficient?
