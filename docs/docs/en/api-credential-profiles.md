# API Credentials

> Suitable for scenarios where you only have `Base URL + API Key` without a site account. You can manage, verify, and export independent interface credentials as reusable configuration profiles without first creating a full site account.

## Suitable Scenarios

- You only have the `Base URL` and `API Key` provided by a third-party platform, but no corresponding site console account.
- You want to centrally store frequently used interface configurations to avoid repeatedly copying them between multiple clients or CLI tools.
- You need to verify if a key is valid and compatible with the CLI before deciding to import it into downstream tools.
- You want to directly reuse the same interface configuration across model viewing, interface verification, or export processes.

## Feature Overview

- **Independent Profile Management**: Store name, `Base URL`, key, tags, and notes without relying on a site account.
- **Search and Filter**: Supports filtering by name, `Base URL`, tags, notes, and API type.
- **Health and Usage Overview**: View balance, today's usage, today's requests, available models, last refresh time, and health status.
- **Interface Verification**: Supports verifying API availability and separately testing CLI compatibility.
- **Model Integration**: Directly open the current credentials in the model list to view the model catalog and verification results.
- **Quick Export**: Supports exporting to CherryStudio, CC Switch, Kilo Code, CLIProxyAPI, Claude Code Router, and self-hosted sites with current configurations.

## Access Method

1. Open the plugin settings page.
2. Navigate to **`API Credentials`** in the left-hand menu.
3. Click **`Add Credential`** in the upper right corner.

If you have already obtained a key for an upstream site in `Key Management`, you can also verify or organize it there before saving it to `API Credentials` for easier subsequent reuse.

## How to Add Credentials

### Basic Fields

| Field | Description |
|------|------|
| Name | For distinguishing different purposes, e.g., "Company Relay Station Read-only Key" |
| Base URL | The base address of the interface; it will be automatically normalized upon saving. |
| Key | The corresponding API Key. |
| Tags | Optional; shares the global tag system with accounts and bookmarks. |
| Notes | Can record information such as source, purpose, model limitations, etc. |

### API Type

Currently supports classification and verification by API type. Common types include:

- `OpenAI Compatible`
- `OpenAI`
- `Anthropic`
- `Google`

If you temporarily use another API type for verification, the interface will clearly indicate that this is only a temporary override for this verification and will not change the saved credential type.

## Balance and Usage Overview

Each credential card can display a lightweight telemetry overview, with common metrics including:

- Balance
- Today's Usage
- Today's Requests
- Today's Tokens
- Available Models
- Last Refresh Time
- Health Status and Last Error

### Query Method

You can choose the balance/usage query method for each credential:

- **Auto (Auto-detect)**: Attempts compatible methods in a built-in order.
- **NewAPI Token**: Suitable for querying token usage compatible with New API.
- **OpenAI Billing**: Suitable for standard OpenAI Billing queries.
- **Sub2API**: Suitable for Sub2API-style interfaces.
- **Custom Read-only Endpoint**: Suitable for sites with custom read-only query endpoints.
- **Disabled**: Does not query balance and usage, only retains the credential itself.

### Custom Read-only Query

If the automatic method is not compatible with the current site, you can use a custom read-only query:

1. Select **`Custom Read-only Endpoint`**.
2. Enter the query address.
3. Configure the path mapping for each field in the returned JSON.

Limitations:

- Only read-only GET endpoints from the same origin as the current `Base URL` are allowed.
- The query address can be a root-relative path, e.g., `/usage`, or a complete same-origin URL.
- JSON Path uses dot-separated fields, e.g., `data.balance`.
- At least one resolvable field mapping must be configured.

This type of configuration is suitable for scenarios where "the site is not in the standard New API / OpenAI Billing return format, but you still want to see the balance and today's usage on the card."

## Common Operations

### 1. Verify Interface

Click **`Verify Interface`** on the card to confirm:

- If the current key can still be used.
- If the model list can be fetched.
- If the response conforms to the expected API type.

This is useful when changing keys, switching networks, or troubleshooting "client cannot connect, but the site seems alive."

### 2. Verify CLI Compatibility

Click **`Verify CLI Compatibility`** to separately test:

- If the current interface is suitable for CLI tools.
- If the model ID can be used in CLI scenarios.
- If there are compatibility differences such as "web can call, but CLI cannot."

### 3. Open in Model Management

After clicking **`Open in Model Management`**, the model list page will directly use the current API credential as the data source. This allows you to view the model catalog and verify model availability without first creating a site account.

### 4. Quick Export

Supports direct export from a single credential to:

- CherryStudio
- CC Switch
- Kilo Code
- CLIProxyAPI
- Claude Code Router
- Current self-hosted sites

If your primary goal is to "manage a batch of upstream interface configurations and then distribute them to multiple downstream tools," `API Credentials` will be more direct than full account management.

## Usage Recommendations

- **Name with Purpose**: For example, "OpenAI Read-only Test Key" or "Company Relay Station Claude Specific Key" for clearer filtering later.
- **Use Tags as Groups**: For example, `Work`, `Personal`, `Production`, `Test`, `Temporary`.
- **Verify Before Export**: This prevents batch importing invalid keys into multiple clients.
- **Record Limitations in Notes**: For example, "Only supports Anthropic," "Balance display is inaccurate," "Internal network only."

## Frequently Asked Questions

| Question | Description |
|------|------|
| I only saved the credential, why is there no balance data? | The current query method may not be compatible with the site, or the site does not provide a corresponding read-only interface; try switching the query method or using a custom read-only query. |
| Why does the model-related verification require a model ID? | Some CLI compatibility checks and model call verifications require a specific model. The interface will try to automatically suggest a model, or you can manually enter one. |
| Can it replace account management? | Not entirely. `API Credentials` are more suitable for interface reuse, verification, and export; account management is still responsible for site identification, balance refresh, check-ins, usage synchronization, and other account-level capabilities. |
| Will API Credentials be included in backups? | Yes. They are part of the shared data and can be migrated along with data import/export and selective synchronization via WebDAV. |

## Related Documents

- [Quick Export Site Configuration](./quick-export.md)
- [Supported Export Tools and Integration Targets](./supported-export-tools.md)
- [CLIProxyAPI Integration](./cliproxyapi-integration.md)
- [Data Import and Export](./data-management.md)