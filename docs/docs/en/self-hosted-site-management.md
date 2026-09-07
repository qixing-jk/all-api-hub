# Self-Hosted Site Management

> 🧪 This feature aims to condense the most common channel operation actions (site building, parameter adjustment, synchronization) into the extension, so you don't have to frequently go back and forth between different system backends.

## Supported System Types

All API Hub is deeply adapted to the following open-source/self-hosted AI distribution systems:

| System Type | Core Management Object | Features |
|----------|------------|------|
| **New API / DoneHub / Veloera** | Channel | Classic channel management, supporting 55+ upstream types, with group, priority, and weight systems. |
| **Sub2API** | Account | Unified access and shared management for Claude, OpenAI, Gemini, Antigravity, and other subscriptions. |
| **AxonHub** | Channel | High-performance AI gateway, supporting 15+ channel types, with a simple interface and efficient configuration. |
| **Claude Code Hub** | Provider | Focused on multi-vendor access and elastic scheduling, with clear provider management logic and adaptation to multiple response protocols. |
| **Octopus** | Channel | Lightweight aggregation service for individuals, supporting 6 mainstream channel types. |

## Features at a Glance

- 📋 **Unified List View**: See the names, types, model lists, priorities, and statuses of all channels/providers at a glance.
- ✏️ **Cross-Platform CRUD**: Automatically adapts form fields according to the selected system type, without the need to manually convert parameters.
- 🔄 **Channel Migration and Sync**: Supports directly importing existing accounts/keys as channels for self-hosted sites, and supports single-channel or batch model synchronization.
- 🗑️ **Safe Batch Operations**: Supports batch enabling, disabling, and deleting, with confirmation popups before operations.
- 🔌 **Downstream Ecosystem Linkage**: After creating a channel, it can be linked with "Key Management" to export to CherryStudio, CC Switch, etc., with one click.

## Configuration Guide

Before using the management features, you need to complete the connection configuration for the corresponding backend in the extension.

### 1. Access the Configuration Page
Open the extension settings page, go to **"Basic Settings"** in the left menu, and find **"Self-Hosted Site Management"**.

### 2. Fill in Connection Information

| Option | Description |
|------|------|
| **Base URL** | Your self-hosted system's backend address (usually the web access address). |
| **Authentication Credentials** | **New API Series**: Requires `Admin Token` and User ID.<br>**Sub2API**: Admin API Key (only for deployments without `step-up` enabled).<br>**AxonHub**: Admin email and password.<br>**Claude Code Hub**: Admin email and password.<br>**Octopus**: Username and password. |

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

### 4. Channel Migration (Beta)

Copy channels from the current self-hosted site to another configured site without recreating each one manually. Configure connections for both sites before starting.

1. Enable **"Channel Migration"** on the source site's channel list, then select channels or use the current filtered results.
2. Choose the target site. Review the preview for changes to types, URLs, models, groups, and statuses, along with settings that cannot be preserved.
3. Click **"Start migration"** and confirm. The extension reads each source channel's key and creates a channel on the target site.
4. Check each result. If a result is **"Uncertain"**, refresh the list and inspect the target site before deciding whether to retry, to avoid duplicates.

Migration only creates new channels. It does not modify the source, detect duplicates, overwrite existing channels, or roll back changes automatically.

**Sub2API migration support:**

- Supports migration to and from API Key accounts on OpenAI, Anthropic, Gemini, and Grok. OAuth, `upstream`, and Antigravity accounts are not supported.
- When migrating to Sub2API, source groups are not copied. The target platform's default group is used if it exists; check group assignments and enabled status afterward. The preview warns about settings that cannot be preserved, such as model redirects, concurrency, and proxies.
- If exporting keys from the source site requires web verification, the configured Admin API Key cannot complete it. Retrieve the key from the source dashboard and migrate the channel manually.

## FAQ

| Question | Solution |
|------|----------|
| Configuration verification failed | Please confirm if the Base URL is entered correctly (including `https://`) and if the administrator permissions are valid. Some systems require disabling two-step verification or using a specific API token. |
| List loads slowly | When the number of channels is large (>100), loading may take a few seconds due to backend API performance limitations; please be patient. |
| Unable to sync models | Please confirm if the backend network of the self-hosted site can normally access the upstream addresses (such as OpenAI / Claude official sites). |
| Some fields show Unknown | This is usually because the version of the self-hosted site is too new or too old, returning a type ID that the extension hasn't yet adapted to. |

## Related Docs

- [Managed Site Model Sync](./managed-site-model-sync.md): Automatically batch sync channel models.
- [Quick Export and Integration](./get-started.md#quick-export-sites): Learn how to push channels to downstream applications.
- [Supported Sites List](./supported-sites.md): View more compatible systems.
