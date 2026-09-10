# Cloudflare Shield Bypass Assistant

> Applies to aggregated relay stations with Cloudflare's 5-second shield (or stricter Bot Fight Mode) enabled, ensuring the plugin can both identify account information and automatically retry requests when they are restricted.

## Feature Overview

- **Automatic Detection**: Automatically triggers the shield bypass process when the page title contains `Just a moment`, `#cf-content` exists, or the API returns status codes like 401/403/429.
- **Temporary Window**: Opens a temporary tab in the background with the same origin as the target domain, reusing browser cookies, and returns to the original page after completing Cloudflare's JS/human challenge.
- **Request Degradation**: When a regular `fetch` fails, the request is replayed by the temporary window carrying cookies, avoiding infinite retries caused by cross-origin/missing credentials.
- **Manual Fallback**: If Cloudflare determines that user interaction is required, a window will automatically pop up, prompting the user to complete verification within 20 seconds.

## Usage Steps

1. **Log in to the target site**, add an account in the plugin → fill in the site address → click "Auto Identify".
2. If a Cloudflare prompt appears, the browser will automatically pop up a window; simply keep the window in the foreground and wait for automatic verification or click as prompted.
3. After successful verification, the plugin will automatically return to the identification process and continue to read data such as Access Token, balance, and model list.
4. If rate limiting is triggered during the API request phase (common in CC Switch/CherryStudio export or New API synchronization), the system will automatically enable the temporary window to resend, no additional action is required.

## Troubleshoot with shield bypass history

To find out why a temporary page opened, or why it did not open, go to **Settings → Data Refresh** and select **Shield bypass history** beside the **Website verification assistance** heading. The history dialog stays closed until you open it.

You can also select **View shield bypass history** from account warnings about shield bypass, automatic-bypass restriction reminders, check-in results that mention failed verification or a closed temporary page, and the helper prompt on a temporary page.

1. Search by site, operation, or diagnostic information, or filter by processing status. Search and filters cover all retained records.
2. Expand a record to see the triggering operation, its source, available HTTP status or error codes, and whether a temporary page was created or reused.
3. If settings or permissions blocked the request, select **View related settings** to find the relevant option and adjust it as needed.
4. Select **Copy diagnostic details** to keep troubleshooting information. To delete local records, choose **Clear history** from the history dialog's upper-right menu and confirm.

History retains the latest **100 records** on this device. It records new temporary-page requests and does not backfill operations from before the upgrade. Site addresses retain only their origin; URL paths, query parameters, tokens, cookies, and request or response bodies are not stored.

**Completed** means that the temporary-page task returned a completion result. Use the final refresh, check-in, or other operation result to confirm whether the account is working again.

## Notes

- **IP Quality**: If verification fails continuously, you need to change your network or temporarily relax protection on the site side; the default timeout is 20 seconds.
- **Pop-up Permissions**: Please allow the browser to pop up windows, otherwise the plugin cannot create temporary tabs.
- **Repeated Challenges**: If 429 is frequently triggered, you can lower the rate or enable a model whitelist in Self-Hosted Site Management to reduce invalid requests.

## Common Issues

| Scenario | Solution |
|------|----------|
| Pop-up closes immediately | Check if the browser's address bar on the right is blocking pop-ups; allow it and re-identify. |
| Stuck on "Just a moment" | Manually complete the CAPTCHA in the pop-up window; if it still fails, change your IP. |
| API export still reports 403 | Manually click "Export Again"; the backend will reuse the cookie that just passed the shield bypass; if it fails, check if the target site restricts administrator Tokens. |
| No pop-up but identification fails | The site may have removed Cloudflare, but the API returns 401 (credentials invalid); please log in to the site again and refresh the plugin data. |

## Related Documents

- [Quick Site Export](./quick-export.md)
- [Self-Hosted Site Management](./self-hosted-site-management.md)
- [Permission Management (Optional Permissions)](./permissions.md)
