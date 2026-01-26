## 1. Audit & Decisions

- [ ] 1.1 Audit current `console.*` usage and identify hotspots (frequent/noisy logs, potential secret leakage).
- [ ] 1.2 Decide log policy for `error` when console logging is disabled (suppress all vs allow errors-only) and document the choice in `openspec/changes/unified-logging/design.md`.

## 2. Logger Core

- [ ] 2.1 Implement unified logger utility (`createLogger(scope)` with `debug/info/warn/error`) and level gating.
- [ ] 2.2 Implement console sink mapping per spec (`debug`→`console.debug`, `info`→`console.info`/`console.log`, `warn`→`console.warn`, `error`→`console.error`).
- [ ] 2.3 Implement safe log detail serialization with redaction of sensitive keys and URL sanitization (reusing `utils/sanitizeUrlForLog.ts` where applicable).
- [ ] 2.4 Ensure logger never throws (handles circular/non-serializable details) and avoids expensive serialization when suppressed.
- [ ] 2.5 Add standardized per-context prefixing (Background/Content/Popup/Options/SidePanel) in addition to module scope.

## 3. Preferences & Configuration Wiring

- [ ] 3.1 Extend `UserPreferences` model to include logging settings (console enabled + minimum level) and update `DEFAULT_PREFERENCES`.
- [ ] 3.2 Add service helpers in `services/userPreferences.ts` to read/update logging preferences and ensure backward-compatible default merging + save-back migration so stored preferences always include the logging settings.
- [ ] 3.3 Expose logging settings and update actions via `contexts/UserPreferencesContext.tsx` (or existing preference update patterns).
- [ ] 3.4 Define default behavior for development vs production builds and ensure it is applied consistently across contexts.

## 4. Options UI (User Switch)

- [ ] 4.1 Add a logging settings section to the options UI (toggle console logging; select minimum log level).
- [ ] 4.2 Add/adjust i18n keys for the new settings in `locales/*/settings.json` (and any other relevant namespaces).
- [ ] 4.3 Verify toggling settings updates storage and takes effect without requiring a restart (where feasible).

## 5. Refactor Call Sites

- [ ] 5.1 Replace logging in high-impact areas first (e.g., content script guards like `entrypoints/content/messageHandlers/utils/cloudflareGuard.ts`).
- [ ] 5.2 Replace remaining `console.*` usage in `services/` and `utils/` with the unified logger, choosing appropriate log levels.
- [ ] 5.3 Replace remaining `console.*` usage in UI/entrypoints (`entrypoints/`) with the unified logger, choosing appropriate log levels.
- [ ] 5.4 Confirm no sensitive fields (tokens/API keys/backups) are emitted in any remaining logs.

## 6. Tests & Guardrails

- [ ] 6.1 Add unit tests for logger: level gating, console method mapping, redaction behavior, and circular detail handling.
- [ ] 6.2 Add tests for preference loading/migration to ensure logging defaults are applied and updates persist.
- [ ] 6.3 (Optional) Add lint guardrails to prevent new direct `console.*` usage outside the logger implementation and tests.

## 7. Verification

- [ ] 7.1 Run `pnpm test` and ensure logger-related tests pass.
- [ ] 7.2 Run `pnpm lint` (and formatting if required by CI) and confirm no new lint issues are introduced.
