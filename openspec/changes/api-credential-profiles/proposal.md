## Why

Some users only receive an API relay credential bundle (base URL + API key) and do **not** have an admin/dashboard account to add a site account inside All API Hub. Today those users can run ad-hoc checks via Web AI API Check, but they cannot **persist** and **reuse** these credentials across the extension (verification, exports, copy actions).

This change adds first-class management for standalone API credential profiles (baseUrl + apiKey) so users can store, search, copy, verify, and export credentials even when account-based onboarding is unavailable.

## What Changes

- Add a new Options page for managing **API credential profiles**:
  - CRUD: create / edit / delete profiles
  - Search, filter, and metadata fields (tags, notes)
  - API key masking by default with explicit reveal controls
- Store profiles in extension local storage (treated as secrets; never logged raw).
- Support all `aiApiVerification` API types:
  - OpenAI-compatible
  - OpenAI
  - Anthropic
  - Google/Gemini
- Reuse existing verification primitives (`services/aiApiVerification/*`) to verify a profile directly (no account required).
- Integrate with existing flows:
  - Key Management: allow saving an existing account token (baseUrl + key) into profiles for reuse.
  - (Optional) Web AI API Check: allow saving extracted credentials into profiles.
- Include profiles in backup/import flows (Import/Export + WebDAV), with clear warnings that backups contain secrets.

> Note: This change intentionally does **not** add a per-profile `defaultModelId`. Model selection remains per verification/export flow.

## Capabilities

### New Capabilities

- `api-credential-profiles`: Manage standalone API credential bundles (`apiType` + `baseUrl` + `apiKey`) independent of site accounts.

### Modified Capabilities

- `key-management`: Surface “save to API profiles” actions for existing account tokens.
- `import-export`: Backups may include API credential profiles.

## Impact

- Storage: new storage keys + merge/import logic for backups.
- Options UI: new menu entry, page, and i18n resources.
- Services: new profile storage service; verification wiring uses existing `aiApiVerification`.
- Security: stricter secret handling (masking + redaction) for persisted API keys.
- Tests: unit tests for storage and import/export merge behavior; component tests for CRUD + verify flows where practical.

