## Why

Account persistence currently relies on scattered fallback values and field-specific normalization across create, read, update, import, and migration paths. As the `SiteAccount` shape keeps growing, each new field increases the number of places that must be updated, so centralizing account defaults and reusing deep-merge normalization now will reduce future change scope and prevent inconsistent legacy behavior.

## What Changes

- Introduce `src/services/accounts/accountDefaults.ts` as the shared normalization seam for canonical `AccountStorageConfig` and `SiteAccount` runtime shapes.
- Normalize stored, imported, and exported accounts plus storage config by merging persisted data onto defaults instead of relying on repeated inline fallback values.
- Reuse `deepOverride`-style deep merging for account normalization and partial update paths, while keeping explicit cleanup for fields such as `health.code`.
- Preserve current backward-compatible behavior for missing legacy fields, including the existing `checkIn` flag defaults, while reducing magic fallback logic spread across account services.
- Tighten adjacent account consumers and shared types around fields the runtime now guarantees, so duplicated `||` and `??` fallbacks can be removed safely.
- Add focused validation for account default application and partial account updates so future schema additions can stay narrowly scoped.

## Capabilities

### New Capabilities
- `account-default-normalization`: Account storage MUST apply a canonical default shape when accounts or account storage config are created, read, imported, exported, or partially updated, while preserving deterministic deep-merge behavior for nested objects and replacement semantics for arrays.

### Modified Capabilities

## Impact

- Affected code: `src/services/accounts/accountDefaults.ts`, `src/services/accounts/accountStorage.ts`, `src/services/accounts/accountOperations.ts`, `src/types/index.ts`, and adjacent check-in consumers/test fixtures that now rely on normalized account shapes
- Affected systems: account storage normalization, account add/edit/update flows, export/import compatibility, display-data conversion, and focused account-service/check-in regression coverage
- External APIs/dependencies: no intended API surface change; relies on existing `deepOverride` merge utility rather than introducing a new dependency
