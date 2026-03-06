## Why

Sub2API accounts can already be added to the extension and refreshed via dashboard JWTs, but their API keys still cannot be queried or managed from the existing key workflows. That blocks a core user goal from issue `#565`: selecting a Sub2API key and exporting it into a managed site's channel-creation flow without leaving All API Hub.

## What Changes

- Add Sub2API-specific key management support that maps the upstream JWT-authenticated user key APIs to the extension's existing token-management model.
- Enable existing key workflows for `sub2api` accounts, including key listing, create, edit, delete, copy, and downstream export flows that depend on account key inventory.
- Reuse the current Sub2API session handling rules so key-management requests can recover from expired JWTs via re-sync/refresh where possible, and show actionable login-required errors when they cannot.
- Map Sub2API key metadata needed by the UI, including key value, status, quota/usage limits, expiration, and group selection where available.
- Remove the current unsupported-site treatment for Sub2API inside key-management entry points and add localized strings and tests for the new behavior.

## Capabilities

### New Capabilities
- `sub2api-key-management`: Support querying and managing Sub2API user API keys through the extension's existing key-management, copy-key, and export workflows using Sub2API's authenticated `/api/v1/keys` and related group endpoints.

### Modified Capabilities
- None.

## Impact

- Affected areas: `src/services/apiService/sub2api`, key-management hooks/pages, copy-key and model-key dialogs, export integrations that consume `fetchAccountTokens`, i18n resources, and Sub2API-related tests.
- External APIs: Sub2API user key endpoints such as `GET/POST/PUT/DELETE /api/v1/keys`, plus user-available group endpoints used to populate key configuration choices.
- Dependencies: no new package dependencies expected; reuse existing account auth persistence, temp-window/content-script session recovery, and token-management UI patterns.
