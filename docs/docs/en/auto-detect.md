# Automatic Identification Troubleshooting Guide

This page is for troubleshooting issues that occur when clicking **Automatic Identification** in the plugin's "Add/Edit Account", such as: identification taking too long, infinite waiting, identification failure (e.g., 401/403/format errors), and inability to submit.

## Identification Taking Too Long (Stuck on "Identifying...")

Automatic identification requires opening a temporary page and reading site information. It will significantly slow down under the following circumstances:

-   **Site has Cloudflare / firewall verification enabled**: Please check if a temporary window popped up; if manual verification is required, please complete it before timeout.
-   **Slow network / site response**: It is recommended to wait a moment, or switch network/proxy and retry.
-   **Permissions / browser anomaly**: If "infinite waiting" started appearing right after you granted optional permissions, see "Infinite Waiting After Granting Optional Permissions" below.

### Infinite Waiting After Granting Optional Permissions

After initially granting optional permissions, some sites might remain in automatic identification, showing as the interface continuously loading:

-   Solution: Open the browser's extension management page, first **disable then enable** this extension, or **restart the browser** and retry identification/authorization.
-   For the purpose and explanation of optional permissions, see: `/permissions` (Permissions Management).

## Identification Failure: First, Confirm You Are Logged In

Automatic identification relies on you being already logged into the target site in the same browser:

1.  First, open the target site's backend (console) page in the browser.
2.  Confirm you are not redirected back to the login page (refresh the page to verify once).
3.  Then return to the plugin and perform automatic identification.

## Identification Failure: Try Switching Authentication Methods

Different sites/modified versions handle interfaces and login states differently. When identification fails, prioritize trying to switch authentication methods:

-   **Access Token authentication failed**: Switch to **Cookie authentication** and perform automatic identification again.
-   **AnyRouter**: Must use **Cookie authentication**, and the Cookie must come from the currently logged-in account; Cookie authentication does not support multiple accounts on the same site simultaneously.

## Unable to Submit / Unable to Save: Check Required Fields Item by Item

When required fields are not met, the submit button will be disabled or saving will fail. Please confirm item by item:

-   Have filled in **Site Name**, **Username**, **User ID**
-   **Recharge Amount Ratio (Exchange Rate)** is a number greater than 0
-   When selecting **Access Token authentication**: Have filled in **Access Token**
-   When selecting **Cookie authentication**: Have imported or filled in **Session Cookie (Header Value)**

If automatic identification consistently fails to complete, you can switch to **Manual Addition**, first save the account, then gradually complete the information.