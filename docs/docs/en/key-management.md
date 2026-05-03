# Key Management

> Key Management allows you to centrally view and manage all API keys (Tokens) under your added accounts. For New API-based sites, the extension can automatically sync tokens created in the site backend and supports one-click repair, verification, and export.

## Use Cases

- You have created many tokens across multiple relay stations and want to search or batch export them in one place without logging into each backend.
- Some sites only show the token once upon creation and hide it thereafter; the extension can help you record and "repair" these invisible keys.
- You need to verify if a specific token under an account is still valid or compatible with CLI tools.
- You want to quickly save tokens from an account to [API Credentials](./api-credential-profiles.md) for more granular tagging and management.

## Features at a Glance

- **Centralized Token List**: Group by account or view all tokens; search by name or key content.
- **Auto Sync & Refresh**: For supported sites (like New API), pull the latest token list automatically.
- **Key Repair**: For sites that hide full keys (showing `sk-***...`), use management permissions to re-fetch or regenerate full keys.
- **Health Verification**: Real-time view of token balance, usage, and expiration status.
- **Export Integration**: One-click sync of single or multiple tokens to popular AI tools.

## How to Access

1. Open the extension settings page.
2. Select **`Key Management`** from the left menu.

## Core Operations

### 1. Auto Refresh Token List
Click the **`Refresh`** button at the top of the Key Management page. The extension will connect to the backend API of the selected account to pull the latest tokens and their status (balance, usage, expiry).

### 2. Repair Missing Keys
Some sites hide full keys for security. If you have configured management permissions or a management account in the extension:
1. Click **`Repair Missing Keys`** at the top.
2. The extension will iterate through the list and attempt to complete invisible full keys via the management API.
3. Repaired keys are stored safely in local storage for future copying or export.

### 3. Verification & Health Check
Each token card displays its current "Health Status":
- **Balance/Usage**: Real-time quota information fetched from the site.
- **Verify API**: Trigger a manual API call test to confirm the key is usable.
- **Verify CLI Compatibility**: Test if the token works correctly in specific CLI environments.

### 4. Export to Other Tools
Click the **`Export`** button next to a token to sync it to:
- CherryStudio
- CC Switch
- Kilo Code
- CLIProxyAPI
- Claude Code Router
- Your configured Self-hosted Managed Sites

## Integration with Credentials

If you find a token particularly useful or want to add detailed notes and tags, click **`Save to API Credentials`**. This copies the `URL + Key` pair to the [API Credentials](./api-credential-profiles.md) module.

## FAQ

| Question | Answer |
|----------|--------|
| Why can't I see the full key? | The site backend might have disabled key echo; try the "Repair" feature (requires appropriate permissions). |
| Which sites are supported? | Currently, New API and its variants (DoneHub, Veloera, etc.) have the most complete support. |
| Does deleting a token here remove it from the site? | No. Deleting here only removes it from the local extension cache; it does not affect your online account. |
| How secure are my keys? | All keys are stored encrypted in the browser's local storage. They never leave your device unless you manually export them or configure WebDAV sync. |

## Related Documentation

- [API Credentials](./api-credential-profiles.md)
- [Supported Sites](./supported-sites.md)
- [Data Management](./data-management.md)