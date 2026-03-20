## 1. Repo Recon & Reuse

- [x] 1.1 Confirm the shared CC Switch export path by inspecting `src/services/integrations/ccSwitch.ts`, `src/components/CCSwitchExportDialog.tsx`, and the dialog entry points in Key Management, Account Management, and API Credential Profiles before editing.
- [x] 1.2 Review existing CC Switch-focused coverage in `tests/utils/ccSwitch.test.ts` and `tests/components/CCSwitchExportDialog.test.tsx` so implementation extends current seams instead of adding parallel test helpers.

## 2. Shared CC Switch App Support

- [x] 2.1 Extend the shared `CCSWITCH_APPS` / `CCSwitchApp` contract and deeplink validation in `src/services/integrations/ccSwitch.ts` to accept `opencode` and `openclaw`.
- [x] 2.2 Update `src/components/CCSwitchExportDialog.tsx` to render localized labels for the new app ids and preserve the shared dialog behavior across all existing export entry points.
- [x] 2.3 Keep default endpoint behavior app-aware in `src/components/CCSwitchExportDialog.tsx`: preserve the existing Codex `/v1` coercion, default `opencode` and `openclaw` to the stored base URL, and add a brief clarifying comment if the per-app defaulting logic would otherwise be non-obvious.

## 3. Localization & Focused Coverage

- [x] 3.1 Add or update CC Switch app option locale strings in the existing `src/locales/*/ui.json` resources for `opencode` and `openclaw`.
- [x] 3.2 Extend `tests/utils/ccSwitch.test.ts` to cover the new supported app ids and confirm deeplink generation still uses the selected `app` parameter without breaking existing validation.
- [x] 3.3 Extend `tests/components/CCSwitchExportDialog.test.tsx` to cover the new app options and the default-endpoint behavior for `opencode` / `openclaw` while preserving custom endpoint overrides.

## 4. Verification

- [x] 4.1 Run `pnpm lint` and `pnpm run validate:staged` for the touched change set, or document the blocker if `validate:staged` cannot be executed meaningfully outside its staged-file workflow.
- [x] 4.2 Run the smallest related automated test command for the touched behavior, such as `pnpm vitest --run tests/utils/ccSwitch.test.ts tests/components/CCSwitchExportDialog.test.tsx`, and document any environment blocker instead of broadening to unrelated suites.
