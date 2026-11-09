# Sub2API login recovery

Reference: [PR #1839](https://github.com/qixing-jk/all-api-hub/pull/1839), which introduced shared Cookie recovery.

Scope: extend the existing Sub2API account type's continued-access capability. Existing same-origin password/OAuth support remains the boundary; split-origin deployments remain excluded by their login capability. No new site types, domains or check-in methods.

## Protocol evidence and decisions

- Native source: Wei-Shaw/sub2api [`frontend/src/stores/auth.ts` at `6b4b37d`](https://github.com/Wei-Shaw/sub2api/blob/6b4b37db43443b5e88e424fe3c69602cc3810dfb/frontend/src/stores/auth.ts). The store saves access token, optional refresh token and expiry after password/OAuth login. Refresh rotates both tokens.
- Preserve token authentication and existing token refresh/browser-session recovery as the first choices. Only a definitive authentication failure admits configured, opt-in login recovery. An initial refresh token is not required. Capture renewal material before the login window closes and verify the exported access token against `/api/v1/auth/me` without Cookie authentication.
- Reuse account login configuration, shared credential recovery, identity/configuration checks and atomic persistence. Serialize login recovery with token rotation. Stored-account refresh and display requests share the native auth-session port. Cookie recovery retains its independent verification and manual editor workflow.
- Cover account refresh, dashboard reads/key inventory and existing guarded check-in recovery. General key mutations are excluded from the new login fallback. Check-in rechecks status and execution intent before a recovered mutation.
- Preserve uncertain renewal failures when no browser session is available; browser absence does not prove that renewal was rejected. Proxy/protection responses do not establish a site authentication failure.
- User setup: select password or supported OAuth, enable automatic recovery, save and retry. Missing native refresh tokens are allowed; replacement login without renewal material clears obsolete renewal fields. No refresh-token input or automatic-onboarding flow is added.
- Reuse existing configuration and error UI. Public catalogs remain unchanged. Usage documentation is synchronized in Chinese, English and Japanese.

## Acceptance boundaries

Maintained tests cover recovery ordering, complete credential persistence and clearing, cancellation, identity/configuration changes, concurrent login/rotation, uncertain failures, guarded check-in and excluded key mutations. `tests/services/accounts/accountStorage/sub2apiLoginRecovery.test.ts` exercises the actual stored-account refresh entry point. `e2e/sub2apiLoginRecovery.spec.ts` covers settings, password login, credential export/persistence, subsequent refresh-token renewal and reopened settings with a controlled HTTP fixture.

Hosted deployment and hosted OAuth remain unverified; closing those gaps requires a supplied deployment/account and authorized OAuth interaction. OAuth export, older deployments without refresh tokens and failure paths have automated fixture coverage only. Existing method/host boundaries remain unchanged.

Local review evidence is retained outside delivery in `browser-run4/`, `browser-run3/`, `browser-final/`, `upstream-auth.ts`, and the ignored `test-results/sub2api-*` and `test-results/scout-sub2api-20261110/` output groups. These preserve browser captures and failure/success evidence for review; they are not public attachments.

PR #1852 follow-up evidence is retained locally in `test-results/pr-1852/`: the editor-save regression, source CI failure, coverage reports and merge/browser validation. An unchanged Sub2API editor now retains the latest stored credential pair under the account write lock; explicit credential or identity edits remain effective. Loaded credential evidence includes access-only accounts. Hosted validation gaps above remain unchanged.
