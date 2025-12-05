# Quick Export Site Configuration

> Synchronize recorded aggregated relay accounts to downstream systems like CherryStudio, CC Switch, and New API with one click, avoiding repetitive input of Base URL, API Keys, and model lists.

## Supported Targets

| Target | Method | Notes |
|------|------|------|
| CherryStudio | Launches client via local protocol, automatically populates API information | Requires CherryStudio desktop client to be running and authorized |
| CC Switch | Outputs in JSON/clipboard format, with built-in dedicated field mapping | Requires using the import function within CC Switch to paste content |
| New API | Calls `/api/channel`, automatically creates/updates channels and generates model redirects | Requires filling in Admin URL, Token, User ID |

## Prerequisites

1.  **Site Synchronization**: First, complete account identification in the plugin to ensure that exportable APIs exist in the API key list.
2.  **Target Credentials**:
    -   CherryStudio / CC Switch: No additional configuration required, but the application must remain running.
    -   New API: Fill in Admin URL, Token, User ID in "Basic Settings → New API Integration Settings".
3.  **Model List**: If whitelist export is required, models can be pre-filtered in "New API Model Synchronization".

## Operating Steps

1.  Open the plugin → **API Key Management**, click the **"Export"** button in any site card.
2.  Select the target platform: `CherryStudio` / `CC Switch` / `New API`.
3.  Complete authorization as prompted:
    -   CherryStudio: The browser will prompt whether to open the desktop client, and will complete automatically after confirmation.
    -   CC Switch: Generates JSON and copies it to the clipboard, simply switch to CC Switch and paste.
    -   New API: Calls the admin interface in the background. If the same Base URL is detected, it will prompt for an update instead of duplicate creation.
4.  Verify if the channel/provider appears in the target system and test the call.

## Exported Content

| Field | Description |
|------|----------|
| Site Name | Automatically taken from site/account remarks, can be modified before export |
| Base URL | Uses the account's `base_url`, ensure it includes the protocol prefix |
| API Key | Taken from the API key list; if the site supports multiple API keys, they will be listed individually |
| Model List | From site capability detection or New API Model Synchronization results |
| Recharge Ratio | Used for conversion display in CherryStudio/CC Switch |
| Group/Priority | For New API, defaulted to `default` group and priority 0, can be manually adjusted in the export panel |

## Common Issues

| Issue | Solution |
|------|----------|
| New API prompts 401/403 | Confirm that the admin Token has not expired and that the configuration has been re-saved in the plugin; if necessary, refer to [Cloudflare Bypass Helper](./cloudflare-helper.md). |
| CherryStudio unresponsive | Check if the desktop client is installed and if the browser is allowed to launch the `cherrystudio://` protocol. |
| CC Switch import failed | Paste the generated JSON into the official import dialog. If prompted for missing fields, please update CC Switch to the latest version. |
| Model list is empty | The site has not yet returned model data. You can first refresh the model list within the plugin or perform New API Model Synchronization. |

## Related Documentation

-   [New API Channel Management](./new-api-channel-management.md)
-   [New API Model List Synchronization](./new-api-model-sync.md)
-   [Cloudflare Bypass Helper](./cloudflare-helper.md)
-   [CLIProxyAPI Integration](./cliproxyapi-integration.md)