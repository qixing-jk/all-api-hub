# OmniRoute Management

[OmniRoute](https://github.com/diegosouzapw/OmniRoute) is a managed site in All API Hub. Configure the connection once to view, create, edit, and delete the gateway's channels (provider connections), or import account keys and API credentials.

OmniRoute is a self-hosted AI gateway, so it has no account semantics of its own: no balance, plan, or check-in. It can only be added as a **managed site**, and never appears in the account list.

## Connect your deployment

1. Open **Settings → Managed Site** and select **OmniRoute**.
2. Enter the **deployment URL**: the address you open the OmniRoute dashboard at in your browser, such as `http://localhost:20128`.
3. Enter an **access token or dashboard password**:
   - **Access token (recommended)**: create one under the gateway's **Settings → Access Tokens** with the `admin` scope. Tokens start with `oma_`.
   - **Dashboard password**: you can also enter the dashboard password. The extension exchanges it on the gateway for a token and **never stores the password**. This path creates an access token named `All API Hub` on the gateway so you can revoke it later.
4. Click **Verify connection**. A successful check saves the access token, and **Channel Management** becomes available.

OmniRoute authenticates with bearer tokens only and keeps no cookie session, so the extension needs no temporary window and no same-origin access. Remote deployments work directly as long as your browser can reach the address.

### About token privileges

An `admin`-scoped access token is equivalent to **every upstream channel credential** on that gateway, so only store it in a trusted environment. Reading channels needs only the `read` scope, but creating, editing, and deleting channels needs `admin`, so the extension validates with `admin` and tells you when it is missing.

You can narrow the token's scope on the gateway if you want to reduce exposure, but then it can only read channels: importing and editing from the extension stops working.

## Manage channels

Select OmniRoute in **Channel Management** to search channels, inspect details, create or edit entries, and delete them.

Channel fields:

| Field | Notes |
| --- | --- |
| Name | The connection name on the gateway |
| Provider | The gateway's built-in provider id, such as `openai`, `anthropic`, `deepseek` |
| Address | The connection-level upstream address. Empty keeps the selected provider's default endpoint |
| Key | The upstream credential |
| Default model | Used when a request names no model |
| Priority | The gateway tries a provider's connections in ascending order, so a smaller number is used first. A new connection is ranked last by the gateway; editable only when editing an existing channel |
| Status | Editable only when editing an existing channel |
| Connection test | Read-only: the result of the gateway's own last test of this channel (OK / failed / not testable / not tested) |
| Last error | Read-only: the reason the gateway gave for the last failure. The gateway sanitizes the message itself; there is no row after a success or before the first test |

**Address override**: a connection-level address overrides the provider's static configuration, so any relay can be added in one step. Pick the OpenAI-compatible provider and enter the relay address; there is no need to create a provider node first.

**Model prefix (advanced)**: if you need the channel addressed under its own prefix (`prefix/model`), expand **Advanced** while creating it and fill in **Custom model prefix**. The extension creates a provider node first and then a connection that references it, and reclaims the new node if the gateway clearly rejects the connection. Deleting a channel preserves its provider node to avoid deleting other channels or model aliases along with it. Clean up nodes in the gateway dashboard when needed. This path also requires an address.

**About status**: the gateway's create route does not accept an enabled state, so a new connection starts disabled until the gateway's own connection test decides otherwise. The create form therefore offers no status field, and a successful import does not mean the channel is connected.

**About the connection test**: the channel detail shows the result of the gateway's own last test of that channel, and after a failure it also shows the reason the gateway gave (`lastError`). The gateway generates that message and sanitizes it itself — it strips credentials, tokens, key blocks, stack frames and absolute paths — and the extension shows it as-is; open the OmniRoute dashboard to run a retest.

**About priority**: the connections of one provider are tried in ascending `priority`, and the gateway ranks a newly created connection last. The extension offers this field only while editing a channel and writes it back only when you change it, so an import never reorders what the gateway already had.

### Channel key visibility

The gateway masks channel keys in its list response by default, and the extension only uses that masked data for lists and matching. Only when it needs to decide whether "the channel at the same address holds the same credential" does it read plaintext through the gateway's `GET /api/providers/client` and discard it after comparing. That route is a gateway implementation detail and may be tightened at any time. If it cannot be read, the extension falls back to matching by address and name, and imports keep working.

## Import account keys or API credentials

1. Select and configure OmniRoute under **Settings → Managed Site**.
2. Open **Key Management** or **API Credentials** and use the managed-site import button in an entry's action area.
3. Confirm the name, provider, address, key, and default model in the import dialog, then submit.
4. To import several at once, select entries in Key Management and use the managed-site batch import entry, checking the preview before running it.

Import prefill rules:

- When the source address matches a known first-party provider endpoint (for example `https://api.deepseek.com`), that provider is preselected and the address is not overridden.
- Any other address preselects the OpenAI-compatible provider and writes the source address as a connection-level override.
- When the source account declares the Anthropic or Gemini protocol, the matching provider is selected instead.

Imports always use the single-create route. They never call the gateway's bulk or import entries, which validate every key against the source from the gateway and would make the gateway's outbound reachability part of import success. Credential validity stays the extension's own verification result.

A successful import does not mean the channel is connected: the gateway validates no credential and confirms no reachability. The **Connection test** row in the channel detail reports what the gateway itself observed, together with the gateway's **Last error** after a failure; open the OmniRoute dashboard to run a retest. Whether the source credential itself works stays the extension's own verification result.

## What this integration does not do

- **Managed-site model sync**: on this gateway models come from the provider catalogue, gateway-level aliases, and a gateway disabled list; a connection only carries a default model. There is no "write a model list back per channel" target, so OmniRoute offers no model sync.
- **Gateway API-key workspace**: the gateway's own key list is masked, and reading plaintext needs an extra switch. The extension manages channels only; use the dashboard's **API Manager** page for gateway keys.
- **Plaintext gateway key reads**: the gateway key list is always masked, and plaintext is only available through a single key's reveal route with the gateway's own switch enabled.

## Troubleshooting

- **"Token scope is insufficient"?** Use a token with the `admin` scope. You can create a new one under the dashboard's **Settings → Access Tokens**.
- **"The gateway still uses its default password"?** The gateway refuses to exchange a well-known default password for a token. Change the dashboard password on the gateway host first, then verify again.
- **"Name conflict"?** The gateway rejects connections with a duplicate name. Use a different name, or delete the existing connection in the dashboard first.
- **A private-network relay does not work after import?** OmniRoute guards against SSRF for stored custom addresses and blocks private-network and cloud-metadata addresses by default. The channel is created, but the gateway itself blocks it at request time. Adjust the gateway's guard for that provider, or use an address the gateway can reach.
- **"Result uncertain" after submitting?** The gateway answered 5xx, so whether the write applied is unknown. Refresh the list to confirm before retrying.
- **Can channels be migrated to another site?** Yes: enable **Channel migration** in the channel list. Known first-party provider types map onto the target site's equivalent type. Connections backed by a provider node with its own model prefix are out of scope and are reported in the preview. OmniRoute channels carry no model list, so migration brings no models.

## Related documentation

- [Self-hosted site management](./self-hosted-site-management.md)
- [Supported sites](./supported-sites.md)
- [Quick export of site configuration](./quick-export.md)
