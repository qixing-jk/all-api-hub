# Troubleshooting Guide for Auto-Identification

This page helps troubleshoot issues encountered when clicking **Auto-Identify** in the plugin's "Add/Edit Account" section, such as: excessively long identification time, infinite waiting, identification failure (401/403/format errors, etc.), and inability to submit.

## Requesty: create a management key and detect

Enter `https://app.requesty.ai` and click **Create Requesty Management Key & Detect**. The extension uses the Requesty session in this browser to create a management key, verifies it and fills in the account details. When the form already contains a key, detection reuses it.

When an account for this site is already saved and its management key still works, adding again reuses that key instead of creating another, and says so. Created keys are named `All API Hub - Account Connection (xxxxxxxx)` so they are recognizable on the API Keys page; Requesty cannot rename keys, so delete ones you no longer need.

The management key is the account credential, not the key you hand to clients. Key Management shows it as the account's own credential: you can reveal and copy it, but it is never exported, batch-exported or used as the default key, because it can create and delete every other key in the organization. Use a separate ordinary key for inference; auto-provisioning creates one whenever the account has no such key yet.

If signed out, sign in to Requesty and retry. If automatic creation is unavailable, create a key with **Admin Permissions** on the API Keys page and paste it into the form. If the creation outcome is uncertain, check API Keys before creating another key. A retrieved key that fails verification stays in the form for retry.

## Excessively Long Identification Time (Stuck on "Identifying...")

Auto-identification requires opening a temporary page and reading site information. It will noticeably slow down in the following situations:

-   **Site has Cloudflare / Firewall verification enabled**: Please check if a temporary window pops up; if manual verification is required, please complete it before timeout.
-   **Slow network/site response**: It is recommended to wait a moment, or switch networks/proxies and retry.
-   **Missing permissions**: Confirm that the extension can access the target site and grant the permissions needed by the selected authentication method. See [Permission Management](./permissions.md).

## Identification Failed: First, Confirm You Are Indeed Logged In

Auto-identification relies on you being logged into the target site in the same browser:

1.  First, open the target site's backend (console) page in your browser.
2.  Confirm that you are not redirected back to the login page (refresh the page to verify).
3.  Then return to the plugin and perform auto-identification.

## Identification Failed: Try Switching Authentication Methods

Different sites/modified versions handle interfaces and login states differently. When identification fails, prioritize trying to switch authentication methods:

-   **Access Token authentication failed**: Switch to **Cookie authentication** and auto-identify again.
-   **AnyRouter**: Configure **Cookie authentication**. Normal operations may succeed using a saved access token or website login session, so success does not establish the saved Cookie's validity.

The compatibility explanation beside Cookie authentication applies across sites: normal operations may use an access token or the browser's current login session, so success does not establish that the entered Cookie is valid or renewed. The saved-token note appears only when the account actually stores a token. Browser-session-only sites retain their specific login-session guidance. Cookie verification is available for sites that support Cookie authentication and can independently read account identity. Login recovery requires separate integration and currently supports AnyRouter Cookies and Sub2API tokens.

## AnyRouter: automatically recover login

Click **Verify this Cookie** to independently check whether the entered Cookie is accepted for the expected account. This result is separate from account health: other credentials may still allow normal operations after Cookie rejection. Network errors, site verification or permission limits leave Cookie validity unconfirmed. Verification does not sign in, change credentials or alter normal request authentication. Verify again after editing the Cookie. Automatic recovery still starts only after a normal operation receives an explicit authentication rejection.

1. In **Edit Account**, click **Configure login recovery** beside the Cookie authentication field, or choose **Account login** in the editor's section directory.
2. Select GitHub, Linux DO or password login, enter the required details, then enable **Automatically recover login** and save. This setting is saved per account and is off by default. Password login requires the website's login username and password.
3. Authentication failures during balance refresh, key loading or copying, and check-in also provide **Configure login recovery**, which opens that account's login settings. Save the configuration or corrections, then retry the original operation. Related authentication warnings in Overview provide the same entry point.

If verification reports a rejected Cookie or a different account, you can recover manually with the configured login method, or open login settings if configuration is missing. Manual recovery independently verifies the returned Cookie and fills the editor draft only after confirming the expected account. Save to replace the stored credential; manual recovery does not enable automatic recovery. When the account identity is known, manually importing an AnyRouter Cookie also verifies it before replacing the draft and preserves the previous value if verification fails.

When refreshing balances, reading keys or checking in, the extension attempts the selected login method after the website explicitly requires authentication. It verifies the account identity, updates the saved Cookie and continues the operation. The existing check-in method stays the same. Network errors and website verification pages do not trigger login recovery. Site verification, an identity mismatch or an unconfirmed login result stops the recovery attempt.

AnyRouter's website may check in automatically during login, so credential recovery may also trigger a website check-in. If that check-in has completed, the subsequent check-in request keeps the site's “already checked in” result.

## Sub2API: login recovery and automatic token renewal

Manual setup can start with a JWT Access Token alone; obtaining a Refresh Token first is unnecessary. In **Edit account → Account login**, choose a supported login method (email and password for password login), enable **Automatically recover login**, and save. Recovery is off by default and configured per account.

The extension first tries the saved Refresh Token and saves the rotated Access Token, Refresh Token, and expiry together. If no Refresh Token is available, or renewal is rejected and the browser session cannot restore access, a confirmed authentication failure can trigger the configured login. The extension independently verifies the new Access Token's account identity, then saves the tokens and renewal information returned by the site. Future requests can renew automatically without asking you to enter a Refresh Token.

Older or customized sites may omit the Refresh Token. In that case, only the verified Access Token is saved and obsolete renewal information is cleared. CAPTCHA, two-factor authentication, or OAuth authorization may still require your input. Identity mismatches, cancellation, or account edits prevent stale login results from overwriting the account. Deployments with separate console/API origins remain excluded when their existing login integration does not support them. Key mutations do not use the new login retry; supported check-in recovery retains its status and execution checks.

## The Identified Site Type Is Wrong

Auto-identification reads its signals in a fixed order: the domain first, then the site name the deployment publishes for itself (the `system_name` returned by the site's `/api/status`), and the page title last. A deployment whose shell serves a stock "New API" title while a customized build runs behind it is therefore still identified by the brand it publishes.

If the result still does not match the site:

-   In **Edit Account**, set the **Site Type** to the correct type yourself and save. The Site Type decides which set of interfaces the extension calls, so it matters more than the brand name.
-   If you are unsure which type to pick, run a check-in for the account first (its **Quick check-in**), or click **Re-detect check-in method** in Edit Account: the extension then infers the type from the site's own signals and writes it into the Edit Account notice, the Auto Check-in execution results, the Key Management failure hint, and the Overview "Needs Attention" list.
-   After changing the type, identify again and confirm that a usable check-in method is found.

This hint is shown only while the account still carries the Site Type recorded at the time; once you change the Site Type, the old record stops applying instead of naming a type you have already moved away from. A later reading that finds the site agreeing with the stored type retires it as well.

## Unable to Submit / Unable to Save: Check Required Fields Item by Item

When required fields are missing, the submit button is disabled or saving fails. Requirements vary by site, so confirm the site type first and check the corresponding fields:

-   **New API and compatible sites**: Check the Site Name, Username, User ID, Access Token, and a Recharge Amount Ratio greater than 0. When using Cookie authentication, import or enter the Session Cookie (Header Value).
-   **Sub2API**: Check the Site Name, User ID, JWT Access Token, and Recharge Amount Ratio. Cookie authentication is not supported. When "Extension-managed session (multiple accounts)" is enabled, you must also import or enter a Refresh Token.
-   **OpenRouter**: Check the Site Name, OpenRouter Management Key, and Recharge Amount Ratio. A User ID is not required, and Cookie authentication is not supported.
-   **Other sites**: Follow the required markers currently shown in the form and the corresponding site instructions in the [Manual Account Addition Guide](./add-account.md#manual-addition).

## Last Resort: Manually Add Account
If auto-identification consistently fails, you can switch to **Manual Addition**, complete the information, and then save the account.

See the [Manual Account Addition Guide](./add-account.md#manual-addition) for details.
