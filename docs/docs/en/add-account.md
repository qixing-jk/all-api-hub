# Add Accounts

> This guide explains how to add AI site accounts to All API Hub through auto detection, manual entry, or bookmark import. After adding an account, see [Account Management](./account-management.md) for organization, sorting, and bulk operations.

## 1. Auto Detection (Recommended)

This is the simplest way to add an account. First sign in to the target site in your browser, then:

1. Click **"Add Account"**.
2. Enter the **Site URL**.
3. Click **"Auto Detect"**.
4. The extension will attempt to identify the site type and the account currently signed in, then fill in the required information.
5. Review the information and save the account.

If the site uses Cloudflare verification, the extension will open a helper window and continue detection after verification is complete. If auto detection fails, see the [FAQ](./faq.md) to check your sign-in state, authentication method, and site compatibility, or use manual addition below.

<a id="manual-addition"></a>
## 2. Manual Addition

Required information and where to find it vary by site type. The following sections explain manual addition for each supported type.

> **Site Type** is optional. You can save the account without selecting one; its site type will initially be recorded as `unknown`, and a later refresh or detection may fill it in automatically.

Quick links:

- [New API](#manual-new-api)
- [Sub2API](#manual-sub2api)
- [OpenRouter](#manual-openrouter)

<a id="manual-new-api"></a>
### 2.1 New API

> Page layouts, button labels, and feature locations may differ between customized New API sites. Follow the interface shown by the site you use.

1. Sign in to your New API site.
2. Click the **All API Hub** extension icon in the browser toolbar. Opening it in the side panel is recommended so you can compare both interfaces while filling in the form.
3. Click **"Add Account"**, then use the current site address or enter the address manually.
4. Click **"Manual Add"**.

   ![Click Add Account](../static/image/manual/new-api/add-account.png)

5. Fill in the following fields. Click a field name to jump to its instructions:

   - [**Site Name**](#manual-new-api-site-name)
   - [**Site Type**](#manual-new-api-site-type)
   - [**Username and User ID**](#manual-new-api-user-id)
   - [**Access Token**](#manual-new-api-access-token)

   <a id="manual-new-api-site-name"></a>

   **Site Name**: A custom name used to distinguish the account in the extension.

   <a id="manual-new-api-site-type"></a>

   **Site Type**: Select `new-api`.

   ![Manual account form](../static/image/manual/new-api/account-form.png)

   <a id="manual-new-api-user-id"></a>

   **5.1 Finding the username and User ID**

   After signing in to the New API site, open its Profile or Personal Information page. Your username and User ID are shown there.

   ![Username and User ID in the profile](../static/image/manual/new-api/profile-user-info.png)

   <a id="manual-new-api-access-token"></a>

   **5.2 Finding the Access Token**

   On the New API profile page, scroll down to the Security section and locate Access Token. Click it to generate or obtain the token. This Access Token is not an API key from Token Management used to call models.

   ![Access Token in the Security section](../static/image/manual/new-api/access-token.png)

6. Enter a **Recharge Amount Ratio** (`CNY/USD`, greater than 0), then save the account. Check the actual site for its recharge ratio and enter the value used by that site.

   ![Enter the recharge amount ratio](../static/image/manual/new-api/exchange-rate.png)

::: tip Recommended settings
Prefer **Access Token Authentication**. If the account cannot refresh after saving, first check the site type, User ID, and Access Token. Try Cookie authentication only when the target site specifically requires it.
:::

::: warning Protect your account information
Access Tokens and Cookies are sensitive information. Do not share their full contents or expose them in public screenshots or issue reports.
:::

<a id="manual-sub2api"></a>
### 2.2 Sub2API

> Page layouts, button labels, and feature locations may differ between Sub2API sites. Follow the interface shown by the site you use.
> Sub2API stores its Access Token in browser local storage, and the sign-in token expires. Prefer **Auto Detection** (Section 1). If you need to add it manually, follow these steps.

1. Sign in to your Sub2API site.
2. Click the **All API Hub** extension icon in the browser toolbar. Opening it in the side panel is recommended so you can compare both interfaces while filling in the form.
3. Click **"Add Account"**, then use the current site address or enter the address manually.
4. Click **"Manual Add"**.

   ![Click Add Account](../static/image/manual/sub2api/add-account.png)

5. Fill in the following fields. Click a field name to jump to its instructions:

   - [**Site Name**](#manual-sub2api-site-name)
   - [**Site Type**](#manual-sub2api-site-type)
   - [**User ID**](#manual-sub2api-user-id)
   - [**Access Token**](#manual-sub2api-access-token)

   <a id="manual-sub2api-site-name"></a>

   **Site Name**: A custom name used to distinguish the account in the extension.

   <a id="manual-sub2api-site-type"></a>

   **Site Type**: Select `sub2api`.

   ![Manual account form](../static/image/manual/sub2api/account-form.png)

   <a id="manual-sub2api-user-id"></a>

   **5.1 Finding the User ID**

   The Sub2API profile page shows only the username and email address. To find the numeric User ID, use browser developer tools:

   1. After signing in to the Sub2API site, press `F12` to open developer tools.
   2. Switch to the **Network** tab and press `F5` to reload the page.
   3. Find the `auth/me` request, open it, and select **Response**.
   4. Find the `"id"` field inside `"data"`. That number is your User ID.

   > Alternative: In developer tools, open **Application** → **Local Storage** → the site domain, then find `auth_user`. Its `id` field is also your User ID.

   <a id="manual-sub2api-access-token"></a>

   **5.2 Finding the Access Token**

   Sub2API stores its Access Token in browser local storage instead of displaying it on the page. Use developer tools to retrieve it:

   1. After signing in to the Sub2API site, press `F12` to open developer tools.
   2. Open **Application** → **Local Storage** → the site domain.
   3. Find `auth_token` and copy its value, a long string that usually begins with `eyJ`. This is the Access Token.

   > This token is used to sign in to the site. It is not an API key from the API Keys page used to call models.

   ::: warning Token expiry and extension-managed sessions
   Sub2API Access Tokens expire. To let the extension renew the session independently in the background, import or enter a `refresh_token` as follows:

   1. We recommend signing in to the target Sub2API site in an incognito or private window first.
   2. Enable **"Extension-managed session (multiple accounts)"** in the account form.
   3. Click **"Import from currently signed-in account"**. The extension reads `refresh_token` from the current session's Local Storage and also fills in any available Access Token, User ID, and username.
   4. If automatic import fails, open **Application** → **Local Storage** → the site domain in developer tools, copy `refresh_token`, and paste it into the form's **"Refresh Token"** field.
   5. Confirm that the Refresh Token is filled in, save the account, and close the incognito or private window used for import. This prevents the site console and extension from rotating the same Refresh Token in parallel.

   You cannot save with managed sessions enabled and an empty Refresh Token. When managed sessions are disabled, the extension does not store a Refresh Token. It may only resynchronize through a temporary window while the corresponding account is still signed in to the browser; after that sign-in expires, you must sign in again or update the credentials.
   :::

6. Enter a **Recharge Amount Ratio** (`CNY/USD`, greater than 0), then save the account.

   Auto detection first uses the recharge conversion setting returned by the site. It falls back to **7.2** only when the site provides no valid value. You can also adjust it to match the actual recharge ratio. This value only affects balance conversion in the interface and does not affect account behavior.

   ![Enter the recharge amount ratio](../static/image/manual/sub2api/exchange-rate.png)

::: tip Recommended settings
Sub2API supports **Access Token Authentication only** and does not support Cookie mode. Prefer **Auto Detection**, which reads the token and fills in the User ID automatically. If the account cannot refresh after saving, first check the site type, User ID, and Access Token.
:::

::: warning Protect your account information
Access Tokens are sensitive information. Do not share their full contents or expose them in public screenshots or issue reports.
:::

<a id="manual-openrouter"></a>
### 2.3 OpenRouter

1. Sign in to OpenRouter.
2. Click the **All API Hub** extension icon in the browser toolbar. Opening it in the side panel is recommended so you can compare both interfaces while filling in the form.
3. Click **"Add Account"**, then use the current site address or enter the address manually.
4. Click **"Manual Add"**.

   ![Click Add Account](../static/image/manual/open-router/add-account.png)

5. Fill in the following fields. Click a field name to jump to its instructions:

   - [**Site Name**](#manual-openrouter-site-name)
   - [**Site Type**](#manual-openrouter-site-type)
   - [**Access Token**](#manual-openrouter-access-token)

   <a id="manual-openrouter-site-name"></a>

   **Site Name**: A custom name used to distinguish the account in the extension.

   <a id="manual-openrouter-site-type"></a>

   **Site Type**: Select `openrouter`.

   ![Manual account form](../static/image/manual/open-router/account-form.png)

   <a id="manual-openrouter-access-token"></a>

   **5.1 Finding the Access Token**

   In the OpenRouter console, open **"Management Keys"**, click **"+ New Key"** in the upper-right corner, complete the form, and click **"Create"**. Copy the new API key and enter it in All API Hub's **"OpenRouter Management Key"** field.

   > The full key is displayed only once. If you lose it, create a new one and enter it again.

   Quick link: [https://openrouter.ai/settings/management-keys](https://openrouter.ai/settings/management-keys)

   ![Management Key on the Management Keys page](../static/image/manual/open-router/management-key.png)

6. Enter a **Recharge Amount Ratio** (`CNY/USD`, greater than 0), then save the account. This value converts the USD balance to CNY for display. Enter the conversion ratio you want to use; it does not affect the OpenRouter account or billing.

   ![Enter the recharge amount ratio](../static/image/manual/open-router/exchange-rate.png)

::: tip Recommended settings
OpenRouter always uses a **Management Key (Access Token)**. You do not need to enter a User ID, and Cookie mode is not supported. If the account cannot refresh after saving, confirm that the key came from OpenRouter's Management Keys page. Existing keys cannot be displayed in full again, so create a new one and copy it immediately.
:::

::: warning Protect your account information
Management Keys are sensitive information. Do not share their full contents or expose them in public screenshots or issue reports.
:::

## 3. Cookie Mode

For some sites with strict API protection or extensive customization, try **"Cookie Mode"** if Access Token mode does not work. In this mode, the extension uses your current signed-in session (Cookie) to request data.

Cookies can expire and are not supported by every site. Try auto detection and Access Token authentication first, and switch to Cookie mode only when the target site specifically requires it.

## 4. Importing Accounts from Bookmarks

If you keep AI relay sites in browser bookmarks, use "Import from Bookmarks" to scan them and create multiple account candidates:

- The entry point is at the top of Account Management and inside the Add Account dialog as "Import Accounts from Bookmarks".
- Bookmark access is an **optional permission**. The extension can read bookmarks only after you grant permission.
- The flow is:

  > Grant permission → Read bookmark tree → Select scope → Scan and create candidates → Preview → Import → Results summary

- Existing accounts are skipped by default and are not imported again.
- After import, successful, failed, and skipped entries are summarized separately. Existing accounts count as skipped by default.
- Failed entries can continue through "Open Add Account".

## 5. Improving the Account Addition Experience

Under **Settings → Basic Settings → Account Management**, you can enable these options to make adding accounts faster:

- ⚡ **Auto-fill Current Page URL**: Automatically fills the current browser tab's URL when you click "Add Account".
- 🔑 **Automatically Create a Default Token after Adding an Account**: After an account is added successfully, the extension attempts to create a default API key (Token) on the site so it can be exported immediately.
  - **AIHubMix**: A full AIHubMix API key is shown only when it is created. After adding a new AIHubMix account (excluding the "Configure to Managed Site" flow), the extension first checks whether the account already has a key. If it does, the creation prompt is skipped. Otherwise, a confirmation dialog asks whether to create a default key and shows the full one-time key. If you cancel, create one later in Key Management and save the full key immediately.
- ⚠️ **Warn When Adding Duplicate Accounts**: When you add an existing site with the same URL, the extension asks for confirmation. You can continue, cancel, or disable future duplicate-account warnings and continue this addition.

::: tip Defaults for a new profile
For a new profile with no account settings configured, these options default to:

- Auto-fill URL: Off
- Automatically create a default token after adding an account: Off
- Warn when adding duplicate accounts: On
- Sorting priorities: All 10 enabled

These are defaults for a new profile, not settings that remain fixed after you change them.
:::

## Related Documents

- [Account Management](./account-management.md)
- [Getting Started](./get-started.md)
- [Supported Sites and System Types](./supported-sites.md)
- [FAQ](./faq.md)
