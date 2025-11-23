# Cloudflare Bypass Assistant

> Applicable to aggregated relay stations that have enabled Cloudflare's 5-second challenge (or stricter Bot Fight Mode), ensuring the plugin can both identify account information and automatically retry requests when limited.

## Feature Overview

-   **Automatic Detection**: Automatically triggers the challenge bypass process when the page title contains `Just a moment`, `#cf-content` exists, or the API returns status codes such as 401/403/429.
-   **Temporary Window**: A temporary same-origin tab is opened in the background, reusing browser Cookies to complete Cloudflare's JS/human challenge before returning to the original page.
-   **Request Fallback**: If a regular `fetch` request fails, the request is replayed by the temporary window carrying Cookies, avoiding infinite retries caused by cross-origin issues or missing credentials.
-   **Manual Fallback**: If Cloudflare determines user interaction is required, a pop-up window will automatically appear, prompting the user to complete the verification within 20 seconds.

## Usage Steps

1.  **Log in to the target site**, then in the plugin, add a new account → fill in the site address → click "Auto-Identify".
2.  If Cloudflare prompts, your browser will automatically open a pop-up window; simply keep the window in the foreground and wait for automatic verification or click as prompted.
3.  Once verification is successful, the plugin will automatically return to the identification process, continuing to read Access Token, balance, model list, and other data.
4.  If rate limiting is triggered during the API request phase (common during CC Switch/CherryStudio export or New API synchronization), the system will automatically enable the temporary window to resend, no additional action is required.

## Precautions

-   **IP Quality**: If consecutive failures occur, you may need to change your network or temporarily relax protection on the site side; the default timeout period is 20 seconds.
-   **Pop-up Permissions**: Please allow your browser to open pop-up windows, otherwise the plugin cannot create temporary tabs.
-   **Repeated Challenges**: If 429 errors are frequently triggered, you can reduce the rate or enable a model whitelist in New API Channel Management to decrease invalid requests.

## Common Issues

| Scenario                       | Solution                                                                                                                                                                                                  |
| :----------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pop-up closes immediately      | Check if the browser's address bar on the right is blocking pop-ups; allow them and re-identify.                                                                                                          |
| Stuck on "Just a moment"       | Manually complete the CAPTCHA in the pop-up window; if it still fails, please change your IP.                                                                                                            |
| API export still reports 403   | Manually click "Export again"; the backend will reuse the Cookie that just passed the challenge; if it fails, check if the target site restricts administrator Tokens.                                   |
| No pop-up but identification failed | The site may have removed Cloudflare, but the API returns 401 (credentials expired); please log in to the site again and refresh the plugin data. |

## Related Documentation

-   [Cloudflare Protection and Temporary Window Fallback (Quick Start)](./get-started.md#_5-8-cloudflare-防护与临时窗口降级)
-   [Quick Site Export](./quick-export.md)
-   [New API Channel Management](./new-api-channel-management.md)