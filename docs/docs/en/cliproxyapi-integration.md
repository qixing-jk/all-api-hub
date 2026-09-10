# CLIProxyAPI Management

CLIProxyAPI is a managed site in All API Hub. Configure the connection once to view, create, edit, and delete upstream providers, or import account keys and API credentials.

## Connect your deployment

1. Open **Settings → Managed Site** and select **CLIProxyAPI**.
2. Enter the deployment URL, such as `http://localhost:8317`. The previous `http://localhost:8317/v0/management` format also works. Keep any reverse-proxy path prefix.
3. Enter the CLIProxyAPI **management key**. This authenticates management requests; it is different from an API key used by clients to call models.
4. Save, check the connection, and open **Channel Management**.

If you configured the previous standalone CLIProxyAPI integration, the saved URL and management key are migrated automatically. You do not need to enter them again. Existing new settings are not overwritten, and another selected managed site is not switched automatically.

Enable the management API in CLIProxyAPI. Remote deployments also need remote management access and must be reachable from your browser. HTTP, localhost, and LAN deployments are supported. See the [official management API documentation](https://help.router-for.me/management/api) for server configuration.

## Manage providers

Select CLIProxyAPI in **Channel Management** to search providers, inspect details, create or edit entries, enable or disable them, and delete individual or selected entries.

Supported API key provider types:

- OpenAI Compatibility
- Codex
- Claude
- Gemini
- Vertex AI
- xAI
- Gemini Interactions

Availability depends on your CLIProxyAPI version. The editor covers upstream URLs, credentials, model mappings, proxies, model prefixes, and request headers while preserving native settings you do not edit.

Enter one model per line in **Model mappings**, using `model = alias` when an alias is needed. Enter one `Name: value` per line for **Request headers**. API key providers also support excluded models.

OpenAI Compatibility providers support multiple API keys. Add, reveal, replace, or remove keys individually, with a separate proxy and weight for each key. Saved keys are hidden by default; leaving the input blank keeps the saved key. Revealing a key does not change the configuration. An omitted weight defaults to 1; non-positive values exclude the key from weighted routing. Saving preserves other keys and unedited native fields.

## Import account keys or API credentials

1. Select and configure CLIProxyAPI under **Settings → Managed Site**.
2. Open **Key Management** or **API Credential Library** and use the managed-site import button on an entry.
3. Confirm the provider type, upstream URL, key, and models in the shared import dialog, then submit.
4. For batch imports, select multiple entries in Key Management and use the managed-site batch import action. Review the preview before running it.

The standalone CLIProxyAPI action in the Export menu has been replaced by this managed-site workflow. Imported providers remain editable in Channel Management.

## Troubleshooting

- **Where are my previous settings?** Select CLIProxyAPI under Managed Site settings. The old URL and key migrate automatically.
- **HTTP 401 or 403?** Check the management key and the server's remote access policy. A client API key cannot replace the management key.
- **HTTP 404 for a provider type?** Check the deployment URL, whether management is enabled, and whether your backend version supports that type.
- **Refresh required or uncertain result after saving?** Refresh the list and inspect the actual server state before retrying. An outdated edit may be rejected when another client changes the configuration.
- **Does this manage OAuth accounts or all server settings?** This integration manages API key providers. Use CLIProxyAPI's interface for OAuth sign-in, authentication files, and global settings. Cross-site channel migration and automatic model synchronization are not yet integrated.

## Related documentation

- [Self-hosted Site Management](./self-hosted-site-management.md)
- [Quick Export](./quick-export.md)
