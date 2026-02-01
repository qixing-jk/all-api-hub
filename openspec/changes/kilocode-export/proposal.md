## Why

All API Hub users may manage dozens of relay/self-hosted sites, but still need to re-enter Base URL and API keys one-by-one in IDE assistants like Kilo Code/Roo Code. A dedicated export reduces repetitive setup, lowers configuration mistakes, and makes it practical to keep IDE profiles in sync with the extension.

## What Changes

- Add an **Export to Kilo Code** action in Key Management token actions (with contextual preselection when opened from a specific token).
- Provide an export dialog that lets users:
  - Select one or more sites to load API keys (tokens) per site.
  - Select one or more API keys per site; each selected API key is exported as a provider profile.
  - Select (or enter) a Model ID per selected API key (recommended; Kilo Code typically requires it).
- Default behavior for accounts with no API tokens: **skip** them, while offering a **Create default token** action (then allow selecting that newly-created token for export).
- Provide two output methods in the same flow:
  - Copy a JSON snippet for `providerProfiles.apiConfigs` (paste into an existing settings file).
  - Download a full settings JSON file (e.g. `kilo-code-settings.json`) containing `providerProfiles`.
- Treat exported content as sensitive (API keys in plaintext): add UI warnings and avoid logging secrets.

## Capabilities

### New Capabilities

- `kilocode-settings-export`: Export selected All API Hub sites and API keys into Kilo Code/Roo Code-compatible `providerProfiles.apiConfigs` JSON, supporting per-site token loading, per-key model ID selection, optional token creation, and copy/download outputs.

### Modified Capabilities

<!-- None -->

## Impact

- UI: new modal/dialog under `components/` with entry points under Key Management token actions (plus i18n strings in `locales/*`).
- Services: read token inventories via existing per-site APIs and optionally create a default token for sites without tokens.
- Security: exported files contain API keys in plaintext; UX must clearly communicate risk and code must not log credentials.
