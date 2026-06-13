# Sponsor Catalog V4-Only Implementation Plan

> **For agentic workers:** This plan supersedes the earlier manifest-based
> compatibility plan. Do not add `sponsor-catalog-manifest.json`, runtime V3
> fallback, or a separate `catalogV4.ts` module.

**Spec:** `docs/superpowers/specs/2026-06-11-sponsor-catalog-compatibility-design.md`

**Goal:** Move current source code to the V4 sponsor catalog contract while
preserving the frozen V3 public JSON artifact for old released clients.

**Architecture:** Current clients read, cache, validate, and render only
`schemaVersion: 4` catalogs from `public/sponsor-catalog.v4.json` and the
matching remote URL. `public/sponsor-catalog.json` remains in the repository
only for old clients that already know that endpoint. Future incompatible
schemas should use new versioned JSON files rather than a manifest negotiation
layer.

**Tech Stack:** TypeScript, React, WXT extension runtime,
`@plasmohq/storage`, Vitest, Testing Library.

---

## File Structure

- Modify `public/sponsor-catalog.v4.json`
  - Store the active V4 sponsor catalog.
  - Use placeholder data in tests and docs; production catalog data belongs only
    in the production artifact.

- Preserve `public/sponsor-catalog.json`
  - Keep it as the legacy V3 artifact for released clients.
  - Do not import or fetch it from current source code.

- Remove `public/sponsor-catalog-manifest.json`
  - Manifest negotiation is out of scope for the V4 era.

- Modify `src/features/AccountManagement/sponsors/types.ts`
  - Keep V4 raw catalog types.
  - Keep `SponsorRecommendation` aligned to normalized V4 fields:
    `links.primary`, selected locale metadata, and optional `actions.*`.
  - Do not retain legacy V3 bridge fields such as `primaryAffiliateUrl`,
    `websiteUrl`, `apiKeyCreateUrl`, `accountPrefill`, or `fallbackHints`.

- Modify `src/features/AccountManagement/sponsors/catalog.ts`
  - Own V4 validation and normalization directly.
  - Select a whole locale campaign using locale fallback.
  - Reject unsupported schemas and unknown V4 item/campaign fields.

- Remove `src/features/AccountManagement/sponsors/catalogV4.ts`
  - V4 is the only active catalog contract, so a second normalizer module adds
    indirection without preserving useful compatibility.

- Modify `src/features/AccountManagement/sponsors/constants.ts`
  - Export the V4 remote URL.
  - Import the bundled V4 JSON.
  - Remove manifest and V3 runtime constants.

- Modify `src/features/AccountManagement/sponsors/storage.ts`
  - Keep schema/source-discriminated cache envelopes.
  - Read/write only the V4 cache key selected by current source.

- Modify `src/features/AccountManagement/sponsors/loader.ts`
  - Try remote V4 first.
  - Fall back to the same-source V4 cache.
  - Fall back to bundled V4.
  - Do not fetch V3 or a manifest at runtime.

- Update sponsor UI and analytics call sites
  - Consume normalized `links.primary` and `actions.*`.
  - Do not derive bookmark URLs or API base URLs from generic visit-provider
    URLs.
  - Reuse existing telemetry unless new privacy-safe metadata is explicitly
    required.

- Update tests:
  - `tests/features/AccountManagement/sponsors/catalog.test.ts`
  - `tests/features/AccountManagement/sponsors/loader.test.ts`
  - `tests/features/AccountManagement/sponsors/storage.test.ts`
  - `tests/features/AccountManagement/sponsors/publicCatalog.test.ts`
  - Relevant sponsor UI tests that render or act on recommendation actions.

## Rollout Rules

- Do not replace `public/sponsor-catalog.json` with V4.
- Do not keep runtime compatibility branches just because the legacy artifact
  exists.
- Do not add `sponsor-catalog-manifest.json`.
- Do not parse V3 JSON as V4 input.
- Cache writes are best-effort after validation. Cache persistence failure must
  not reject the current remote catalog.
- Normalize data at the catalog boundary. UI components should only read
  normalized `links` and `actions`.
- Do not add real sponsor/provider/campaign data to tests, fixtures, examples,
  comments, or this plan. Use `example.invalid` and synthetic names.

## Task 1: Collapse Runtime Contract To V4

**Files:**

- Modify: `src/features/AccountManagement/sponsors/types.ts`
- Modify: `src/features/AccountManagement/sponsors/catalog.ts`
- Remove: `src/features/AccountManagement/sponsors/catalogV4.ts`
- Test: `tests/features/AccountManagement/sponsors/catalog.test.ts`

- [ ] Add or update tests proving `normalizeSponsorCatalog` accepts only
      `schemaVersion: 4`.
- [ ] Add or update tests for whole-locale fallback, unknown-field rejection,
      invalid action URLs, disabled/expired campaigns, and optional action
      visibility.
- [ ] Remove V3 raw item types and legacy normalized bridge fields from the
      current `SponsorRecommendation` contract.
- [ ] Move V4 normalization into `catalog.ts`.
- [ ] Delete `catalogV4.ts`.
- [ ] Run:

```bash
pnpm vitest run tests/features/AccountManagement/sponsors/catalog.test.ts
```

Expected: PASS.

## Task 2: Make Loading V4-Only

**Files:**

- Modify: `src/features/AccountManagement/sponsors/constants.ts`
- Modify: `src/features/AccountManagement/sponsors/loader.ts`
- Modify: `src/features/AccountManagement/sponsors/storage.ts`
- Test: `tests/features/AccountManagement/sponsors/loader.test.ts`
- Test: `tests/features/AccountManagement/sponsors/storage.test.ts`

- [ ] Export the V4 remote URL and bundled V4 catalog.
- [ ] Remove manifest URL, manifest capability constants, and V3 remote runtime
      constants.
- [ ] Load remote V4, then V4 cache, then bundled V4.
- [ ] Keep the cache schema/source-discriminated and reject mismatched cache
      envelopes.
- [ ] Remove V3 runtime fallback and legacy cache reads from current loading.
- [ ] Run:

```bash
pnpm vitest run tests/features/AccountManagement/sponsors/loader.test.ts tests/features/AccountManagement/sponsors/storage.test.ts
```

Expected: PASS.

## Task 3: Update Public Artifacts

**Files:**

- Add/modify: `public/sponsor-catalog.v4.json`
- Preserve: `public/sponsor-catalog.json`
- Remove: `public/sponsor-catalog-manifest.json`
- Test: `tests/features/AccountManagement/sponsors/publicCatalog.test.ts`

- [ ] Ensure `public/sponsor-catalog.v4.json` validates as V4.
- [ ] Ensure `public/sponsor-catalog.json` still validates as the legacy artifact
      for old clients.
- [ ] Assert the manifest artifact is absent.
- [ ] Run:

```bash
pnpm vitest run tests/features/AccountManagement/sponsors/publicCatalog.test.ts
```

Expected: PASS.

## Task 4: Update UI Consumers

**Files:**

- Modify sponsor recommendation card, section, hooks, and action handlers as
  needed.
- Test relevant sponsor UI tests.

- [ ] Ensure visit-provider uses `links.primary`.
- [ ] Ensure add-account, bookmark fallback, and API credential profile fallback
      use only `actions.*` payloads.
- [ ] Remove UI references to legacy fields.
- [ ] Run focused UI tests:

```bash
pnpm vitest run tests/features/AccountManagement/sponsors
```

Expected: PASS.

## Task 5: Final Validation

- [ ] Run focused sponsor and impacted account-management tests:

```bash
pnpm vitest run tests/features/AccountManagement/sponsors tests/features/AccountManagement/AccountDialog.test.tsx tests/features/AccountManagement/components/NewcomerSupportCard.test.tsx
```

Expected: PASS.

- [ ] Run TypeScript validation:

```bash
pnpm compile
```

Expected: PASS.

- [ ] Stage only task-scoped files and run:

```bash
pnpm run validate:staged
```

Expected: PASS.

- [ ] Inspect the final diff:

```bash
git diff --stat
rg -n "sponsor-catalog-manifest|catalogV4|primaryAffiliateUrl|websiteUrl|fallbackHints|accountPrefill" src tests public docs/superpowers/specs/2026-06-11-sponsor-catalog-compatibility-design.md docs/superpowers/plans/2026-06-11-sponsor-catalog-compatibility.md
```

Expected:

- Runtime source has no manifest path.
- Runtime source has no V3 recommendation bridge fields.
- V3 public JSON remains for old clients.
- Tests and docs do not include real sponsor/provider/campaign details.
- UI handlers do not derive bookmark URLs or API base URLs from
  `links.primary`, `primaryAffiliateUrl`, or `websiteUrl`.

## Out Of Scope

- Do not migrate old released clients.
- Do not remove the legacy `public/sponsor-catalog.json` artifact.
- Do not introduce remote runtime schema negotiation unless a future product
  requirement needs remote gray rollout or capability negotiation.
- Do not change add-account side-panel handoff behavior outside sponsor action
  payloads.
- Do not add browser E2E coverage unless implementation changes
  cross-entrypoint navigation in a way Vitest cannot cover.
- Do not record URLs, hosts, provider names, API base URLs, raw copy, or
  campaign text in analytics.

## Self-Review Notes

- Spec coverage:
  - Legacy artifact preservation: Task 3.
  - V4 locale campaign schema and whole-locale fallback: Task 1.
  - V4-only loader and cache isolation: Task 2.
  - UI action contract: Task 4.
  - Validation/testing strategy: Task 5.
- Placeholder scan: All examples use `example.invalid` or synthetic provider
  names. No real sponsor/campaign data is required by this plan.
- Type consistency: Normalized UI fields are consistently named
  `links.primary`, `actions.addAccount`, `actions.bookmarkFallback`, and
  `actions.apiCredentialProfileFallback`.
