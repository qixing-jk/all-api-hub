# Managing AIHubMix API Keys and Model Pricing with All API Hub

> Use All API Hub with AIHubMix to manage account balance, API keys, and model pricing, and to reuse saved credentials in other AI tools.

**All API Hub** is an open-source browser extension for AI API users. With AIHubMix, it helps you view account balance, manage API keys, inspect model lists and prices, and save full API keys when they are shown only once.

![All API Hub home preview](../../static/image/sponsor-guides/aihubmix/all-api-hub-home-preview.png)

---

## 1. What All API Hub Does

When you use several AI models or API platforms, balance, keys, and pricing information can become scattered. **All API Hub** ([open source on GitHub](https://github.com/qixing-jk/all-api-hub)) provides one local management entry point for these details.

For AIHubMix users, it helps with:

- **Balance view**: check AIHubMix balance from the extension panel.
- **API key protection**: AIHubMix full keys are shown only once; All API Hub can save the full key to **API Credential Profiles** when it is created.
- **Model pricing lookup**: view AIHubMix model lists and input/output prices.
- **Credential export**: export saved keys to Cherry Studio, CC Switch, Kilo Code, CLIProxyAPI, Claude Code Router, and other tools.

---

## 2. Install All API Hub

For automatic updates and the most stable experience, install from the official store for your browser when possible.

- **Chrome**: [Chrome Web Store](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo)
- **Edge**: [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa)
- **Firefox**: [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24})
- **QQ / 360 / Brave / Vivaldi / Opera, etc.**: Brave, Vivaldi, and Opera can usually try Chrome Web Store first; QQ Browser, 360 Browser, Cheetah Browser, and similar browsers can use manual Chromium loading when no usable store path is available. See the [Other Browser Installation Guide](../other-browser-install.md).
- **Safari on Mac**: see the [Safari installation guide](../safari-install.md).
- **Mobile browsers**: see the [mobile browser FAQ](../faq.md#mobile-browser-support).
- **Fallback option**: if your browser cannot use a store build or Chrome Web Store compatible build, and the guide above does not work, download the Stable package from [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases/latest). Manually installed builds do not update automatically.

---

## 3. Add an AIHubMix Account

All API Hub can auto-recognize and add AIHubMix accounts without complicated manual configuration.

AIHubMix supports many models, so users often need to confirm model names, pricing, and tool suitability before use. AIHubMix API keys are also shown only once after creation. If they are not saved immediately, you usually need to create a new key.

All API Hub addresses both workflows:

- Add the account to view balance and model pricing in one place.
- Save the full API key immediately after creation so it can be copied, verified, or exported later.

### 3.1 Auto-Recognize and Add

1. Log in to the [AIHubMix console](https://console.aihubmix.com/?aff=W3DN) in your browser.
2. Click the All API Hub extension icon in the top-right corner of the browser.
3. Click **Add Account**, then use the current site address or manually enter the AIHubMix address.

   ![Enter the AIHubMix console address before auto-recognition](../../static/image/sponsor-guides/aihubmix/aihubmix-add-account-auto-detect.png)

4. Click **Auto-Recognize**. The extension will identify the `AIHubMix` account type.
5. Confirm the account information, then click **Save Account**.

   ![Confirm the recognized AIHubMix account information](../../static/image/sponsor-guides/aihubmix/aihubmix-account-details-confirm.png)

:::: tip
After the account is saved, the extension uses the imported account token to read balance, API key, and model pricing information.
::::

### 3.2 Save One-Time Full API Keys

Because AIHubMix full API keys are not shown again after creation, All API Hub provides a dedicated flow:

1. **Prompt after account save**: after adding the account, the extension asks whether to create a default key immediately.

   ![Prompt to create an AIHubMix default key](../../static/image/sponsor-guides/aihubmix/aihubmix-create-default-key-prompt.png)

2. **Create and view now**: click **Create and view now** to generate a new key and open the full key window.
3. **Save to API Credential Profiles**: click **Save to API Credential Profiles** so the key is stored locally in the browser for later copy, verification, or export.

   ![Save a one-time AIHubMix full key](../../static/image/sponsor-guides/aihubmix/aihubmix-save-one-time-key.png)

---

## 4. Core Workflows

### 4.1 View Balance and Account Status

The All API Hub dashboard shows AIHubMix account status and balance. If refresh fails or the account needs attention, the extension shows the status in the account card.

### 4.2 Check Model Pricing

Open **Model Pricing** and select your AIHubMix account as the data source. You can:

- View the model list returned by AIHubMix.
- Check input and output pricing, shown as USD per 1M tokens where applicable.
- Search a specific model before configuring it in another tool.

![View AIHubMix model list and pricing](../../static/image/sponsor-guides/aihubmix/aihubmix-model-price-list.png)

### 4.3 Export to AI Clients

To use AIHubMix in another tool:

1. Find the saved AIHubMix key in **API Credential Profiles**.
2. Choose an export action.
3. Select the target tool, such as **Cherry Studio**, **CC Switch**, **Kilo Code**, **CLIProxyAPI**, **Claude Code Router**, or a configured self-hosted site.

![Export an AIHubMix key from API Credential Profiles](../../static/image/sponsor-guides/aihubmix/aihubmix-credential-export-menu.png)

After saving a key to API Credential Profiles, you can also copy `Base URL + API Key`, verify availability, view available models, export to multiple clients, import into a configured self-hosted site, or move it with import/export and WebDAV sync.

---

## 5. All API Hub vs. API Clients

| Area | All API Hub (Management) | Cherry Studio / NextChat and Similar Clients |
| --- | --- | --- |
| Core role | Manage accounts, balances, keys, and pricing | Send chats, run inference, and manage prompts or agent workflows |
| Main actions | Dashboard, key saving, pricing lookup, credential export | Chat, file analysis, and agent workflows |
| Relationship | Provides source configuration such as API keys and pricing | Uses credentials managed by All API Hub |

Recommended workflow: manage account, key, and pricing information in All API Hub, then use your preferred client to send requests.

---

## 6. FAQ

**Q: Does All API Hub upload my API key?**

A: By default, account and key data stays in your local browser. It is synced only if you explicitly enable WebDAV sync and configure your own WebDAV storage.

**Q: Why are some models missing after I add the account?**

A: All API Hub displays model data returned by the AIHubMix API. If the account-specific availability cannot be confirmed, the extension may fall back to the full model catalog and indicate that some models may not be callable by the current account.

**Q: Can I recover an AIHubMix key I created earlier?**

A: AIHubMix full keys are normally shown only once. If the key was not saved to API Credential Profiles at creation time, All API Hub cannot recover it later. Create a new key in AIHubMix and save it while the full key is visible.

**Q: Does All API Hub replace the AIHubMix console?**

A: No. Recharge, account settings, and official key creation still belong to the AIHubMix console. All API Hub is better suited for day-to-day balance checks, key saving, and credential export.

---

## Links

- [AIHubMix](https://aihubmix.com/?aff=W3DN)
- [All API Hub GitHub repository](https://github.com/qixing-jk/all-api-hub)
- [All API Hub documentation](https://all-api-hub.qixing1217.top/en/)
