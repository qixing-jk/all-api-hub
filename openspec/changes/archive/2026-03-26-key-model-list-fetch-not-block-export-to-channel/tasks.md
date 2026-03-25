## 1. Recon & Reuse

- [x] 1.1 Inspect `useChannelDialog().openWithAccount()` / `openWithCredentials()`, each managed-site provider `prepareChannelFormData()`, existing `fetchAvailableModels()` helpers, and the shared `ChannelDialog` model picker before editing code.

## 2. Provider Fallback Implementation

- [x] 2.1 Update the managed-site provider `prepareChannelFormData()` implementations so live upstream model loading no longer blocks dialog preparation.
- [x] 2.2 Preserve the current duplicate-detection and create-channel flows while ensuring the dialog can open with an empty editable model list when live upstream model loading fails, adding brief clarifying comments only where the fallback behavior is non-obvious.
- [x] 2.3 Add a non-blocking dialog warning that tells the user automatic model prefill failed and manual model entry is required.

## 3. Automated Coverage

- [x] 3.1 Add targeted tests for provider or dialog-preparation behavior covering the case where upstream model loading fails and token/account metadata is not auto-used as a substitute prefill source.
- [x] 3.2 Add targeted tests for the case where no usable live upstream models are available and the dialog still opens while channel creation remains blocked until models are entered.
- [x] 3.3 Add targeted tests for the non-blocking in-dialog warning shown when automatic model prefill fails.

## 4. Verification

- [x] 4.1 Run `pnpm lint`.
- [x] 4.2 Run the smallest related automated test command for the touched managed-site import fallback behavior, preferring a `vitest related --run` style command over a full-suite run.
