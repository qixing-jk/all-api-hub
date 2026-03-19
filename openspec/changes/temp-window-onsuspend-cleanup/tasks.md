## 1. Recon and scope guardrails

- [x] 1.1 Review `src/utils/browser/browserApi.ts`, `src/entrypoints/background/index.ts`, and `src/entrypoints/background/tempWindowPool.ts` to confirm which existing lifecycle wrappers and temp-context destroy helpers should be extended instead of duplicated.
- [x] 1.2 Confirm the implementation scope stays limited to temp-window fallback contexts and does not change `src/services/checkin/externalCheckInService.ts` or the normal temp-context reuse and delayed-close behavior.

## 2. Suspend cleanup implementation

- [x] 2.1 Add a background lifecycle helper for `runtime.onSuspend` in `src/utils/browser/browserApi.ts`, following the existing wrapper style and degrading safely when the hook is unavailable.
- [x] 2.2 Expose a best-effort temp-context cleanup entrypoint from `src/entrypoints/background/tempWindowPool.ts` that reuses existing tracked-context destroy logic, clears in-memory temp-context mappings, and emits suspend-cleanup diagnostics.
- [x] 2.3 Register the suspend listener in `src/entrypoints/background/index.ts` and wire it to the temp-window cleanup entrypoint without changing the current request-completion release flow; add brief clarifying comments where the best-effort lifecycle constraint is non-obvious.

## 3. Verification

- [x] 3.1 Add or update targeted tests covering the new `browserApi` suspend wrapper, background listener registration, and temp-window suspend cleanup behavior.
- [x] 3.2 Run `pnpm lint`.
- [x] 3.3 Run the smallest related Vitest command for the touched behavior, covering `tests/utils/browserApi.test.ts`, the relevant background-entrypoint test, and the temp-window suspend cleanup test file.
