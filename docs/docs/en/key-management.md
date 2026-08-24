# Key Management

> Key Management provides one place to view the runtime keys available from your accounts. Capabilities vary by site: ordinary Tokens, native OpenRouter keys, and SharedChat service keys can have different actions and interfaces. Buttons appear only when the selected account supports them.

## Use Cases

- Search keys by name, view them together, or export them in bulk without signing in to each site's console.
- Save a full key immediately when a site displays it only once during creation.
- Verify whether a key still works or is compatible with CLI tools.
- Save account keys to the [API Credential Library](./api-credential-profiles.md) or export them to common AI tools.

## Features at a Glance

- **Centralized list**: Group keys by account or view keys from all accounts. Keys are masked by default.
- **Name search**: Search matches key names only, never the key value itself.
- **Create, edit, and delete**: Ordinary Tokens can configure a name, quota, expiration, group, model restrictions, and IP/subnet restrictions. Available fields depend on site capabilities.
- **Reveal and copy**: A full value is available only when the server returns it or the item matches a locally saved API credential exactly. Save one-time keys immediately because they may be unrecoverable later.
- **Key check (repair)**: Checks saved accounts for a usable key, creates one when supported and missing, and lists remaining problems.
- **Verification and export**: When a full key is available and the account supports the action, verify API and CLI compatibility, save it to the API Credential Library, export it to an AI tool, or submit it to a self-hosted site.

## How to Access

1. Click the key-shaped **`Key Management`** button in the extension popup.
2. In the full-page view, open **`Key Management`** under **Interfaces** in the sidebar.
3. In Account Management, open an account's action menu and click **`Key Management`** to focus that account.

::: tip
`Key Management` and the `API Credential Library` are separate pages. Key Management works with added site accounts; the API Credential Library is for a `Base URL + API Key` without a site account.
:::

## Data Sources and Capability Differences

Capabilities vary by account type, site, and permissions. The main sources are:

| Source | Description |
|------|------|
| Traditional Tokens (New API family, etc.) | View, create, edit, and delete; search by name; keys masked by default. |
| Native OpenRouter keys | Uses the Management API; supports workspace, quota, expiration, disabled state, and other fields. A full key may be shown only at creation. Historical entries without a linked local credential can manage metadata only. |
| SharedChat service key | An account-level service key, usually a singleton. It can be reset when supported and is not managed like an ordinary Token. |

> Use the buttons currently displayed for the account as the source of truth. These are general capabilities; not every site supports every action.

## Core Operations

### 1. Select an Account and Refresh

- Select **`All Accounts`** or one account at the top of the page.
- Click **`Refresh Key List`** to reload keys and available status fields such as quota and expiration. Returned fields vary by site.

### 2. Search

Enter a key name in the search box. Search matches **names only** and does not inspect key values.

### 3. View, Reveal, and Copy

- Keys are masked by default, for example `sk-***...`.
- When the full key can be recovered, **`Show Key`** / **`Hide Key`** temporarily reveals it, and **`Copy`** writes the full value to the clipboard.
- Masking protects only the display and does not mean the key is stored encrypted. Copy, verification, export, backup, and remote submission are available only when a full value exists, and those actions use that full value.
- For keys shown only once at creation, such as some AIHubMix and OpenRouter keys, save them immediately. Historical OpenRouter entries that do not exactly match a local API credential contain only a mask or hash and cannot reveal, copy, verify, or export the full key.

### 4. Create a Key

1. Click **`Add API Key`** in the upper-right corner.
2. Complete the fields supported by the site:
   - **Key Name**: Required for identification.
   - **Quota**: Choose **`Unlimited Quota`** or enter a limited USD amount.
   - **Expiration**: Leave empty for no expiration.
   - **Group**: Select a key group when supported.
   - **Model Restrictions**: Use **`Select Models`** to limit available models.
   - **IP / Subnet Restrictions**: Optionally restrict allowed source addresses.
3. Click **`Create Key`**.

> When a site shows the key only once, an **`Save the Full Key Now`** dialog appears after creation. Copy or save the key before closing it.

### 5. Edit a Key

Click **`Edit Key`** to modify the name, quota, expiration, group, model restrictions, and other supported settings. **Editing does not change the key value itself.** If the site cannot update a key, the interface shows the reason.

### 6. Delete a Key

Click **`Delete Key`** and confirm the action to call the site's delete endpoint. Deletion behavior varies by site. If deletion fails or the outcome is unclear, refresh the list to verify the result.

> Bulk delete and bulk enable/disable are not currently available.

### 7. Key Check (Repair)

Click **`Key Check`** at the top:

1. In **`Check Account Keys`**, click **`Start Checking and Fill Missing Keys`**.
2. The extension checks saved accounts for a usable key. It may create a key for accounts that support automatic creation and lists other problems with reasons.
3. Accounts that cannot be handled automatically, such as AIHubMix one-time keys or sites without automatic key creation, show manual guidance.

> Key Check fills gaps only when the source, permissions, and recoverability allow it. It cannot recover every key. Actions that may create a remote key explicitly warn that a new key may be created on the corresponding site.

### 8. Verify API and CLI Compatibility

The key action area provides **`Verify API`** and **`Verify CLI Compatibility`**:

- Verification is a single probe that checks whether the current key and endpoint work and whether the response matches expectations.
- CLI compatibility verification evaluates suitability for CLI tools. It **does not launch or fully run an external CLI**.
- A result reflects that probe only. It does not guarantee long-term availability or permanent failure.

### 9. Bulk Operations

After selecting keys—by selecting the current filtered results, selecting account groups, or clearing the selection—you can:

- **`Save to API Credential Library`**: Save selected keys to the [API Credential Library](./api-credential-profiles.md).
- **`Bulk Import to CLIProxyAPI`**: Generate CLIProxyAPI configuration using unified Provider rules.
- **`Bulk Import to Self-hosted AI Gateway (Managed Site)`**: Check, prefill, and preview before submission. Clicking the entry point does not itself write remote data.

> Only keys that support bulk operations participate. Bulk delete, bulk enable/disable, plain-text bulk copy, and CSV export are not currently available.

### 10. Export to Other Tools

The token action area provides different entry points by target:

- **Chat clients**: Cherry Studio, Kelivo
- **Coding agents**: CC Switch, Kilo Code / Roo Code, Cursor++
- **Gateways and routing tools**: CLIProxyAPI, Claude Code Router
- **Self-hosted managed sites**: The current managed-site icon is displayed directly. Clicking it opens a prefilled create-channel flow. An existing match only triggers a duplicate-risk warning; it does not update or overwrite the existing channel.

#### Export to Kilo Code / Roo Code

See [Supported Export Tools and Integration Targets](./supported-export-tools.md) for export and integration details.

## Management Links

- Click **`View Account Models`** in Key Management to open that account in Model List.
- Model List can also navigate back to the account's Key Management view.
- To add notes and tags to a frequently used key, click **`Save and Link to API Credential Library`** to save its `URL + Key` pair to the [API Credential Library](./api-credential-profiles.md).

## Security

- **Masking is not encryption**: A mask protects only what is displayed. When a full key exists, copy, verification, export, backup, and remote submission use the full value. Items containing only a mask or hash do not offer these actions.
- Saving to the API Credential Library stores the full `Base URL + key` locally in the extension, masked by default in the UI. Deleting the local profile does not revoke or modify the remote key.
- Encryption at rest depends on the source; no default application-layer encryption was identified. Protect keys in your local environment.
- Save one-time keys immediately after creation.

## FAQ

| Question | Answer |
|----------|--------|
| Why can't I see the full key? | The site may disable key reveal, or the key may be shown only once at creation. Historical OpenRouter entries without a linked local API credential cannot recover the full value, and Key Check cannot guarantee recovery. |
| How secure are my keys? | Keys are masked by default, but masking protects only the display. When a full key exists, copy, verification, export, and remote submission use it. Encryption at rest varies by source; do not assume default encryption. |
| Why can't search find a key? | Search matches key names only, not key values. |
| Why do different accounts show different buttons? | Key Management displays actions by account capability. Sites differ in support for Tokens, native keys, and service keys. |

## Related Documentation

- [API Credential Library](./api-credential-profiles.md)
- [Model List](./model-list.md)
- [Supported Sites](./supported-sites.md)
- [Supported Export Tools and Integration Targets](./supported-export-tools.md)
- [Data Management](./data-management.md)
