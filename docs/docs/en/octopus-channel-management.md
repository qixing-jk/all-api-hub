# Octopus Channel Management

> 🧪 This feature is currently in Beta, supporting direct management of Octopus site channels within the plugin.

## Feature Overview

- 📋 **Channel Overview and Filtering**: View the name, type, model count, and status of all channels at a glance, supporting keyword search and status filtering.
- ✏️ **Quick Creation / Editing**: Pop-up forms adapt to Octopus field definitions, allowing configuration of model lists and status.
- 🔄 **Model Synchronization**: Supports automatically pulling the latest model list from the upstream provider.
- 🗑️ **Safe Deletion**: Confirmation is required before deletion is triggered after batch selection, preventing accidental deletion of production channels.
- 📦 **Key Import**: Directly import API Keys from account management into Octopus channels.

## Differences from New API

Octopus and New API have some key architectural differences:

| Comparison Item | New API | Octopus |
|-----------------|---------|---------|
| Authentication Method | Admin Token + User ID | Username + Password (JWT) |
| Channel Type | 55+ types | 6 types |
| Group Concept | User Group | External Model ID (Different Concept) |
| Priority/Weight | Supported | Not Supported |

Therefore, in Octopus mode:
- **Hide Group Field**: Octopus's "Group" is the External Model ID, which is completely different from New API.
- **Hide Priority/Weight**: Octopus does not support these concepts.
- **Channel Type Options**: Only the 6 types supported by Octopus are displayed.

## Prerequisites

| Configuration Item | Description |
|--------------------|-------------|
| **Octopus Base URL** | Octopus site address, e.g., `https://octopus.example.com` |
| **Username** | Octopus login username |
| **Password** | Octopus login password |

> In the plugin, open **Settings → Basic Settings → Octopus Site Configuration**, fill in the above information, and save. The system will automatically handle login and JWT Token management.

## How to Access the Feature Page

1. Open the extension pop-up and click **"Settings"** on the left side.
2. Select **"Octopus"** under **Basic Settings → Self-Hosted Site Management**.
3. After filling in the Octopus site configuration, click **"Verify Configuration"** to ensure the connection is normal.
4. On the settings page, select **"Self-Hosted Site Channel Management"**; the remote channel list will load automatically.

## Channel List View

- **Search Box**: Supports fuzzy search by name / Base URL keyword.
- **Status Filter**: Quickly view enabled or disabled channels.
- **Custom Columns**: Control displayed columns via the column selector (the Group column is hidden by default in Octopus mode).
- **Batch Operations Bar**: Check the box before the row to enable batch deletion or batch synchronization.

## Creating or Editing Channels

1. Click **"New Channel"** in the upper right corner or select **"Edit"** from the menu at the end of the row.
2. Fill in the pop-up window:
   - **Basic Information**: Name, Type, API Key, Base URL.
   - **Model List**: Supports select all, invert selection, clear, and manual input of custom models.
   - **Status**: Enabled/Disabled.
3. After clicking **"Save"**, the system will call Octopus's channel interface, and the list will automatically refresh upon success.

### Octopus Channel Types

| Type Value | Name | Description |
|------------|------|-------------|
| 0 | OpenAI Chat | OpenAI Chat Completion API |
| 1 | OpenAI Response | OpenAI Response Mode |
| 2 | Anthropic | Claude API |
| 3 | Gemini | Google Gemini API |
| 4 | Volcengine | Volcengine API |
| 5 | OpenAI Embedding | OpenAI Embedding API |

## Import from Key Management

1. Select an account's API Key on the **Key Management** page.
2. Click the **"Import to Octopus"** button.
3. The system will automatically:
   - Fetch the upstream available model list
   - Construct the channel name (Format: `站点名 | 密钥名 (auto)`)
   - Add the `/v1` suffix to the Base URL (Octopus rule)
   - Enable automatic synchronization by default
4. After successful import, you can view it on the channel management page.

## Model Synchronization

Octopus model synchronization calls Octopus's `/api/v1/channel/fetch-model` interface to automatically pull the latest model list from the upstream provider.

1. In the channel list, click the **"Sync"** button at the end of the row to trigger single channel synchronization.
2. Or check multiple channels and click **"Batch Sync"** for batch operation.
3. Global synchronization operations can also be performed on the **Model Synchronization** page.

## Frequently Asked Questions (FAQ)

| Issue | Solution |
|-------|----------|
| Channel list is empty | Check if the Octopus configuration is complete, and click "Verify Configuration" to confirm the connection is normal. |
| Login failed | Ensure the username and password are correct, and the Octopus site is accessible. |
| Error during import | Check if the source account has a valid API Key and if the upstream site is accessible. |
| Type shows Unknown | Octopus may have returned an unknown type value; please check the channel configuration. |

## Related Documentation

- [New API Channel Management](./new-api-channel-management.md): Channel management for New API sites.
- [New API Model List Synchronization](./new-api-model-sync.md): Automatic batch synchronization of channel models.
- [Quick Export and Integration](./get-started.md#quick-export-sites): Learn how to push channels to downstream applications.