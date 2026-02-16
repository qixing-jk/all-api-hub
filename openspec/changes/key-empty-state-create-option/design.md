## Context

Today, the account “copy key” icon uses a “smart” path in `features/AccountManagement/components/AccountActionButtons/index.tsx`:
- Fetch token inventory first.
- If exactly one token exists, copy it directly.
- If multiple tokens exist, open `CopyKeyDialog` to let the user choose.
- If zero tokens exist, show a toast error (`actions.noKeyFound`), which is a dead-end.

`CopyKeyDialog` already supports an empty token list state (`features/AccountManagement/components/CopyKeyDialog/TokenList.tsx`), but it only renders an `EmptyState` and does not provide a creation action.

Separately, the repo already has stable “default token” creation logic used by key auto-provisioning (`services/accountKeyAutoProvisioning/ensureDefaultToken.ts`), including a stable default payload (`generateDefaultTokenRequest`) and a helper that ensures a token exists (`ensureDefaultApiTokenForAccount`).

## Goals / Non-Goals

**Goals:**
- Replace the “no available key” dead-end with a pop-up that offers an explicit “Create key” action when the token list is empty.
- Reuse the existing default-token creation logic (stable payload + existing API service call) and refresh token inventory after creation.
- Allow users to manually configure token fields via the existing Add Token dialog, without navigating away from the copy-key flow.
- Preserve the current “smart copy” behavior for the 1-token and multi-token cases.
- Provide clear user feedback (loading, success, failure) and keep all new UI copy i18n’d.

**Non-Goals:**
- Automatically creating tokens without an explicit user action.
- Changing key auto-provisioning-on-add behavior or the bulk repair flow.
- Introducing a new token model or changing token payload defaults.

## Decisions

- **Use `CopyKeyDialog` as the pop-up surface for the empty state.**
  - Update the empty token list view (`CopyKeyDialog/TokenList.tsx`) to render a primary quick-create action (default token) and a secondary custom-create action.
  - Ensure the dialog can be opened from the key icon even when the token inventory is empty (see next decision).

- **Open the dialog instead of showing `actions.noKeyFound`.**
  - In `AccountActionButtons.handleSmartCopyKey`, when the preflight `fetchAccountTokens` returns an empty array, call `onCopyKey(site)` rather than toasting the error.
  - This keeps the “smart copy” UX (preflight + fast-path for single token), but turns the empty result into an actionable pop-up.

- **Token creation uses the existing default token payload and API service.**
  - Reuse `generateDefaultTokenRequest()` from `services/accountKeyAutoProvisioning/ensureDefaultToken.ts`.
  - Trigger token creation via `getApiService(siteType).createApiToken(...)` using the account’s auth context (the same data already used for token listing).
  - After creation, re-fetch tokens in the dialog and proceed:
    - If exactly one token is available, copy it immediately (matches original user intent).
    - If multiple tokens are available (race/parallel creation), show the list for selection.

- **Custom token creation reuses the existing Add Token dialog UI.**
  - Use `entrypoints/options/pages/KeyManagement/components/AddTokenDialog` to let users set token name/quota/expiration/model limits/IP limits/group.
  - Run the same post-create refresh + copy behavior as the quick-create flow.
  - Keep the creation flow within the current dialog surface (no navigation/jump to other pages).

## Risks / Trade-offs

- **Extra network round trips** (create + refetch): acceptable for an explicit user action; mitigate with loading states and disabling the button while creating.
- **Token creation may be unsupported for some accounts/site types** (auth type, disabled accounts, Sub2API, etc.): reuse existing eligibility checks where they already exist, and show a clear failure toast with a suggested next step (e.g., open Key Management).
- **Clipboard write may fail** (permission/user gesture constraints): preserve existing fallback copy messaging and keep the created token visible/selectable in the dialog.
