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

## Notes

- **IP Quality**: If verification fails continuously, you need to change your network or temporarily relax protection on the site side; the default timeout is 20 seconds.
- **Pop-up Permissions**: Please allow the browser to pop up windows, otherwise the plugin cannot create temporary tabs.
- **Repeated Challenges**: If 429 is frequently triggered, you can lower the rate or enable a model whitelist in New API Channel Management to reduce invalid requests.

## Common Issues

| Scenario | Solution |
|------|----------|
| Pop-up closes immediately | Check if the browser's address bar on the right is blocking pop-ups; allow it and re-identify. |
| Stuck on "Just a moment" | Manually complete the CAPTCHA in the pop-up window; if it still fails, change your IP. |
| API export still reports 403 | Manually click "Export Again"; the backend will reuse the cookie that just passed the shield bypass; if it fails, check if the target site restricts administrator Tokens. |
| No pop-up but identification fails | The site may have removed Cloudflare, but the API returns 401 (credentials invalid); please log in to the site again and refresh the plugin data. |

## Related Documents

- [Cloudflare Protection and Temporary Window Degradation (Quick Start)](./get-started.md#_5-8-cloudflare-防护与临时窗口降级)
- [Quick Site Export](./quick-export.md)
- [New API Channel Management](./new-api-channel-management.md)
- [Permission Management (Optional Permissions)](./permissions.md)