## Context

Account persistence currently normalizes data in several different places: `createDefaultAccountConfig`, `normalizeConfig`, `coerceConfigForRead`, `addAccount`, `updateAccount`, `importData`, display-data conversion, and versioned account migrations. Those paths mix object spreads, `|| []`, `?? false`, and ad-hoc nested merges, which means every new `SiteAccount` field requires touching multiple call sites to keep create/read/update/import behavior consistent.

The repository already has a project-wide deep merge helper, `deepOverride`, with the array semantics we want for configuration data: nested objects merge, arrays replace, and the original value stays immutable. Account persistence already uses it in a few paths (`updateAccount`, some fallback returns), but not yet as the canonical way to apply account defaults and normalize legacy partial records.

This change needs to preserve existing user-visible behavior for legacy stored accounts, exports, and imports. It should reduce future schema-change scope without rewriting the account model or removing the migration system that already handles semantic upgrades.

## Goals / Non-Goals

**Goals:**
- Introduce a canonical default shape for `AccountStorageConfig` and `SiteAccount` that account services can share.
- Apply the same normalization rules across read, add, update, import, export, and display-conversion paths so missing fields are handled consistently.
- Reuse `deepOverride` for nested account data such as `health`, `account_info`, `checkIn`, and auth-related sub-objects.
- Keep additive future account fields cheap to add by localizing most defaulting work to one abstraction and reflecting the stable runtime contract in shared types.
- Preserve current backward-compatible semantics for legacy missing fields and array replacement behavior.

**Non-Goals:**
- Redesign the account UI or change the account form workflow.
- Change external API payloads or site-specific account fetching behavior.
- Remove the existing migration framework or rewrite archived migration history.
- Solve unrelated account-model cleanup beyond the normalization boundary needed for this change.

## Decisions

### 1. Add a dedicated account-defaults normalization layer
Create a small shared helper in the account service boundary at `src/services/accounts/accountDefaults.ts` that owns:
- default storage-config creation
- default account creation for persisted records
- normalization helpers for raw stored accounts and partial account updates

**Rationale:**
- Keeps the default contract close to account persistence code instead of scattering it across storage, operations, migrations, and UI adapters.
- Makes future field additions mostly a one-file change unless a new field has special migration semantics.
- Gives tests a stable seam for asserting normalization behavior directly.

**Alternatives considered:**
- Keep helpers private inside `accountStorage.ts`: rejected because account creation and partial-update preparation also live outside that file.
- Depend on migrations alone: rejected because additive defaults should not require a new version bump and migration for every field.

### 2. Normalize both top-level storage config and each stored account
Treat storage normalization as two separate but composable steps:
- `AccountStorageConfig` normalization handles top-level arrays and metadata such as `accounts`, `bookmarks`, `pinnedAccountIds`, `orderedAccountIds`, and `last_updated`.
- `SiteAccount` normalization handles per-account defaults for booleans, strings, arrays, nested objects, auth state, and legacy optional sections.

`getStorageConfig`, `getAllAccounts`, `exportData`, `importData`, `addAccount`, `updateAccount`, and display-data conversion should operate on normalized account objects instead of repeating inline fallback expressions. Shared types can then mark the stabilized runtime fields as required so adjacent services stop carrying duplicate fallbacks.

**Rationale:**
- Top-level config and per-account data evolve at different rates and should not be coupled into one giant normalizer.
- This keeps read/write/import/export invariants aligned and reduces display-layer defensive code such as repeated `tagIds || []` and similar account fallbacks.

**Alternatives considered:**
- Normalize only at display/render time: rejected because background services, imports, and mutations would still see partially shaped account data.
- Normalize only on writes: rejected because legacy data can still be read before the next write occurs.

### 3. Standardize on `deepOverride` for nested account merges
Use `deepOverride` as the merge primitive for account normalization and partial updates, rather than introducing another merge utility. Defaults become the base object, persisted data becomes the override, and arrays continue to replace rather than merge.

For `checkIn`, the normalizer should keep the extension's backward-compatible flag behavior: `enableDetection` defaults to `false`, while `autoCheckInEnabled` and `customCheckIn.openRedeemWithCheckIn` remain enabled unless a stored value explicitly sets them to `false`.

For the narrow cases where `undefined` must delete a nested property instead of leaving the previous value in place (for example the existing `health.code` cleanup path), keep explicit post-merge cleanup rather than changing global merge semantics.

**Rationale:**
- Reuses a merge behavior already established in preferences and account update paths.
- Avoids a second account-specific merge implementation that would drift over time.
- Preserves deterministic array behavior for tags, bookmarks, pinned ids, and other list fields.

**Alternatives considered:**
- Plain object spread: rejected because it does not preserve nested object defaults safely.
- A new recursive account-only merge helper: rejected because it duplicates `deepOverride` behavior with little benefit.

### 4. Keep semantic migrations separate from additive defaults
Do not require a `configVersion` bump just to supply default values for newly added optional account fields. Runtime normalization should handle additive missing fields, while versioned migrations remain responsible for semantic transformations, field splits, cleanup of legacy structures, or data conversions.

Existing migrations such as check-in restructuring and boolean normalization remain in place for backward compatibility, but this change should make future additive fields less dependent on migrations.

**Rationale:**
- Reduces change scope when a new persisted field only needs a default.
- Avoids creating migration churn for every additive schema evolution.
- Preserves the current migration framework for changes that truly transform stored meaning.

**Alternatives considered:**
- Bump `CURRENT_CONFIG_VERSION` for every field addition: rejected because it spreads simple schema additions across migrations, storage logic, and tests.

### 5. Add focused normalization tests around the new seam
Add targeted tests for the normalization helper and account partial-update behavior, covering:
- missing legacy fields defaulting correctly
- nested object merges preserving existing values unless explicitly overridden
- arrays replacing rather than merging
- explicit cleanup paths that must remove stale nested properties

**Rationale:**
- The biggest risk in this refactor is silent shape drift, not UI rendering.
- Small helper-level tests provide confidence without needing broad integration coverage.

**Alternatives considered:**
- Rely only on existing higher-level tests: rejected because the normalization logic is cross-cutting and easy to regress indirectly.

## Risks / Trade-offs

- [Default drift between helper and real usage] Mitigation: keep one exported normalization helper and route all touched account-storage paths through it; add focused tests for representative account shapes.
- [Over-normalization changes export snapshots earlier than before] Mitigation: normalize on existing write paths and read/export paths, but avoid introducing an eager write-back pass solely for missing defaults.
- [Deep merge preserves fields that a caller expected to clear] Mitigation: keep explicit post-merge cleanup for known delete semantics such as `health.code`, and add tests for those cases.
- [Legacy records with unusual partial nested objects] Mitigation: normalize before service use in read/import/update/export paths so background logic never depends on raw optional nesting.

## Migration Plan

1. Add the shared account-default normalization helper and helper-level tests.
2. Refactor `accountStorage.ts` to use the helper for config reads/writes, account writes, imports/exports, and display conversion.
3. Trim account add/edit payload fallback literals in `accountOperations` and adjacent consumers where the normalized runtime shape now guarantees stable defaults.
4. Keep existing migrations intact, but rely on runtime normalization for additive future fields that do not need semantic conversion.
5. Validate with focused account-service and utility tests, then run one broader scoped validation over the affected test set.

Rollback is low risk because this design does not depend on an irreversible storage migration. Reverting the helper adoption restores the previous code paths while leaving stored data backward compatible.

## Open Questions

- None for the first implementation pass. Migration cleanup and any optional removal of now-redundant fallback code outside the touched account service boundary stay out of scope unless the refactor proves trivially safe.
