# Troubleshooting Guide for Auto-Identification

This page helps troubleshoot issues encountered when clicking **Auto-Identify** in the plugin's "Add/Edit Account" section, such as: excessively long identification time, infinite waiting, identification failure (401/403/format errors, etc.), and inability to submit.

## Excessively Long Identification Time (Stuck on "Identifying...")

Auto-identification requires opening a temporary page and reading site information. It will noticeably slow down in the following situations:

-   **Site has Cloudflare / Firewall verification enabled**: Please check if a temporary window pops up; if manual verification is required, please complete it before timeout.
-   **Slow network/site response**: It is recommended to wait a moment, or switch networks/proxies and retry.
-   **Permissions/Browser anomaly**: If you just granted optional permissions and started experiencing "infinite waiting", see "Infinite Waiting After Granting Optional Permissions" below.

### Infinite Waiting After Granting Optional Permissions

After initially granting optional permissions, identifying some sites might get stuck in auto-identification, appearing as a continuously loading interface:

-   Solution: Open the browser extension management page, **disable then re-enable** this extension, or **restart the browser** and retry identification/authorization.
-   For the purpose and explanation of optional permissions, see: `/permissions` (Permission Management).

## Identification Failed: First, Confirm You Are Indeed Logged In

Auto-identification relies on you being logged into the target site in the same browser:

1.  First, open the target site's backend (console) page in your browser.
2.  Confirm that you are not redirected back to the login page (refresh the page to verify).
3.  Then return to the plugin and perform auto-identification.

## Identification Failed: Try Switching Authentication Methods

Different sites/modified versions handle interfaces and login states differently. When identification fails, prioritize trying to switch authentication methods:

-   **Access Token authentication failed**: Switch to **Cookie authentication** and auto-identify again.
-   **AnyRouter**: Must use **Cookie authentication**, and the Cookie must come from the currently logged-in account; Cookie authentication does not support multiple accounts on the same site simultaneously.

## Unable to Submit / Unable to Save: Check Required Fields Item by Item

When required fields are not met, the submit button will be disabled or saving will fail. Please confirm item by item:

-   **Site Name**, **Username**, **User ID** have been filled in.
-   **Recharge Amount Ratio (Exchange Rate)** is a number greater than 0.
-   When **Access Token authentication** is selected: **Access Token** has been filled in.
-   When **Cookie authentication** is selected: **Session Cookie (Header Value)** has been imported or filled in.

If auto-identification consistently fails, you can switch to **Manual Addition**, save the account first, and then gradually complete the information.

## Last Resort: Manually Add Account
If auto-identification consistently fails, you can switch to **Manual Addition**, complete the information, and then save the account.

See [Manual Account Addition Guide](./get-started.md#manual-addition) for details.