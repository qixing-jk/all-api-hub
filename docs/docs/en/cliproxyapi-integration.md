# CLIProxyAPI Integration and One-Click Import

> Import relay station accounts to the local CLIProxyAPI management interface with one click, automatically generating OpenAI-compatible provider configurations and avoiding manual configuration file maintenance.

## Feature Overview

- **Management Interface Docking**
    - Reads and writes configurations via CLIProxyAPI's Management API (`/openai-compatibility`).
    - Supports appending/updating API Keys on existing providers, or automatically creating new providers.
- **One-Click Key Import**
    - Click "Import to CLIProxyAPI" in the key list to write the current site's Base URL and key to CLIProxyAPI.
- **Avoid Duplicate Configurations**
    - Automatically reuses site names and `Base URL`. If the same provider is detected, only the key list is updated, and no duplicate entries are created.

## Prerequisites

- **CLIProxyAPI** is deployed or running and compatible, with the management interface enabled:
    - Example address: `http://localhost:8317/v0/management`
    - Supports `GET/PUT/PATCH /openai-compatibility` and other interfaces.
- Possess the **Management Key** for the management interface (for authentication).
- In All API Hub, the following has been completed:
    - At least one relay station account added and available keys obtained.

## Setup Entry

1. Open the plugin → Go to the **Settings** page.
2. Switch to the **"CLIProxyAPI"** group (`Basic Settings → CLIProxyAPI` tab).
3. Fill in the following fields:
    - **Management Interface Base URL**: For example, `http://localhost:8317/v0/management`
    - **Management Key**: The key used to access the management interface.
4. After saving, the configuration will be stored in local preferences for subsequent import operations.

## One-Click Import from Key List

1. Open the plugin → Go to the **Key Management** page.
2. Find the site key card you want to import to CLIProxyAPI.
3. Click the CLIProxyAPI icon button to the right of the key (usually next to the CherryStudio / CC Switch / New API button).
4. The plugin will:
    - Read CLIProxyAPI configuration (Base URL and management key).
    - Generate an OpenAI-compatible address using the site's `Base URL` (automatically appends `/v1`).
    - Use the site name or Base URL as the provider name.
    - Call CLIProxyAPI:
        - If a provider with the same name or `base-url` already exists:
            - Append the current key to `api-key-entries` after deduplication.
        - If it does not exist:
            - Create a new provider entry, containing only the current key and basic information.
5. After the operation is complete, you will see an import result prompt in the upper right corner (success/failure and error reason).

## Effect After Importing to CLIProxyAPI

- In CLIProxyAPI's configuration, a new or updated structure similar to this will be added:
    - `name`: Derived from the site name (or Base URL).
    - `base-url`: Uniformly points to the corresponding relay station's `/v1` OpenAI-compatible interface.
    - `api-key-entries`: Contains one or more `api-key` records, which can continue to be manually edited in CLIProxyAPI.
- This means:
    - Multiple upstream relay station keys can be centrally managed at the CLIProxyAPI layer.
    - All API Hub is responsible for synchronizing basic configuration information, and subsequent details can be customized within CLIProxyAPI.

## Frequently Asked Questions

- **Prompt: CLIProxyAPI is not configured**
    - Check if the Base URL and management key have been filled in **Settings → CLIProxyAPI**.
    - Ensure that `/openai-compatibility` is not redundantly included; it should be the management interface prefix, e.g., `.../v0/management`.
- **Returns 401/403 or other HTTP errors**
    - Confirm that the management key is correct and that the current account has permission to access the management interface.
    - Check the CLIProxyAPI backend logs to confirm whether the route and method (GET/PUT/PATCH) are enabled.
- **Will repeated imports generate many records?**
    - No. The plugin will search for existing providers based on `base-url` or name:
        - If it exists, only `api-key-entries` will be updated, with deduplication for the same key.
        - If it does not exist, a new provider will be created.

## Usage Recommendations

- It is recommended to verify the import effect on a small number of test accounts before using it in a production environment.
- It can be used in conjunction with All API Hub's **Quick Export** feature to synchronize the same batch of upstream sites to various downstream systems such as New API / CLIProxyAPI.

## Related Documentation

- [Quick Export Site Configuration](./quick-export.md)
- [New API Channel Management](./new-api-channel-management.md)
- [New API Model List Synchronization](./new-api-model-sync.md)