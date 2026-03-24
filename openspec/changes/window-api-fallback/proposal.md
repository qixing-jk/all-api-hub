## Why

Temporary browser-backed flows currently depend on window creation in places where a tab-backed context would still be good enough to complete the job. When the browser refuses popup/window creation, flows such as shield bypass and hidden New API channel-key loading can fail with an unrecoverable window error even though the extension could often continue by rolling back to a tab-backed temp context.

## What Changes

- Unify temp-context acquisition behind one fallback-aware contract so callers can request a temporary browser context without duplicating window-versus-tab decision logic.
- Add automatic rollback from popup-window creation to a tab-backed temp context when the browser disallows windows or window creation fails for recoverable reasons.
- Reuse the unified temp-context fallback in shield-bypass/temp-window flows so temporary verification pages still open when popup windows are blocked.
- Extend New API managed verification and hidden channel-key loading flows to reuse the same browser-backed fallback path instead of surfacing a raw window-creation failure when a recoverable tab fallback is available.
- Preserve explicit windows-only constraints, such as flows that require isolated incognito/private-window state, and report those cases as structured unsupported failures instead of silently degrading behavior.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `temp-window-fallback`: temp-context acquisition gains recoverable window-to-tab rollback behavior and structured handling for browsers that do not allow popup windows.
- `new-api-managed-secure-verification`: hidden channel-key reads and verification-assisted retries reuse the fallback-aware temp-context path so recoverable browser window failures do not terminate the flow prematurely.

## Impact

- Affected code: `src/entrypoints/background/tempWindowPool.ts`, `src/utils/browser/browserApi.ts`, `src/services/managedSites/providers/newApiSession.ts`, `src/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification.ts`, `src/features/ManagedSiteVerification/useNewApiManagedVerification.tsx`, related options/key-management entrypoints and i18n resources
- Affected behavior: temporary shield-bypass pages, browser-backed verification/session recovery, hidden managed-site channel-key loading, and error handling when popup windows are unavailable
- Validation impact: temp-window pool tests, New API managed verification/session tests, and targeted UI-flow tests for hidden channel-key loading need coverage for recoverable window-blocked scenarios
