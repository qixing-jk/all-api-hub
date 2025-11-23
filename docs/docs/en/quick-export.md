# Quick Site Configuration Export

> One-click synchronization of recorded aggregation proxy accounts to downstream systems like CherryStudio, CC Switch, and New API, avoiding repetitive input of Base URL, API keys, and model lists.

## Supported Targets

| Target | Method | Notes |
|------|------|------|
| CherryStudio | Wakes up the client via local protocol, automatically populating API information | Requires CherryStudio desktop client to be running and authorized |
| CC Switch | Outputs in JSON/clipboard format, with built-in dedicated field mapping | Requires using the import function within CC Switch to paste content |
| New API | Calls `/api/channel`, automatically creates/updates channels and generates model redirects | Requires filling in Admin URL, Token, User ID |

## Prerequisites

1.  **Site Synchronization**: First, complete account recognition in the plugin to ensure that exportable APIs exist in the key list.
2.  **Target Credentials**:
    -   CherryStudio / CC Switch: No additional configuration required, but the application must remain running.
    -   New API: Fill in Admin URL, Token, User ID in "Basic Settings → New API Integration Settings".
3.  **Model List**: If whitelist export is required, models can be pre-filtered in "New API Model Sync".

## Operation Steps

1.  Open the plugin → **Key Management**, and click the **"Export"** button on any site card.
2.  Select the target platform: `CherryStudio` / `CC Switch` / `New API`.
3.  Complete authorization as prompted:
    -   CherryStudio: The browser will prompt whether to open the desktop client; confirm to complete automatically.
    -   CC Switch: Generate JSON and copy it to the clipboard, then switch to CC Switch and paste it.
    -   New API: The backend calls the administrator interface; if the same Base URL is detected, it will prompt for an update instead of creating a duplicate.
4.  In the target system, confirm whether the channel/provider appears and test the call.

## Exported Content

| Field | Description |
|------|----------|
| Site Name | Automatically taken from site/account remarks, can be modified before export |
| Base URL | Uses the account's `base_url`, ensure it includes the protocol prefix |
| API Key | Taken from the key list; if the site supports multiple keys, they will be listed individually |
| Model List | From site capability detection or New API model sync results |
| Recharge Ratio | Used for conversion display in CherryStudio/CC Switch |
| Group/Priority | For New API, defaults to `default` group and priority 0, can be manually adjusted in the export panel |

## Common Issues

| Issue | Solution |
|------|----------|
| New API prompts 401/403 | Confirm that the admin Token has not expired and that the configuration has been re-saved in the plugin; if necessary, refer to [Cloudflare Helper](./cloudflare-helper.md). |
| CherryStudio unresponsive | Check if the desktop client is installed and if the browser is allowed to wake up the `cherrystudio://` protocol. |
| CC Switch import failed | Paste the generated JSON into the official import dialog; if a field is missing, please update CC Switch to the latest version. |
| Model list is empty | The site has not yet returned model data; you can refresh the model list within the plugin or perform New API model synchronization first. |

## Related Documents

-   [New API Channel Management](./new-api-channel-management.md)
-   [New API Model List Sync](./new-api-model-sync.md)
-   [Cloudflare Helper](./cloudflare-helper.md)