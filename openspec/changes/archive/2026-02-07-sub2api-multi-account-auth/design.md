## Context

Sub2API deployments have moved toward short-lived JWT access tokens plus refresh tokens (with rotation). All API Hub’s current Sub2API integration primarily “piggybacks” on the dashboard’s origin localStorage (`auth_token`, `auth_user`, etc.) by reading it via content-script/temp-window flows. This makes Sub2API behavior effectively **single-account per origin** (because localStorage can only hold one dashboard session per origin per browser profile) and can become fragile when tokens expire or the user switches dashboard sessions.

This change introduces an **extension-managed Sub2API session** mode where each account can persist/export its own refresh token (similar to cookie-auth storage today), enabling reliable multi-account support on the same site origin without relying on the dashboard’s localStorage remaining stable.

Constraints:

- Extension contexts (popup/options/background) can run concurrently; refresh-token rotation must be resilient to races.
- Refresh tokens are secrets. The user explicitly wants them exportable; UX must make the risk explicit and code must never log them.
- Sub2API is upstream-controlled; some deployments may differ in token lifetimes, rotation rules, and session invalidation behavior.

## Goals / Non-Goals

**Goals:**

- Support multiple Sub2API accounts for the same `baseUrl` in a single extension instance.
- Allow Sub2API accounts to persist/export refresh-token credentials and use them to refresh access tokens per-account (including rotation).
- Provide a practical import flow to capture refresh-token credentials from a logged-in dashboard context (including an incognito/private-window workflow).
- Provide clear UX guidance to reduce refresh-token rotation conflicts (and actionable health errors when a token is invalidated).
- Preserve backward compatibility: existing Sub2API accounts without stored refresh tokens continue to work via dashboard-localStorage token re-sync where possible.

**Non-Goals:**

- Implementing “login with email/password” inside the extension.
- Guaranteeing that a refresh token remains valid if the user logs in/out elsewhere (server policies vary).
- Building full multi-session dashboard management; the extension only needs stable refresh for quota/account refresh.

## Decisions

### 1) Persist Sub2API refresh tokens as exportable account data

**Decision:** Extend the persisted `SiteAccount` model with an optional Sub2API auth/session blob that can store (and export) refresh-token credentials (and any related metadata such as expiry timestamp).

**Rationale:**

- Enables true multi-account per origin without being tied to dashboard localStorage.
- Matches the existing “cookie auth” pattern: user-provided secrets are part of account data and flow through import/export + WebDAV sync.

**Alternatives considered:**

- Keep refresh tokens only in page localStorage: cannot support multi-account and is brittle when sessions change.
- Store refresh tokens in a non-exported “secret store”: safer, but conflicts with the explicit requirement that refresh tokens may be exported.

### 2) Prefer extension-managed refresh when refresh token is present; avoid localStorage re-sync

**Decision:** When a Sub2API account has a stored refresh token, treat it as the source of truth for refreshing the access token. Do not fall back to “read dashboard localStorage and re-sync” for that account except during explicit “import from dashboard” flows.

**Rationale:**

- Prevents accidental account “flip” to whichever user is currently logged into the dashboard for that origin.
- Ensures multi-account isolation: each account refreshes with its own refresh token.

**Alternatives considered:**

- Always attempt localStorage re-sync on 401: can silently bind an account to the wrong dashboard session.

### 3) Token refresh triggers: buffer-before-expiry and 401 fallback

**Decision:** Refresh the access token using the stored refresh token when:

- An `expiresAt` value is present and the token is close to expiry (buffer window), or already expired, **or**
- A Sub2API request fails with HTTP 401 (treat as “token invalid/expired” and attempt a refresh once).

On successful refresh, persist rotated credentials (new access token, new refresh token, new expiry timestamp) back into the account.

**Rationale:**

- Avoids unnecessary refresh-token rotation on every request.
- Still recovers from missing/incorrect expiry metadata via the 401 path.

**Alternatives considered:**

- Refresh on every request: simplest but rotates refresh tokens too aggressively and increases server load.
- Only refresh on 401: works but can degrade UX with avoidable 401 spikes during auto-refresh.

### 4) Capture/import UX: “Import session from dashboard”, with incognito-friendly guidance

**Decision:** Provide UI actions to import Sub2API session credentials from a logged-in dashboard context:

- Prefer “current tab” (origin match) import when available.
- Fall back to existing temp-window flow when needed.
- Explicit opt-in to persist/export the refresh token.

Recommend an incognito/private-window capture workflow for users who don’t want to keep the dashboard logged in (and to reduce the chance that the dashboard rotates the same session in parallel):

1. Open an incognito/private window.
2. Log into Sub2API dashboard for the target account.
3. Use “Import session” in the extension to capture tokens.
4. Close the incognito/private window (clears site cookies/localStorage).

**Rationale:**

- Users cannot reliably copy refresh tokens manually without devtools; import avoids that friction.
- Incognito capture is much more convenient than separate profiles, while still avoiding “shared session rotation” with the normal dashboard.

**Alternatives considered:**

- Manual copy/paste of refresh token: error-prone and unfriendly.
- Requiring separate browser profiles/containers: effective but inconvenient and not always feasible.

### 5) Rotation race avoidance: per-account refresh lock across extension contexts

**Decision:** Ensure refresh-token rotation is serialized per account by using a per-account exclusive lock for the refresh operation (covering: read latest credentials → refresh call → persist rotated credentials). Use Web Locks API (`navigator.locks`) when available, and fall back to in-memory ordering within a single JS context.

**Rationale:**

- Prevents concurrent refresh attempts from different extension contexts from invalidating each other’s refresh token.

**Alternatives considered:**

- Rely on “last write wins” updates: can overwrite the latest rotated refresh token with a stale one, breaking subsequent refreshes.
- Route all refresh through a single background runtime service: robust, but higher complexity and MV2/MV3 differences.

## Risks / Trade-offs

- **[Exporting refresh tokens is high-risk]** → Mitigation: concise UI disclosure + detailed docs; mask token fields; never log secrets; emphasize that WebDAV backups must be protected.
- **[Server revokes refresh tokens on login/logout or policy changes]** → Mitigation: detect invalid refresh token errors and surface an actionable health warning (“re-import session”).
- **[Browser incognito/private limitations]** → Mitigation: clearly instruct users to enable “Allow in incognito/private” for the extension; provide non-incognito fallback import.
- **[Lock availability differs by context]** → Mitigation: use Web Locks when available; design refresh flow to be idempotent and retryable; keep network retry bounded to avoid loops.

## Migration Plan

- Data model: introduce optional Sub2API refresh-token fields with safe defaults (absent/empty means “legacy dashboard-session mode”).
- Behavior: keep existing Sub2API localStorage re-sync as a fallback only when refresh-token fields are not configured.
- UX: introduce an “Import session / Advanced Sub2API auth” section in account add/edit for Sub2API, plus i18n strings and security copy.
- Rollback: removing the feature should ignore the extra fields; existing accounts can continue using stored access tokens/localStorage re-sync.

## Open Questions

- What exact metadata do we persist alongside `refresh_token` (e.g., `token_expires_at`, last refresh timestamp, token “source”)? Keep minimal vs. improve observability.
- Do we support multiple refresh endpoints/paths for deployments that diverge from upstream (`/api/v1/auth/refresh`)?
- Should the UI offer an explicit “Revoke extension session” action (calling Sub2API logout/revoke endpoints) to help users rotate credentials safely?
