# Permission Management (Optional Permissions)

> These optional permissions only need to be granted when a temporary window is required for shield bypass, automatic refresh, or background supplementation of Cookies/request headers; for daily use, they can remain fully disabled.

## Feature Overview

-   **Centralized Management of Optional Permissions**
    -   View, grant, or revoke the optional permission status of the extension uniformly on the "Permission Management" page.
-   **Integration with Cloudflare Shield Bypass**
    -   Some permissions are used to support temporary window shield bypass (e.g., Cloudflare 5-second challenge), ensuring data can still be refreshed normally even when the site has a firewall.
-   **Revocable at Any Time**
    -   All optional permissions can be disabled at any time in browser settings or on the plugin's "Permission Management" page, without affecting core offline functionality.

## Accessing Settings

1.  Open the plugin → Go to the **Settings** page.
2.  When the browser supports optional permissions, the **"Permission Management / Permissions"** tab will appear.
3.  Click to enter and view the list and status of optional permissions available for the current extension.

> Tip: If your browser does not support or has not enabled relevant permissions, this tab may not appear.

## Supported Permission Types

Specific permission names may vary slightly depending on the browser, but typically include:

-   **Cookies (Cookie Permission)**
    -   Purpose: Allows the extension to read necessary cookies within a controlled scope, in order to attach authentication information to background requests.
    -   Typical Scenarios:
        -   After a temporary window shield bypass is complete, carry the same session cookie to background refresh requests.

-   **Web Request (Network Request Observation)**
    -   Purpose: Allows the extension to observe outgoing requests in specific scenarios (e.g., supplementing necessary request headers for the shield bypass process).
    -   Typical Scenarios:
        -   Determining if a request is blocked by a firewall, or if a temporary window retry needs to be triggered.

-   **Web Request Blocking (Network Request Blocking/Modification)**
    -   Purpose: Synchronously modify requests before they are sent (e.g., attach Cookies, Headers) to ensure correct authentication information is carried before firewalls/Cloudflare.
    -   Typical Scenarios:
        -   Ensuring Cloudflare shield bypass or refresh requests with cookies can reliably pass site protection.

> The extension will not use these permissions to scan sites unrelated to you; they are only used on the relay station domains you have connected to, and only within necessary workflows.

## Status and Operations

On the permission management page, you can see:

-   **Status Indicators**
    -   "检测中 / Checking…": Synchronizing permission status with the browser.
    -   "已授予 / Granted": Currently allowed by the browser.
    -   "未授予 / Not granted": Currently not allowed.
-   **Action Buttons**
    -   **允许 (推荐) / Allow (Recommended)**: Initiates a permission request pop-up to the browser.
    -   **撤销 / Revoke**: Actively withdraws the current permission.
    -   **刷新状态 / Refresh Status**: If you have manually modified permissions in your browser settings, click refresh to synchronize the status.

## When Are These Permissions Needed?

-   It is recommended to consider enabling them in the following scenarios:
    -   Frequently accessing relay stations protected by Cloudflare or other firewalls, and wishing to automatically complete shield bypass and refresh data.
    -   Needing to automatically refresh a large amount of account data in the background, and wishing to minimize failures due to protection.
-   In the following scenarios, they can remain disabled:
    -   Only occasionally manually refreshing a small number of accounts.
    -   The relay station used has no additional firewalls or 5-second challenges, etc.

## Privacy and Security Statement

-   The plugin runs **completely offline** by default; all account and site configurations are stored locally in the browser.
-   Optional permissions are only enabled under the following conditions:
    -   You explicitly click "Allow" on the permission management page;
    -   The browser displays a permission request dialog and you confirm it.
-   You can always:
    -   Click "Revoke" on the "Permission Management" page;
    -   Or remove relevant permissions from the browser's own extension management interface.

## Troubleshooting

-   **Nothing happens after clicking "Allow"?**
    -   The browser might not have displayed the permission dialog, or it might have been blocked by the system;
    -   Check for a permission icon or prompt near the address bar.
-   **Shield bypass/refresh still failing?**
    -   Confirm that Cloudflare shield bypass related settings are enabled, and refer to the [Cloudflare Shield Bypass Helper](./cloudflare-helper.md) documentation;
    -   Check your network environment (proxy, firewall, IP quality, etc.).

## Related Documentation

-   [Cloudflare Shield Bypass Helper](./cloudflare-helper.md)
-   [Automatic Refresh and Real-time Data](./auto-refresh.md)
-   [WebDAV Backup and Automatic Synchronization](./webdav-sync.md)