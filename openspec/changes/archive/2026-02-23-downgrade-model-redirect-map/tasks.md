## 1. Matching Utilities

- [x] 1.1 Add a shared model token/signature helper for alias + version checks
- [x] 1.2 Add a version-compatibility predicate (reject downgrade/upgrade)

## 2. Metadata Normalization (Version-Safe)

- [x] 2.1 Update `modelMetadataService.findStandardModelName` fuzzy matching to be version-safe and deterministic
- [x] 2.2 Extend `tests/services/modelMetadata/ModelMetadataService.test.ts` with cross-version rejection and same-version alias acceptance cases

## 3. Model Redirect Mapping Guardrails

- [x] 3.1 Add defense-in-depth validation in `ModelRedirectService.generateModelMappingForChannel` to skip incompatible candidates
- [x] 3.2 Extend `tests/services/modelRedirect/ModelRedirectService.test.ts` to cover the reported downgrade/upgrade cases (Claude/Gemini/GPT) and verify safe alias mappings still work

## 4. Documentation

- [x] 4.1 Update `docs/docs/model-redirect.md` to document that auto-generated mappings will not downgrade/upgrade model versions and incompatible versions are left unmapped

## 5. Verification

- [x] 5.1 Run `pnpm -s test` (at minimum the model metadata + model redirect test suites)
- [x] 5.2 Run `pnpm -s lint` and `pnpm -s format:check`

Notes:
- Tests were run for `tests/services/modelMetadata/ModelMetadataService.test.ts` and `tests/services/modelRedirect/ModelRedirectService.test.ts`.
- `pnpm -s lint` passes (with warnings).
- `pnpm -s format:check` passes.

