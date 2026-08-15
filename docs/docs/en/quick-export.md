# Quick Export Site Configuration

> Bring recorded account keys or API credentials into common chat clients, coding agents, gateways, and self-hosted sites without repeatedly entering Base URLs, keys, and model lists.

## Supported Targets

| Category | Target | Method |
|---|---|---|
| Priority action | Self-hosted site | Calls the configured backend management API to create or update a channel |
| Chat clients | Cherry Studio | Launches the client through its local protocol and fills in API information |
| Chat clients | Kelivo | Generates a mobile import code and QR code; desktop requires manual entry |
| Coding agents | CC Switch | Generates and opens an import link for the selected target application |
| Coding agents | Kilo Code / Roo Code | Copies a configuration fragment or downloads an importable settings file |
| Coding agents | Cursor++ | Copies a provider configuration that can be merged into `providers.json` |
| Gateways and routing tools | CLIProxyAPI | Adds or updates provider configuration through the management API |
| Gateways and routing tools | Claude Code Router | Imports provider configuration through the management API |

## Prerequisites

1. **Site synchronization**: Complete account detection first and make sure an exportable API is available in the key list.
2. **Target credentials**:
   - Cherry Studio, Kelivo, CC Switch, Kilo Code / Roo Code, and Cursor++ do not require target credentials in the extension. Follow the export dialog instructions to finish importing.
   - Configure the management address and credentials for CLIProxyAPI, Claude Code Router, and the self-hosted site before importing.
3. **Model list**: If you need a model allowlist, filter the models in New API Model Sync first.

## Steps

1. Open the extension → **Key Management** and find an account key or service credential. Each API Credential Library card provides the same actions area.
2. To import into the self-hosted site, select its icon directly in the actions area. For other tools, select **`Export`**, then choose a target from **Chat clients**, **Coding agents**, or **Gateways and routing tools**. Targets unsupported by the current data source are hidden.
3. Follow the target dialog to copy or download the configuration, launch an application, or import through a management API. For batch CLIProxyAPI or self-hosted-site operations, select multiple keys and open the preview from the page's batch actions.
4. Confirm that the configuration appears in the target system and test a request.

## Exported Content

| Field | Description |
|---|---|
| Site name | Derived from the site or account label and editable before export |
| Base URL | Uses the account's `base_url` and must include the protocol prefix |
| API key | Taken from the key list; sites with multiple keys are listed individually |
| Model list | Comes from site capability detection or New API Model Sync |
| Group / priority | For self-hosted sites, can be adjusted in the import panel according to target backend capabilities |

## Common Issues

| Issue | Solution |
|---|---|
| The self-hosted site returns 401/403 | Confirm that the backend credentials have not expired and save the configuration again in the extension. If needed, see [Cloudflare Bypass Helper](./cloudflare-helper.md). |
| Cherry Studio does not respond | Confirm that the desktop client is installed and the browser can launch the `cherrystudio://` protocol. |
| CC Switch import fails | Confirm that CC Switch is installed and updated to a version that supports imports for the target application, then reopen the import link. |
| The model list is empty | Refresh the model list in the extension or run New API Model Sync first. |

## Related Documentation

- [Self-Hosted Site Management](./self-hosted-site-management.md)
- [Managed Site Model Synchronization](./managed-site-model-sync.md)
- [Cloudflare Bypass Helper](./cloudflare-helper.md)
- [CLIProxyAPI Integration](./cliproxyapi-integration.md)
