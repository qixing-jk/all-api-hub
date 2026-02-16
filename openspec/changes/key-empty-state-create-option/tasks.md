## 1. Empty-State UX

- [x] 1.1 Update `AccountActionButtons.handleSmartCopyKey` to open the copy-key dialog when `fetchAccountTokens` returns an empty array (replace `actions.noKeyFound` toast-only behavior).
- [x] 1.2 Extend `CopyKeyDialog` empty token list UI to render an explicit “Create key” action in the pop-up.
- [x] 1.3 Add/adjust i18n strings for the empty-state title/description, create action label, loading, success, and error messages.

## 2. Reuse Key Creation Logic

- [x] 2.1 Implement a “create default key” action in `useCopyKeyDialog` that reuses `generateDefaultTokenRequest()` and calls `getApiService(siteType).createApiToken(...)`.
- [x] 2.2 After create succeeds, refetch token inventory and update the dialog state; if exactly one token is available, auto-copy it to the clipboard and show success feedback.
- [x] 2.3 Handle create failures (API error or no token found after refresh) with user-facing feedback and keep the dialog actionable for retry.
- [x] 2.4 Add a “custom key” create option that reuses `AddTokenDialog` to let users manually configure token fields in-place (no navigation), then refresh tokens and auto-copy when only one exists.

## 3. Tests

- [x] 3.1 Add a component test for `AccountActionButtons` verifying that an empty token list triggers `onCopyKey(site)` (and does not emit the legacy “no key found” toast-only path).
- [x] 3.2 Add a component test for `CopyKeyDialog` empty-state “Create key” flow: create token → refresh tokens → copy key when only one token exists.
- [x] 3.3 Add failure-path tests for `CopyKeyDialog`: create token fails and refresh returns empty after create; verify error feedback and retry remains available.
- [x] 3.4 Add a component test for `CopyKeyDialog` empty-state “Custom key” flow: open `AddTokenDialog` → submit → refresh tokens → auto-copy when only one token exists.

## 4. Verification

- [x] 4.1 Run `pnpm -s test` (or targeted tests) and `pnpm -s compile` to validate the change.
- [ ] 4.2 Manual smoke test in the extension UI: click the account key icon for an account with zero tokens and confirm both quick-create and custom-create flows work end-to-end.
