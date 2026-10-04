# gpt-load

[gpt-load](https://github.com/tbphp/gpt-load) is supported by All API Hub's managed-site feature. After configuring the connection once, you can view, create, edit, and delete the gateway's groups (channels) from the extension, import account keys or API credentials, and maintain each group's key pool and model list directly.

gpt-load is a self-hosted AI gateway (written in Go) that owns no upstream account of its own (no balance, plan, or check-in). It can only be connected as a **managed site** and never appears in the account list.

## Configuration

1. Open **Settings → Basic Settings → Self-Hosted Sites** and switch the site type to **gpt-load**.
2. Enter the **gateway address**: the address you use in the browser to open the gpt-load dashboard, for example `http://localhost:3001`.
3. Enter the **management key**: the gateway's root `AUTH_KEY` (from the `AUTH_KEY` environment variable, or the generated `data/auth.key` file).
4. Click **Check connection**. Two checks are performed: the gateway is reachable and the key is accepted.

gpt-load is bearer-only and has no cookie session, so the extension needs no temporary window and no same-origin access. Remote deployments work as long as the browser can reach the address.

### About the key and lockout

The management key holds the same power as every channel key on the gateway, so only save it in a trusted environment. The gateway rate-limits failed attempts per source IP: **5 failures in 30 minutes locks the address for 30 minutes**. Confirm the key before validating, and do not retry repeatedly after a failed validation.

## Managing channels

Select gpt-load in the **Channels** page to search, view details, create, edit, and delete channels.

A gpt-load channel is a **group**: one channel driver (35 built-ins: `openai`, `anthropic`, `gemini`, `deepseek`, `openai_compatible`, …), a set of channel parameters (at least `base_url`), a credential pool, and a model list.

| Field | Description |
| --- | --- |
| Name | The group name on the gateway |
| Type | The gateway's built-in channel driver id (the driver list is read live from the gateway) |
| Address | The channel-level upstream `base_url`. Leave empty on a known first-party provider to use the driver's own endpoint |
| Keys | The group's credential pool. Gateway-native multi-key support |
| Models | The group's model list; stored per group and replaced wholesale |
| Price multiplier | Scales the reported cost for balance and rate accounting |
| Weight | Manual load-balancing weight; higher values draw proportionally more traffic |

**Creating**: pick a driver (use **Load** to read the drivers this gateway actually ships), fill the address and keys, and select models. Each key becomes one row in the pool.

**Editing**: name, enabled state, address, models, multiplier, and weight are editable. The channel driver is fixed after creation (repointing another driver clears the pool the gateway bound to the current one), shown read-only. Model lists are replaced via `PUT /api/groups/:id/models`.

**Key pool**: the gateway's credential list always returns masked values, and the extension uses only masked data for lists and details. Plaintext is only read per-row on explicit operations (such as matching/migration). New rows go through the gateway's `POST /credentials/import` batch; removed rows call `DELETE /credentials/:id`; replacing a saved key means "import the new value, delete the old row".

**Channel migration**: gpt-load works as both a migration source and target. As a source it reads the whole credential pool (multi-key migrates together); as a target it writes every key into the group's pool in one create. Drivers map by protocol family (openai, anthropic, gemini, deepseek, ...); a built-in driver with no route-table entry (such as grok or cerebras) cannot be a migration source and reports an unsupported type.

## Importing account keys or API credentials

1. Select and configure gpt-load in **Settings → Managed Sites**.
2. Open **Key Management** or the **API Credential Library**, and click the managed-site import action on a row.
3. Confirm name, driver, address, keys, and models in the dialog, then submit.

Import prefill rules:

- A source address on a known first-party provider endpoint (for example `https://api.deepseek.com`) prefills that driver and does **not** override the address.
- Any other address prefills the `openai_compatible` driver and writes the source address as the `base_url` override.
- The source's declared models are carried into the group's model list.

Import always uses the single-step create route (`POST /api/groups`); the gateway performs no reachability check, so import success never depends on the gateway's outbound connectivity. Credential validity stays owned by the extension's own verification flow.

## What is not covered

- **Batch model auto-sync**: group model lists are writable through the editor, but this integration registers no background batch model-sync task; update batches in the gateway panel.
- **Subscription channels**: gpt-load can bind Claude/Gemini subscription accounts as credentials (a browser OAuth flow). This integration supports `api_key` groups only for now.
- **Gateway access-key workspace**: the downstream `sk-gl-` keys are managed in the gateway's **Access Keys** page, not here.

## Troubleshooting

- **Key rejected (401/423)?** Use the correct `AUTH_KEY`. Repeated failures lock the address for 30 minutes; confirm the configuration at the gateway while locked.
- **Name conflict?** The gateway rejects duplicate group names. Rename, or delete the duplicate in the gateway panel first.
- **Empty model list after import?** Group model lists are maintained per group; select and save models in the editor, or configure them in the gateway panel.
- **Uncertain result after submit?** The gateway answered a 5xx; whether the write applied is unknown. Refresh the list first, then decide whether to retry.

## Related

- [Self-hosted site management](./self-hosted-site-management.md)
- [Supported sites](./supported-sites.md)
- [Quick export](./quick-export.md)