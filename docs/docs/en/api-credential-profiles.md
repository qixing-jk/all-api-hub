# API Credential Library

> Suitable for scenarios where you only have `Base URL + API Key` without a site account. Save common API keys in one place for quick copying, API verification, model lookup, and balance/usage checks without first creating a full site account.

## Suitable Scenarios

- You only have the `Base URL` and `API Key` provided by a third-party platform, but no corresponding site console account.
- You want to centrally store frequently used interface configurations to avoid repeatedly copying them between multiple clients or CLI tools.
- You need to verify if a key is valid and compatible with the CLI before deciding to import it into downstream tools.
- You want to use the same interface configuration directly for model viewing, interface verification, or export flows.

## Feature Overview

- **Credential Library Management**: Store name, `Base URL`, API key, tags, and notes without relying on a site account.
- **Search and Filter**: Supports filtering by name, `Base URL`, tags, notes, and API type.
- **Health and Usage Overview**: View balance, today's usage, today's requests, available models, last refresh time, and health status.
- **Interface Verification**: Supports verifying API availability and separately testing CLI compatibility.
- **Model Integration**: Directly open the current credentials in the model list to view the model catalog and verification results.
- **Quick Export**: Prioritizes a direct action for the currently configured self-hosted site. Other targets are grouped as chat clients, coding agents, and gateways and routing tools: Cherry Studio, Kelivo, CC Switch, Kilo Code / Roo Code, Cursor++, CLIProxyAPI, and Claude Code Router.

## Access Method

1. Open the plugin settings page.
2. Navigate to **`API Credential Library`** in the left-hand menu.
3. Click **`Save API key`** in the upper right corner.

If you have already obtained a key for an upstream site in `Key Management`, you can also verify or organize it before saving it to the `API Credential Library` for easier later use.

::: tip Looking for High-Quality API Interfaces?
If you need stable and CLI-friendly API interfaces to fill your credential library, try our partners:

- [Qiniu Cloud AI](https://s.qiniu.com/qE3eai): An enterprise MaaS platform with one-stop access to 150+ mainstream global models. Enterprise users can claim 12 million free tokens.
- [FennoAI](https://api.fenno.ai/s/DCGC): A stable and efficient Codex relay provider compatible with OpenAI and Anthropic protocols. It supports popular coding tools and enterprise workloads of up to 100 billion tokens per day. All API Hub users can get $50 in Coding Plan credits for $1.99, and referral purchases earn up to 20% commission. [Setup guide](./service-guides/fenno.md)
- [PackyCode](https://www.packyapi.com/register?aff=all-api-hub): Enter the `all-api-hub` promo code during recharge to get 10% off. [Setup guide](./sponsor-guides/packycode.md)
- [Xingchen AI](https://ai.centos.hk): 1:1 top-up ratio, invoicing support, and Claude pricing as low as 40% of the standard price. [Setup guide](./sponsor-guides/xingchen.md)
- [XuanShu API](https://www.xuanshuapi.com/register?aff=ALL-API-HUB&promo=ALL-API-HUB): A next-generation AI model routing gateway for enterprises, technical teams, and individual developers, with one-stop API access to leading models including Claude, GPT, and Grok. Top-ups are 20% off, model pricing starts at 20% of standard rates, registration includes US$5 in credit, and the dedicated link adds another US$5. Business invoices are available. [Setup guide](./service-guides/xuanshuapi.md)
- [Atlas Cloud](https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub): One AI API for 300+ curated video, image, and LLM models, with a new coding plan promotion for more budget-friendly API access. [Setup guide](./service-guides/atlascloud.md)
- [AICodeMirror](https://www.aicodemirror.ai/register?invitecode=7IQNR8): Official high-stability relay services for Claude Code / Codex / Gemini CLI. Register through this link to get 20% off your first top-up, and enterprise customers can get up to 25% off.
- [Suixiang AI Relay](https://sui-xiang.com/): API relay services for Claude, Codex, Gemini, and more, with pay-as-you-go billing, daily check-in test credits, redundant routes, and automatic failover. [Setup guide](./service-guides/suixiang.md)
- [Infistar.ai](https://infistar.ai/register?aff=ALLAPIHUB&ref_source=link): Every available model is verified through real calls, with load balancing across 10,000+ official API and account-pool supply routes, full-modal support for text, video, images, embeddings, and reranking, transparent pricing and usage, and prices from 10% of official rates. [Setup guide](./service-guides/infistar.md)
- [Dola Seed on BytePlus ModelArk](https://www.byteplus.com/en/product/modelark?utm_campaign=hw&utm_content=all-api-hub&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=all-api-hub): Register through BytePlus ModelArk to get 500,000 free inference tokens per model.
:::

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

- **Auto-detect**: Attempts compatible methods in a built-in order.
- **NewAPI Token**: Suitable for querying token usage compatible with New API.
- **OpenAI Billing**: Suitable for standard OpenAI Billing queries.
- **Sub2API**: Suitable for Sub2API-style interfaces.
- **Custom Read-only Endpoint**: Suitable for sites with custom read-only query endpoints.
- `Disabled`: Does not query balance and usage, only retains the credential itself.

### Detailed Telemetry Metrics

After enabling telemetry, the extension will attempt to retrieve the following metrics:
- **Real-time Balance**
- **Today Cost**
- **Today Requests**
- **Today Prompt/Completion Tokens**
- **Total Used/Total Granted/Total Available Quota**
- **Expiration Time**

### Custom Read-only Query

If the automatic method is not compatible with the current site, you can use a custom read-only query:

1. Select **`Custom Read-only Endpoint`**.
2. Enter the query address (must be from the same origin as the `Base URL`, supports root-relative paths like `/usage`).
3. **Configure Field Mapping**: Supports configuring JSON Paths for all telemetry metrics mentioned above.
   - JSON Path uses a dot-separated format, e.g., `data.today_total_tokens`.
   - The extension will automatically parse and convert it into a unified display format.

## Stability and Rate Limiting

To protect your account from being judged as abnormal by upstream sites, All API Hub has a built-in **Smart Request Limiter**:

- **Concurrency Control**: Defaults to limiting the number of concurrent requests to a single site to 2.
- **Rate Control**: Limits the request rate to a single site to approximately 18 times per minute (supports small bursts).
- **Auto-Queueing**: When refreshing multiple accounts or performing batch verification, requests exceeding the limit will automatically enter a queue to avoid triggering 429 Too Many Requests errors.

> 💡 **Note**: This limit is primarily for refresh and verification actions in the extension background and does not affect the performance of direct interface calls via other tools (such as CherryStudio).

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

- **Self-hosted site**: The actions area shows the currently configured self-hosted site icon. Select it to create or update a channel.
- **Chat clients**: Cherry Studio, Kelivo
- **Coding agents**: CC Switch, Kilo Code / Roo Code, Cursor++
- **Gateways and routing tools**: CLIProxyAPI, Claude Code Router

Except for the direct self-hosted-site action, all targets are available from the **`Export`** menu. Cursor++ reads the current API credential's model list and generates a provider configuration that can be merged into `providers.json`.

When exporting to Kilo Code 7.x, the current credential becomes a clearly named `provider` containing every model ID discovered and normalized from the endpoint, plus any model IDs manually entered and retained for that provider. Inclusion in the export does not guarantee that every model works in every workflow; select only the default `model` before exporting. The legacy Roo Code / Kilo Code 5.x format still uses one model per configuration, and its copied content must be merged into `providerProfiles.apiConfigs`.

The current `provider` can use OpenAI Compatible, OpenAI Responses, or Anthropic Messages, with OpenAI Compatible as the default. The protocol changes only the exported AI SDK provider package. The model list continues to use All API Hub's existing loaded result, and selecting Anthropic Messages does not skip or reduce the models.

For Kilo Code 7.x file import, manual `{ provider, model }` merging, file-size recovery, and the API-key field display limitation, see [Supported Export Tools and Integration Targets](./supported-export-tools.md).

If your primary goal is to "manage a batch of upstream interface configurations and then distribute them to multiple downstream tools," the `API Credential Library` will be more direct than full account management.

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
| Can it replace account management? | Not entirely. The `API Credential Library` is better for saving and using standalone API keys for API verification, model lookup, and export; account management is still responsible for site identification, balance refresh, check-ins, usage synchronization, and other account-level capabilities. |
| Will the API Credential Library be included in backups? | Yes. It is part of the shared data and can be migrated along with data import/export and selective synchronization via WebDAV. |

## Related Documents

- [Quick Export Site Configuration](./quick-export.md)
- [Supported Export Tools and Integration Targets](./supported-export-tools.md)
- [CLIProxyAPI Integration](./cliproxyapi-integration.md)
- [Data Import and Export](./data-management.md)
