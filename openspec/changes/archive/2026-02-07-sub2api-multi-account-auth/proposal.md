## Why

Sub2API now commonly uses short-lived JWT access tokens with refresh-token rotation, which makes the extension’s current “read dashboard localStorage session” approach fragile and effectively single-account per origin. Users need a way to manage multiple Sub2API accounts on the same site and keep them refreshing reliably, even when the dashboard session changes.

## What Changes

- Allow Sub2API accounts to store an **exportable** refresh-token credential (and related metadata) in extension account data, similar to how cookie-auth data is stored and exported today.
- Support multiple Sub2API accounts for the same `baseUrl` by refreshing access tokens per-account using the stored refresh token (including rotation) instead of relying on a single dashboard localStorage session.
- Update Sub2API auto-detect to optionally capture `refresh_token` / `token_expires_at` from the dashboard when available, and persist them into the account if the user opts in.
- Add concise UI/UX guidance about refresh-token rotation conflicts and recommend an incognito/private-window capture workflow (log in → import → close window) to avoid the dashboard invalidating the extension-managed session.
- Update import/export + WebDAV backup flows to include Sub2API refresh-token credentials (with a short disclosure in UI/docs).
- Add/adjust tests for refresh-token rotation, multi-account isolation on the same origin, and failure modes (revoked/invalid refresh token → actionable health warning).

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `sub2api-jwt-account`: Support extension-managed Sub2API sessions by persisting/exporting refresh-token credentials per account, enabling reliable multi-account refresh on the same site origin without depending on a single dashboard localStorage login.

## Impact

- Storage/schema: `types/index.ts` (`SiteAccount`), migrations, and any export/import/WebDAV sync surfaces that serialize account data.
- UI: account add/edit dialog and i18n strings for Sub2API advanced auth fields + security disclosure.
- Services: `services/apiService/sub2api/**` refresh/auth logic, account refresh persistence, and auto-detect integration.
- Security/privacy: exported backups will contain long-lived Sub2API refresh tokens; code must avoid logging secrets and UI must clearly communicate the risk.
