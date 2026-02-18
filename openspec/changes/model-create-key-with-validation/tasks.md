## 1. Compatibility logic

- [x] 1.1 Add a pure helper to parse a token model allow-list (`model_limits` / `models`) into a normalized string array
- [x] 1.2 Add a pure helper `isTokenCompatibleWithModel(token, model)` (enabled token + group + allow-list rules)
- [x] 1.3 Add unit tests covering compatibility edge cases (no allow-list, enabled allow-list includes/excludes, disabled token ignored, whitespace/duplicates)

## 2. Model List UI entry point

- [x] 2.1 Add a new per-model action button in `ModelItemHeader` to open the key compatibility flow
- [x] 2.2 Wire the action so it passes `{ account, modelId }` for both single-account and all-accounts modes
- [x] 2.3 Add i18n strings for the new action tooltip/aria-label

## 3. Model key compatibility dialog

- [x] 3.1 Implement `ModelKeyDialog` modal skeleton (header shows account + model; body handles loading/error/empty/success states)
- [x] 3.2 Implement on-demand token inventory loading for the selected account with retry behavior
- [x] 3.3 Compute `compatibleTokens` from loaded tokens using `isTokenCompatibleWithModel`
- [x] 3.4 Render compatible-token selection UI (default-select first compatible token; disable token-dependent actions until selected)
- [x] 3.5 Render “no compatible tokens” empty-state with explicit create actions (no auto-create)
- [x] 3.6 Implement “refresh after create” behavior and re-evaluate compatibility, including the “created but still no compatible key” error state
- [x] 3.7 Ensure all errors/toasts are sanitized and do not leak raw token keys

## 4. Reuse token creation UX (AddTokenDialog prefill)

- [x] 4.1 Extend `AddTokenDialog` to accept optional “prefill for model” inputs (model id, default name) in create mode
- [x] 4.2 Update `useTokenForm` to apply prefill only when creating (not when editing)
- [x] 4.3 Add tests for `AddTokenDialog` prefill behavior (model limits enabled + selected model present)

## 5. Integration + tests

- [x] 5.1 Add component tests for `ModelKeyDialog` covering: compatible tokens exist, none exist, create disabled for ineligible accounts, token-load failure retry
- [x] 5.2 Add integration-level test for Model List → open dialog → create custom key path (verifies the prefilled model limits are applied)
- [x] 5.3 Run `pnpm lint && pnpm format:check && pnpm compile && pnpm test` and fix any issues caused by the change
