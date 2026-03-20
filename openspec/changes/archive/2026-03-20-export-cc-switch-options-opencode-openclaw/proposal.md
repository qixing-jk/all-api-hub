## Why

All API Hub already lets users export site credentials into CC Switch, but the current dialog only exposes `claude`, `codex`, and `gemini` as target apps. CC Switch now supports `opencode` and `openclaw`, so users who manage those CLI workflows still have to re-enter provider settings manually instead of using the existing one-click export flow.

## What Changes

- Extend the CC Switch export target list to include `opencode` and `openclaw` anywhere the shared CC Switch export dialog is used.
- Preserve the existing deeplink-based export flow so Key Management and API credential profile exports continue to open CC Switch with the selected account, token, endpoint, and optional model metadata.
- Define per-app export behavior for the new targets so the generated deeplink payload remains compatible with CC Switch's current provider import protocol, including clearly warning users when CC Switch still does not support configuring the relevant AI service API format through external import.
- Add or update user-facing labels, descriptions, and validation coverage for the expanded app list without introducing secret leakage in logs or UI errors.

## Capabilities

### New Capabilities

- `cc-switch-export`: Export an All API Hub account token or API credential profile into CC Switch using the supported target app identifiers, including `claude`, `codex`, `gemini`, `opencode`, and `openclaw`.

### Modified Capabilities

<!-- None -->

## Impact

- UI: `src/components/CCSwitchExportDialog.tsx` and any menus or flows that reuse it from Key Management and API credential profiles.
- Integration service: `src/services/integrations/ccSwitch.ts` for supported app identifiers and deeplink payload generation.
- Localization and tests: CC Switch dialog copy in `src/locales/*` plus unit/component coverage for the new export targets.
