# Self-Hosted Site Management

> 🧪 This feature aims to condense the most common channel operation actions (site building, parameter adjustment, synchronization) into the extension, so you don't have to frequently go back and forth between different system backends.

## Supported System Types

All API Hub is deeply adapted to the following open-source/self-hosted AI distribution systems:

| System Type | Core Management Object | Features |
|----------|------------|------|
| **New API / DoneHub / Veloera** | Channel | Classic channel management, supporting 55+ upstream types, with group, priority, and weight systems. |
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
| **Authentication Credentials** | **New API Series**: Requires `Admin Token` and User ID.<br>**AxonHub**: Admin email and password.<br>**Claude Code Hub**: Admin email and password.<br>**Octopus**: Username and password. |

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
This is an advanced feature that allows you to quickly convert existing accounts from **"Account Management"** into channels for your self-hosted site.

1. Click **"Channel Migration"** on the channel list page.
2. Select the source (existing account/bookmark) and target (current self-hosted site).
3. The extension will automatically:
   - Extract the Base URL and API Key.
   - Attempt to automatically identify available upstream model lists.
   - Generate channel names according to preset rules.

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