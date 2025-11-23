# New API Channel Management

> 🧪 This feature is currently in Beta, aiming to condense the most common channel operational actions (site creation, parameter tuning, synchronization) into the plugin, eliminating the need to frequently switch between the New API backend.

## Feature Overview

- 📋 **Channel Overview and Filtering**: View all channel names, types, groups, priorities, weights, and statuses at a glance, with support for keyword search and multi-tag filtering.
- ✏️ **Quick Create / Edit**: The pop-up form uses New API field definitions, allowing one-time configuration of model lists, groups, priorities, weights, and statuses.
- 🔄 **Single Channel Synchronization**: When debugging model synchronization, you can directly trigger "Sync This Channel" for a specific channel within the list, complementing batch synchronization.
- 🗑️ **Secure Deletion**: After batch selection, a confirmation will be prompted before deletion to prevent accidental removal of production channels.
- 📦 **Seamless Export**: Linked with key management, channels can be immediately exported to CherryStudio, New API, or CC Switch after creation.

## Prerequisites

| Configuration Item | Description |
|--------------------|-------------|
| **New API Base URL** | Accessible backend address, e.g., `https://example.com` |
| **Admin Token** | Admin Token with channel read/write permissions |
| **Admin User ID** | User ID corresponding to the token |

> In the plugin, open **Settings → Basic Settings → New API Integration Settings**, fill in the above information, and save. If the configuration is missing, the channel management page will display a "Configuration Missing" prompt.

## How to Access the Feature Page

1.  Open the extension pop-up and click **"Settings"** on the left.
2.  On the settings page, select **"New API Channel Management (Beta)"** below the top title, or directly click the **"Manage Channels"** button in Basic Settings.
3.  If the configuration is correct, the remote channel list will be loaded automatically.

## Channel List View

- ![New API Channel Management Interface](./static/image/new-api-channel-manage.png)

-   **Search Box**: Supports fuzzy search by name / Base URL / group keywords.
-   **Status Filter**: The `Status` filter in the top right corner allows quick viewing of enabled, manually paused, or automatically disabled channels.
-   **Custom Columns**: Use the column selector to control whether to display columns such as Base URL, Group, Priority, etc.
-   **Batch Operations Bar**: Check the box before a row to enable batch deletion.

## Create or Edit Channels

1.  Click **"Add Channel"** in the top right corner or select **"Edit"** from the row-end menu.
2.  In the pop-up window, fill in:
    -   **Basic Information**: Name, Type, API Key, Base URL.
    -   **Model List**: Supports select all, invert selection, clear, and manual input of custom models.
    -   **User Group**: Automatically reads groups from the New API backend, or can be customized.
    -   **Advanced Settings**: Priority, Weight, Status (Enabled/Disabled).
3.  After clicking **"Save"**, the system will call the New API's `POST/PUT /api/channel` interface, and the list will automatically refresh upon success.

### Field Validation

-   Channel Name and API Key are required (can be relaxed during editing as needed).
-   Some types (e.g., Volcengine, Suno) require a Base URL.
-   Fields that fail validation will prompt the reason; submission failures will trigger a toast notification in the top right corner.

## Single Channel Synchronization

If you are debugging with **New API Model Synchronization**, you can click the **"Sync"** button at the end of the row in the list to trigger model redirection generation and retry only for the current channel, facilitating quick verification.

## Delete Channels

1.  Select the channels to be deleted and click **"Delete"**.
2.  The `DELETE /api/channel/{id}` will only be called after confirmation in the pop-up window.
3.  If an error is returned (e.g., insufficient permissions), the interface will display the detailed information returned by the backend.

## Advanced Tips

-   **Using Model Whitelists**: First set up a whitelist on the model synchronization page, then return to the channel page to sync individually, ensuring that new channels only include the required models.
-   **Priority and Weight**:
    -   The lower the `priority`, the earlier the call order.
    -   `weight` is used for load balancing among channels of the same priority; a higher value increases the probability of being selected.
-   **Batch Export**: After saving channels, you can push them to CherryStudio / CC Switch with one click from the **Key Management → Export** panel, avoiding repetitive input.

## Frequently Asked Questions

| Issue | Solution |
|-------|----------|
| Channel list is empty | Check if the New API configuration is complete or if the network can access the backend. |
| 401/403 error on save | Ensure the admin token has channel write permissions; regenerate the Token if necessary. |
| Model/Group list is empty | The plugin will still allow manual input; you can re-save the configuration in `Settings → New API Integration` and try again. |
| No response when clicking sync | Please check if your browser has disabled background scripts, or confirm that the global sync function is working correctly on the model sync page. |

## Related Documentation

-   [New API Model List Synchronization](./new-api-model-sync.md): Automatically batch sync channel models.
-   [Quick Export and Integration](./get-started.md#_4-快速导出站点): Learn how to push channels to downstream applications.