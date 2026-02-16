# Design: API Credential Profiles

## Overview

We introduce a standalone persisted entity (“profile”) representing a usable API credential bundle:

- `apiType` (OpenAI-compatible / OpenAI / Anthropic / Google)
- `baseUrl` (canonical, normalized; preserves deployment subpaths)
- `apiKey` (secret, stored in extension local storage)
- `name`, `tagIds`, `notes` (helper metadata for organization; tags reuse the global tag store shared with accounts/bookmarks)

Profiles are intentionally **not** tied to `SiteAccount` and remain usable even when a site dashboard/admin account cannot be added.

## Data Model

### Entity

`ApiCredentialProfile`

- `id: string`
- `name: string`
- `apiType: ApiVerificationApiType` (same canonical strings as `services/aiApiVerification/types.ts`)
- `baseUrl: string` (normalized; see below)
- `apiKey: string` (stored, masked in UI, never logged)
- `tagIds: string[]` (global tag ids shared with `SiteAccount` / bookmarks)
- `notes: string` (free-form)
- `createdAt: number` (ms)
- `updatedAt: number` (ms)

### Storage Shape

`ApiCredentialProfilesConfig`

- `version: number`
- `profiles: ApiCredentialProfile[]`
- `lastUpdated: number`

Stored under a dedicated storage key (local area) and mutated under a write lock to avoid cross-context races.

## Base URL Normalization

Profiles accept base URLs that may include a deployment subpath (e.g. `https://example.com/api`) but should not include request endpoints.

Normalization rules:

- Drop query/hash fragments.
- Remove trailing slashes.
- For OpenAI/OpenAI-compatible/Anthropic families: strip any `/v1` segment and anything after it while preserving subpaths before `/v1`.
- For Google/Gemini: strip any `/v1beta` segment and anything after it while preserving subpaths before `/v1beta`.

Implementation MUST reuse existing pure utilities from `utils/webAiApiCheck.ts`:

- `normalizeOpenAiFamilyBaseUrl`
- `normalizeGoogleFamilyBaseUrl`

This prevents duplicated paths like `/v1/v1/models` and ensures all downstream helpers (e.g. `coerceBaseUrlToV1`) operate on canonical base URLs.

## Options UI

### Navigation

Add a new Options sidebar item (e.g. “API 配置”) which routes to a new page component.

### Page Layout

- Header: title/description, “Add profile” action.
- Controls: search box, apiType filter.
- List: cards or rows showing name, apiType badge, baseUrl, tags (key masked).
- Actions per profile:
  - Copy baseUrl
  - Copy apiKey
  - Copy baseUrl + apiKey (formatted)
  - Quick export (reuse Key Management integrations):
    - Cherry Studio
    - CC Switch
    - Kilo Code / Roo Code settings JSON
    - CLIProxyAPI provider import
    - Claude Code Router provider import
    - Managed site channel creation (New API / Veloera / Octopus) when configured
  - Verify (opens a modal)
  - Edit / Delete

### Add/Edit Dialog

Fields:

- Name (required)
- API type (required)
- Base URL (required; validated + normalized on save)
- API key (required; masked by default with reveal toggle)
- Tags (shared global tag store; use the same tag picker as accounts/bookmarks)
- Notes (textarea)

## Verification UX

Provide a modal dialog that runs `aiApiVerification` probes against a profile:

- Always allow running the suite.
- Auto-fetch model ids on open (similar to Web AI API Check) to populate a `SearchableSelect` picker that supports custom values.
- Run the `models` probe first and use its `suggestedModelId` (when present) to continue running model-dependent probes in a single run.
- Use the `models` probe output preview list (`modelIdsPreview`) as a fallback suggestion source when auto-fetch is unavailable or returns no options.

All errors MUST be sanitized using `toSanitizedErrorSummary` with the profile’s apiKey included in the redact list.

## Integration Points

### Key Management → Save to Profiles

In the Key Management token UI:

- Add an action to “Save as API profile” using the token’s `key` + the owning account’s `baseUrl`.
- The user can edit metadata (name/tags/notes) after saving.

### Web AI API Check → Save to Profiles (Optional)

In the in-page modal:

- Provide “Save to profiles” when both `baseUrl` and `apiKey` are present.
- Saving MUST NOT require running probes first; testing remains optional.
- Saving uses the same normalization rules and never logs secrets.

## Backup / WebDAV

Extend V2 backup payloads to optionally include `apiCredentialProfiles`.

Import rules:

- Merge on `(apiType, normalizedBaseUrl, apiKey)` identity to avoid duplicates.
- Preserve user edits by preferring newer `updatedAt` on conflicts; union `tagIds` (ids are stable; labels resolve via global tag store).

UI MUST include warnings that backups can contain secrets and should be stored securely.

