# Self-Hosted Site Management

> Bring the accounts you already use in the extension into your self-hosted site without copying URLs and keys again. Once connected, you can use your own API to access them, then manage settings, update models, and move channels to another site from the extension.

## Supported System Types

All API Hub is deeply adapted to the following open-source/self-hosted AI distribution systems:

| System Type                     | Core Management Object | Features                                                                                                                                   |
| ------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **[CLIProxyAPI](./cliproxyapi-integration.md)**                 | Providers              | Manage upstream providers, credentials, and model mappings.                                                                                |
| **New API / Veloera / DoneHub** | Channel                | Classic channel management, supporting 55+ upstream types, with group, priority, and weight systems.                                       |
| **Sub2API**                     | Account                | Unified access and shared management for Claude, OpenAI, Gemini, Antigravity, and other subscriptions.                                     |
| **AxonHub**                     | Channel                | High-performance AI gateway, supporting 15+ channel types, with a simple interface and efficient configuration.                            |
| **Claude Code Hub**             | Provider               | Focused on multi-vendor access and elastic scheduling, with clear provider management logic and adaptation to multiple response protocols. |
| **Octopus**                     | Channel                | Lightweight aggregation service for individuals, supporting 6 mainstream channel types.                                                    |

## Features at a Glance

- 🔑 **Use Your Own API for Multiple Accounts**: Connect your self-hosted site, then choose the keys you want in "Key Management" and import them as channels, individually or in bulk. URLs and keys are filled in for you, saving repeated copying and typing.
- 📋 **Make Channel Changes in the Extension**: When you need to add a channel or change settings, open the extension's channel list. Select channels you no longer need to delete them together, and switch sites here when you manage more than one.
- 🔄 **Let the Extension Keep Up with Model Updates**: You can sync model lists for one channel or several at once. Turn on scheduled sync to have the extension update them at the interval you choose, then check the sync results.
- 📦 **Take Your Channels with You When Switching Sites**: Choose the channels and destination, then use Channel Migration (Beta) to copy them over. The preview shows which settings can be kept and which need attention, so you can review them before starting and save yourself repeated setup.

What you can do depends on the site you select. Check the available actions and guidance on its page.

## Configuration Guide

Before using the management features, you need to complete the connection configuration for the corresponding backend in the extension.

### 1. Access the Configuration Page

Open the extension settings page, go to **"Basic Settings"** in the left menu, and find **"Self-Hosted Site Management"**.

### 2. Fill in Connection Information

| Option                         | Description                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Base URL**                   | Your self-hosted system's backend address (usually the web access address).                                                                                                                                                                                                                                                                      |
| **Authentication Credentials** | **CLIProxyAPI**: Management key.<br>**New API Series**: Requires `Admin Token` and User ID.<br>**Sub2API**: Admin API Key (if key access requires additional web verification, the extension cannot view or export keys or migrate channels out).<br>**AxonHub**: Admin email and password.<br>**Claude Code Hub**: Admin email and password.<br>**Octopus**: Username and password. |

### 3. Verify Connection

Click **"Verify Configuration"**. After successful verification, the management entrance for the corresponding system will be automatically unlocked.

## Channel Management Operating Guide

### 1. List Operations

Select **"Self-Hosted Site Management"** at the top of the settings page (or click the **"Manage Channels"** button in basic settings):

- **Search and Filter**: Supports real-time search by name, type, and status.
- **Quickly Switch Systems**: If you have configured multiple self-hosted systems, you can quickly jump between them using the switcher at the top.
- **Custom Columns**: For systems that do not support "Priority" or "Weight" (such as Octopus), the corresponding columns will be automatically hidden.

### 2. Create or Edit Channels

1. Click **"Add Channel"** at the top right.
2. The form will automatically adjust according to the current system type:
   - **New API**: Provides rich channel types and group configurations.
   - **Claude Code Hub**: Requires selecting a provider type (OpenAI Compatible, Claude, Gemini, etc.).
   - **AxonHub**: Supports rapid configuration of model lists.
3. After saving, the system will directly call the backend API to complete synchronization.

### 3. Security Verification (2FA / OTP)

When performing sensitive operations (e.g., viewing a channel's real key), if the system has secondary verification enabled, the extension will pop up a verification window.

- For details, see: [New API Security Verification](./new-api-security-verification.md)

<a id="channel-migration"></a>

### 4. Channel Migration (Beta)

Copy channels from the current self-hosted site to another configured site without recreating each one manually. Configure connections for both sites before starting.

1. Enable **"Channel Migration"** on the source site's channel list, then select channels or use the current filtered results.
2. Choose the target site. Review the preview for changes to types, URLs, models, groups, and statuses, along with settings that cannot be preserved.
3. Click **"Start migration"** and confirm. The extension reads each source channel's key and creates a channel on the target site.
4. Check each result. If a result is **"Uncertain"**, refresh the list and inspect the target site before deciding whether to retry, to avoid duplicates.

Migration only creates new channels. It does not modify the source, detect duplicates, overwrite existing channels, or roll back changes automatically.

**Multi-key channels**: The preview compares source and target key counts. New API, Octopus, AxonHub, and supported CLIProxyAPI API-key providers can export their complete key lists. If the target can retain the keys and their enabled states together, migration creates one multi-key channel. Otherwise, it creates a channel per key, appends `[Key 1]`, `[Key 2]`, etc. to the names, and reports each result separately. Splitting may change traffic distribution.

Key enabled states are preserved, but rotation policies, disable reasons, runtime history, and provider-specific per-key proxy or weight settings may not be retained. Check the preview warnings. A source that cannot export all keys is blocked. If key counts or enabled states change during execution, refresh the preview before handling unfinished items. Successful creations are never retried automatically.

Supported channel types and settings vary by system; follow the statuses and guidance in the migration preview. Groups, model mappings, priorities, and other settings may change or be omitted. After migration, check the channel settings and enabled status on the target site.

If prompted to complete verification before reading a source key, do so and retry. If the required verification method is not supported, retrieve the key from the source dashboard and add the channel manually on the target site.

## FAQ

| Question                          | Solution                                                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration verification failed | Please confirm if the Base URL is entered correctly (including `https://`) and if the administrator permissions are valid. Some systems require disabling two-step verification or using a specific API token. |
| List loads slowly                 | When the number of channels is large (>100), loading may take a few seconds due to backend API performance limitations; please be patient.                                                                     |
| Unable to sync models             | Please confirm if the backend network of the self-hosted site can normally access the upstream addresses (such as OpenAI / Claude official sites).                                                             |
| Some fields show Unknown          | This is usually because the version of the self-hosted site is too new or too old, returning a type ID that the extension hasn't yet adapted to.                                                               |

## Related Docs

- [Managed Site Model Sync](./managed-site-model-sync.md): Automatically batch sync channel models.
- [Quick Export and Integration](./get-started.md#quick-export-sites): Learn how to push channels to downstream applications.
- [Supported Sites List](./supported-sites.md): View more compatible systems.
