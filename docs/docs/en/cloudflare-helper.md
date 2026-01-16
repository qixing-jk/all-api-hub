# Cloudflare Shield Bypass Assistant

> Suitable for aggregation proxies that have enabled Cloudflare's 5-second shield (or stricter Bot Fight Mode), ensuring the plugin can both identify account information and automatically retry requests when they are rate-limited.

## Feature Overview

- **Automatic Detection**: Automatically triggers the shield bypass process when the page title contains `Just a moment`, `#cf-content` exists, or the API returns status codes such as 401/403/429.
- **Temporary Window**: Opens a temporary tab in the background with the same origin as the target domain, reusing browser cookies, and returns to the original page after completing Cloudflare's JS/human-machine challenge.
- **Request Downgrade**: When a normal `fetch` fails, the request is replayed by the temporary window with cookies, avoiding infinite retries caused by cross-origin issues or missing credentials.
- **Manual Fallback**: If Cloudflare determines that user interaction is required, a window will automatically pop up, prompting the user to complete verification within 20 seconds.

## Usage Steps

1. **Log in to the target site**, then in the plugin, add a new account → fill in the site address → click "Auto-identify".
2. If a Cloudflare prompt appears, the browser will automatically pop up a window; simply keep the window in the foreground and wait for automatic verification or follow the prompts.
3. After successful verification, the plugin will automatically return to the identification process and continue to read data such as Access Token, balance, and model list.
4. If rate limiting is triggered during the API request phase (common in CC Switch/CherryStudio exports or New API synchronization), the system will automatically enable the temporary window for re-sending, no additional operation is required.

## Notes

- **IP Quality**: If verification fails repeatedly, you need to change your network or temporarily relax the protection on the site side; the default timeout is 20 seconds.
- **Pop-up Permissions**: Please allow your browser to pop up windows, otherwise the plugin cannot create temporary tabs.
- **Repeated Challenges**: If 429 errors are frequently triggered, you can reduce the rate or enable a model whitelist in New API channel management to reduce invalid requests.

## Common Issues

| Scenario | Solution |
|----------|----------|
| Pop-up closes instantly | Check if the browser's address bar on the right is blocking pop-ups, allow them and try to identify again. |
| Stuck on "Just a moment" | Manually complete the captcha in the pop-up window; if it still fails, please change your IP. |
| API export still reports 403 | Manually click "Export Again", the backend will reuse the cookie that just passed the shield bypass; if it fails, check if the target site restricts administrator Tokens. |
| No pop-up but identification fails | The site might have removed Cloudflare, but the interface returns 401 (credentials invalid), please log in to the site again and refresh plugin data. |

## Related Documentation

- [Cloudflare Protection and Temporary Window Downgrade (Quick Start)](./get-started.md#cloudflare-window-downgrade)
- [Quick Site Export](./quick-export.md)
- [New API Channel Management](./new-api-channel-management.md)
- [Permission Management (Optional Permissions)](./permissions.md)