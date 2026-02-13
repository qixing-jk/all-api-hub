## Context

All API Hub treats “keys” as upstream API tokens managed by supported backends (One-API/New-API family, OneHub, etc.) via `GET/POST /api/token/…` (see `services/apiService/common/*` and per-site overrides).

Today, it is possible for a stored account to have **zero** upstream tokens (newly created users, imported/legacy data, or tokens deleted outside the extension). Several user flows either fail or become awkward in this state (copy key, key management, managed-site admin flows). The codebase already contains a best-effort helper to lazily provision a token when needed:

- `services/accountOperations.ts`: `ensureAccountApiToken(account, displaySiteData, toastId?)`
  - Fetches token list via `getApiService(siteType).fetchAccountTokens(...)`
  - Creates a default token via `getApiService(siteType).createApiToken(...)` when the list is empty

However, this behavior is currently **on-demand** (only triggered by some features). This change expands it to:

1) Automatically provision a default token after adding an account.
2) Provide a user-initiated bulk repair action to ensure all existing accounts have at least one token.

Important constraints:

- Token operations require valid stored credentials (`SiteAccount.account_info.access_token` and/or `cookieAuth.sessionCookie`), and must never log raw keys.
- Some site types are not token-management compatible (notably `sub2api`, whose API surface lives under `/api/v1/*` and does not expose `/api/token/*`).
- Bulk operations can involve dozens of accounts; network calls must be rate-limit friendly and resilient to partial failures.

## Goals / Non-Goals

**Goals:**

- After a successful “Add account”, best-effort ensure the account has **≥ 1** upstream token.
- Add a manual “repair missing keys” action that scans enabled accounts and creates a default token for any eligible account with zero tokens.
- Skip accounts that should not be touched (e.g., disabled accounts) and site types that do not support token management (e.g., `sub2api`).
- Provide clear UX feedback and a summary of created/skipped/failed accounts without leaking secrets.

**Non-Goals:**

- Changing the persistent account schema or storing token keys locally.
- Creating more than one token per account, or managing token rotation/cleanup.
- Making token creation implicit in unrelated flows (e.g., exports) beyond what already exists.
- Adding new backend integrations or altering upstream API semantics.

## Decisions

### 1) Reuse existing provisioning logic (`ensureAccountApiToken`)

**Decision:** Build both “auto on add” and “bulk repair” on top of the existing default-token provisioning logic in `services/accountOperations.ts`.

**Rationale:** The repo already has a known-good default token payload (`generateDefaultToken`) and a provisioning sequence (`fetch → create → refetch`) that works with existing API services and overrides.

**Alternatives considered:**

- Duplicating token creation logic in UI pages (rejected: increases drift and bypasses existing hardening).
- Introducing a new API endpoint or server-side feature (rejected: out of scope and not possible for arbitrary deployments).

### 2) Keep current provisioning semantics

**Decision:** Keep the existing token provisioning behavior and default token definition unchanged, and reuse it for the new triggers.

**Rationale:** The request is to extend when provisioning happens (on add + bulk repair), not to change how tokens are created. Preserving current semantics reduces regressions for existing flows that already depend on `ensureAccountApiToken(...)`.

**Implementation approach (high level):**

- Keep `generateDefaultToken()` payload as-is (including token name and fields).
- For “auto on add”, invoke provisioning in a best-effort manner after the account is persisted; failures must not fail the add flow.
- For bulk repair, implement a dedicated long-running operation that:
  - loads enabled accounts first (`accountStorage.getEnabledAccounts()`)
  - avoids showing per-account provisioning toasts (progress dialog + final summary)
  - continues on error

**Alternatives considered:**

- Refactor into toast-less “core” helpers (not chosen; preference is to keep current logic).

### 3) Capability gating: skip unsupported site types and insufficient auth

**Decision:** Bulk repair and auto-provision MUST skip:

- `site_type === "sub2api"` (Sub2API override does not support `/api/token/*`).
- Accounts whose `authType === "none"` (no credentials to list/create tokens).
- Disabled accounts (`disabled === true`).

**Rationale:** Avoid sending invalid requests, reduce noise/errors, and respect existing “disabled accounts do not participate in activities” principle.

**Alternatives considered:**

- Attempt token calls and treat 404/401 as “unsupported” (kept as a fallback mitigation, but explicit skipping is clearer and cheaper).

### 4) Auto-provision timing: post-save, best-effort, non-blocking

**Decision:** Run auto-provision **after** the account is successfully persisted (i.e., after `accountStorage.addAccount(...)` returns an id), gated by a user setting, and treat failures as non-fatal to the add flow.

**Rationale:** The user’s primary intent is to add the account; token creation is a side effect that can fail due to transient network/auth issues. Persist-first also avoids losing the account if provisioning fails.

**Implementation approach (high level):**

- In `validateAndSaveAccount(...)`, after receiving the new `accountId`, load the stored `SiteAccount` (or reuse the in-memory object) and derive `DisplaySiteData` via `accountStorage.convertToDisplayData(...)`.
- Kick off provisioning:
  - either `await` it while showing a single “Checking API keys…” toast and then dismiss/update,
  - or fire-and-forget (preferred) and show a success/warn toast upon completion.
- On failure: show a non-blocking warning and suggest using the manual repair action.

**Alternatives considered:**

- Provision before saving (rejected: can fail and block account add; worse UX).
- Provision inside UI hook only (rejected: would miss other account-add entry points and duplicates logic).

### 5) Manual bulk repair: entry point in Key Management (Options)

**Decision:** Place the bulk action in the Options “Key Management” area (`entrypoints/options/pages/KeyManagement/*`).

**Rationale:** This feature is directly about token inventory and fits the user’s mental model of where keys are managed. It also avoids cluttering the account list UI with long-running operations.

**Implementation approach (high level):**

- Add a button like “Repair missing keys” (i18n) that opens a temporary progress dialog.
- Execute the repair as a background job and stream progress updates to the dialog in real time (pattern: `browser.runtime.onMessage` progress events as used by Managed Site Model Sync).
- Persist the latest progress snapshot and final results so the dialog can be closed/reopened without losing visibility.
- The repair job MUST NOT be tied to the dialog lifecycle (closing the dialog MUST NOT cancel the repair).
- The dialog MUST NOT show disabled accounts as candidates or in results.

**Alternatives considered:**

- Put the action in Account Management (rejected: less discoverable for “keys” and mixes concerns).

### 6) Per-site rate limiting for repair

**Decision:** Apply rate limiting per `site_url` origin: accounts sharing the same origin are processed sequentially, while different origins are not globally serialized.

**Rationale:** Many upstream sites are rate-limited and/or protected by WAF. Limiting concurrency per site avoids tripping per-origin protections while still keeping bulk repair fast for users with many distinct sites.

**Implementation approach (high level):**

- Normalize each account’s `site_url` to an origin key (the same base used for API calls).
- Build a per-origin queue/lock so only one account per origin is processed at a time.
- Allow different origins to proceed independently (no single global “one at a time” limiter).

**Alternatives considered:**

- Global sequential processing (rejected: unnecessarily slow across many different sites).

## Risks / Trade-offs

- **[Auto-creation has side effects]** → Mitigation: keep it best-effort, non-blocking, and skip unsupported/unauthenticated accounts; provide an explicit manual repair path.
- **[Bulk repair is slow for many accounts]** → Mitigation: show progress + allow the user to re-run; keep concurrency low to improve success rate.
- **[Auth/WAF failures cause partial completion]** → Mitigation: continue on error and present a final summary; do not stop the whole batch.
- **[Sub2API/unsupported sites accidentally hit `/api/token/*`]** → Mitigation: explicit site-type skip list (at minimum `sub2api`) and auth gating.
- **[Progress UI goes stale when the page reloads]** → Mitigation: persist progress snapshots and rehydrate the dialog from storage; continue streaming updates when the UI is open.

## Migration Plan

- No stored-data migration required.
- Release is additive; rollback is removing the new triggers/UI action.

## Open Questions

- (Resolved) Auto-provision on add is configurable via a user setting.
- (Resolved) Bulk repair always skips disabled accounts and does not show them.
- (Resolved) Default token definition remains as-is (no localization changes).
