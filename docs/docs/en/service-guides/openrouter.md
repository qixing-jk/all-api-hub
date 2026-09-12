# How OpenRouter Users Can Manage Accounts, API Keys, and Models with All API Hub

> Keep your OpenRouter balance, API Keys, model pricing, and client configurations organized in one place.

**All API Hub** is an open-source browser extension for AI API users. With OpenRouter, it helps you spend less time switching between consoles, looking for API Keys, and entering the same configuration in different tools.

After adding OpenRouter, you can check your balance and account status, manage API Keys by workspace, browse models and pricing, and save a newly created full API Key for use in your preferred AI tools.

## Why it is useful for OpenRouter users

When you use multiple OpenRouter workspaces, AI API services, or clients, balances become scattered, API Keys are harder to organize, model prices are harder to compare, and the same configuration gets entered repeatedly.

- **Check balances and status**: view OpenRouter alongside your other AI API accounts.
- **Manage workspace API Keys**: view, create, edit, disable, or delete keys in one place.
- **Compare models and pricing**: search OpenRouter models and compare them with models from other accounts.
- **Keep the full API Key**: save a new key to the API Credential Library while its full value is still visible.
- **Set up your usual tools faster**: export to Cherry Studio, CC Switch, Kilo Code, Claude Code Router, and other supported tools.

A practical workflow is to add OpenRouter automatically, use All API Hub for balances, API Keys, and model comparison, then copy or export a saved configuration when an AI tool needs it.

<a id="choose-access-path"></a>
## Recommended setup order

| Order | Method | When to use it |
| --- | --- | --- |
| 1 | Add the account automatically | You are signed in to OpenRouter and want the quickest setup |
| 2 | Add the account manually | Automatic setup does not finish |
| 3 | Save only an API Key | You do not need account management and only want to save, check, or export an existing API Key |

::: tip What is the difference between a Management Key and an API Key?
A Management Key adds the account and manages API Keys in OpenRouter. An API Key is the key you configure in AI clients. With automatic setup, All API Hub creates the Management Key for you, so you usually do not need to prepare one first.
:::

## Before you start

1. Install All API Hub. The [browser store version](../get-started.md) is recommended.
2. Register and sign in to [OpenRouter](https://openrouter.ai/).
3. Never show a complete Management Key or API Key in public screenshots, issue reports, or chat messages.

<a id="add-openrouter-account"></a>
## Add your OpenRouter account automatically

This is the recommended method. You do not need to create a Management Key beforehand; All API Hub handles that during setup.

1. Sign in to [OpenRouter](https://openrouter.ai/) in the same browser.
2. In All API Hub, select `Add Account` and enter `https://openrouter.ai`.
3. Select `Create OpenRouter Management Key & Detect`.
4. All API Hub opens OpenRouter and creates the Management Key automatically. Keep the page open while the account details are returned.
5. Review the account details and save.

![Add an OpenRouter account automatically](../../static/image/en/openrouter/add-account-auto-detect.png)

::: warning Check before retrying
If the new page closes, times out, or does not return a result, do not retry immediately. First check the [Management Keys](https://openrouter.ai/settings/management-keys) page for a Management Key created for All API Hub, then retry or switch to manual setup.
:::

## Add the account manually if automatic setup fails

1. Open OpenRouter's [Management Keys](https://openrouter.ai/settings/management-keys) page.
2. Create a Management Key for All API Hub and copy it while the full value is visible. You cannot view the full key again after leaving the page.
3. In All API Hub's add-account dialog, enter `https://openrouter.ai` and select `Manual Add`.
4. Select `OpenRouter` as the `Site Type`, paste the Management Key, and complete the remaining required fields shown in the dialog.
5. Save the account. If the key cannot be used, the page asks you to check it and try again.

<a id="add-runtime-api-key"></a>
## Save an existing API Key without adding an account

If you do not need the balance, workspaces, or OpenRouter key management, skip account setup and save an existing API Key in the API Credential Library.

1. Open OpenRouter's [API Keys](https://openrouter.ai/settings/keys) page, create an API Key, and copy it immediately. You can also use an existing key that you previously saved in full.
2. In All API Hub, open `Settings → API Credential Library` and add a credential.
3. Enter:
   - **Name**: for example, `OpenRouter`.
   - **API type**: select `OpenAI-compatible`.
   - **Base URL**: enter `https://openrouter.ai/api/v1`.
   - **API Key**: paste the API Key you prepared.
4. After saving, use the credential card to view available models, check whether the API Key works, copy the configuration, or export it to a supported client.

This method cannot show account balances or workspaces and cannot manage keys in OpenRouter. If you need those features later, add the account using the steps above.

![Save an OpenRouter API Key to the API Credential Library](../../static/image/en/openrouter/add-api-credential.png)

<a id="manage-openrouter-keys"></a>
## Manage OpenRouter API Keys in one place

After adding the account, open `Settings → Key Management` and select the OpenRouter account and workspace. You can:

- See whether each key is active, along with its limit, usage, and expiration.
- Create a key and, when needed, choose a workspace, spending limit, and expiration.
- Edit, disable, or re-enable a key.
- Permanently delete a key you no longer need.

![Manage API Keys in an OpenRouter workspace](../../static/image/en/openrouter/key-management.png)

### Save a new key immediately

OpenRouter shows the full API Key only once, immediately after creation:

1. Keep the one-time key dialog open.
2. Copy the key or select the action to save it to the API Credential Library.
3. Once saved, use the credential for model discovery, API verification, or client export.

After the dialog closes, All API Hub cannot recover the full key. If you did not save it, delete the key and create a replacement.

![Save the full value of a newly created OpenRouter API Key](../../static/image/en/openrouter/save-one-time-key.png)

<a id="browse-openrouter-models"></a>
## View and compare OpenRouter models

Open `Settings → Model List` and select the OpenRouter account to search models and see model names, model IDs, pricing, context length, and supported input and output types.

In the `All accounts` view, you can compare OpenRouter models with models from other accounts.

If you save a regular OpenRouter API Key in the API Credential Library, its credential card can also show available models and check whether the key works.

![Browse OpenRouter models and pricing](../../static/image/en/openrouter/model-catalog.png)

## From management to everyday use

### Export to the AI tools you use

To use OpenRouter in another tool, export a configuration saved in the API Credential Library to a supported client. This reduces repeated entry of the Base URL, API Key, and model information.

### How All API Hub works with AI clients

| | All API Hub | AI clients such as Cherry Studio and NextChat |
| --- | --- | --- |
| Main purpose | Manage accounts, balances, API Keys, and model pricing | Chat, coding assistance, file analysis, and other AI tasks |
| How they work together | Organizes and exports OpenRouter configurations | Uses the imported configuration to connect to OpenRouter |

OpenRouter provides the models and API service. All API Hub organizes the account and configuration, while your chosen client handles chat, coding assistance, and other model requests.

## Keep in mind

- Accounts and keys stay in the current browser by default. They sync to your WebDAV storage only after you enable WebDAV sync.
- Create a separate Management Key for All API Hub instead of sharing one with other tools.
- Editing or deleting a key in Key Management also changes it in OpenRouter. Deleted keys cannot be recovered.
- If a create, edit, or delete action does not show a clear result, refresh the list before trying again.
- Some personal workspaces do not provide a member list. If the page lets you continue, leave the creator unselected.

## Troubleshooting

### Why does All API Hub say my Management Key cannot be used?

Open OpenRouter's Management Keys page and check that the key still exists. If you can no longer find or copy the full key, create a new one and update or re-add the account.

### Why can I view a workspace but not manage its keys?

The current account may not be allowed to manage that workspace. Check that you selected the correct workspace and that the Management Key has access to it.

### Why can I not select a workspace member?

Personal or default workspaces may not provide a member list. The creator is optional; if the page lets you continue, leave it unselected.

### Why can I not copy or export an existing API Key?

OpenRouter does not show the full value of an existing key again. You can copy, check, or export it later only if you copied it or saved it to the API Credential Library when it was created.

### Why does OpenRouter not appear in Account Management after I save an API Key?

The API Credential Library only stores `Base URL + API Key`; it does not add an OpenRouter account. Follow the account setup steps above to view the balance or manage keys in OpenRouter.

## OpenRouter pages

- [OpenRouter API Keys](https://openrouter.ai/settings/keys)
- [OpenRouter Management Keys](https://openrouter.ai/settings/management-keys)
- [Management Key guide](https://openrouter.ai/docs/guides/overview/auth/management-api-keys)

## Related documentation

- [Service Guides](../service-guides.md)
- [Account Management](../account-management.md)
- [API Credential Library](../api-credential-profiles.md)
- [Key Management](../key-management.md)
- [Model List and Price Comparison](../model-list.md)
- [Privacy](../privacy.md)
