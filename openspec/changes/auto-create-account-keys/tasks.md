## 1. Preferences (Configurable auto-provision)

- [x] 1.1 Add a new boolean preference (e.g., `autoProvisionKeyOnAccountAdd`) to `UserPreferences` and `DEFAULT_PREFERENCES` (`services/userPreferences.ts`).
- [x] 1.2 Add a typed update helper for the new preference in `userPreferences` (`services/userPreferences.ts`) and expose it via `useUserPreferencesContext` (`contexts/UserPreferencesContext.tsx`).
- [x] 1.3 Add an Options UI toggle for the preference (Basic Settings section recommended) with i18n strings (`entrypoints/options/pages/BasicSettings/components/*`, `locales/*/settings.json`).

## 2. Auto-provision on account add

- [x] 2.1 Implement post-save auto-provisioning in `validateAndSaveAccount` (`services/accountOperations.ts`) gated by the new preference.
- [x] 2.2 Apply eligibility gating for auto-provision on add: skip `sub2api`, `authType = "none"`, and any account marked disabled (defensive check).
- [x] 2.3 Ensure failures are best-effort: token inventory/creation errors MUST NOT fail the account add flow; surface a non-blocking warning and/or safe log without leaking secrets.

## 3. Manual bulk repair (background + progress dialog, per-site rate limiting)

- [x] 3.1 Add a “Repair missing keys” action entry in the Key Management UI (`entrypoints/options/pages/KeyManagement/components/Header.tsx`) that opens a temporary progress dialog.
- [x] 3.2 Add runtime action(s) + background handler to start the repair job and to fetch the latest progress snapshot (pattern: Managed Site Model Sync message handler in `services/modelSync/scheduler.ts`).
- [x] 3.3 Implement the background repair runner to scan stored accounts and ensure each eligible account has ≥ 1 token, persisting progress snapshots and final results (recommended location: new `services/accountKeyAutoProvisioning/*` or `services/accountOperations.ts`).
- [x] 3.4 Ensure disabled accounts are excluded from bulk repair candidates and MUST NOT be shown in the dialog/results (use `accountStorage.getEnabledAccounts()` or equivalent filtering).
- [x] 3.5 Implement per-site-origin rate limiting for bulk repair keyed by normalized `site_url` origin (no single global “one at a time” limiter); accounts sharing an origin must be processed sequentially while different origins are not blocked by the limiter.
- [x] 3.6 Implement progress streaming from background to UI via `browser.runtime.onMessage` events, and have the dialog rehydrate from persisted progress on open/reload (no long-lived port required).
- [x] 3.7 Add dialog UX for progress + final summary (counts for created/already-had/skipped/failed) with i18n strings (`locales/*/keyManagement.json` and/or `locales/*/messages.json`).

## 4. Tests

- [x] 4.1 Add unit tests for preference default + update wiring (pattern: existing `openChangelogOnUpdate` tests) to ensure missing values resolve to defaults.
- [x] 4.2 Add unit tests for `validateAndSaveAccount` auto-provision gating and best-effort behavior (enabled/disabled, sub2api/none-auth skip, provisioning failure does not fail save).
- [x] 4.3 Add unit tests for bulk repair per-site rate limiting (same-origin operations do not overlap; different-origin operations are not globally serialized).
- [x] 4.4 Add a lightweight UI test for the Key Management “Repair missing keys” entry point (opens the progress dialog and subscribes to progress; disabled accounts not included).
