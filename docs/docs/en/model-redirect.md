# Model Redirect

> Automatically generates "Standard Model → Actual Model" mappings for New API channels, allowing you to call unified model names (e.g., `gpt-4o`) in downstream applications, with the system automatically routing to the actual models provided by various upstream relays.

## Feature Overview

- **Unified Model Calling Entry Point**
  - You can consistently use a set of "standard model names" (e.g., `gpt-4o`, `claude-4.5-haiku`) within New API.
  - Model Redirect will map them to the actual available model names for each channel.
- **Automatic Mapping Generation**
  - Automatically calculates the most suitable correspondence based on the `models` list reported by channels and a set of "standard model inventory".
  - Supports incremental merging by channel, preserving parts of your manually configured mappings.
- **Used in Conjunction with Model Sync and Channel Management**
  - Typically used with **New API Model List Sync** and **New API Channel Management**:
    - Model Sync is responsible for pulling the upstream available model list into New API.
    - Model Redirect is responsible for aligning these models to a set of "standard models".

## Prerequisites

- **New API Integration Settings** have been configured in the plugin:
  - Fill in **Admin URL**, **Admin Token**, and **User ID**.
- At least one valid channel exists in New API, and the channel's `models` field contains a list of available models.
- A model sync has been completed (recommended) to ensure the model list within the channel is up-to-date.

## Setup Entry Point

1. Open the plugin → Go to the **Settings** page.
2. Switch to the **"New API"** tab.
3. Find the **"Model Redirect"** area (`id="model-redirect"`) at the bottom of the page.
4. You will see:
   - Enable switch
   - Standard model multi-select list
   - "Regenerate Mappings Now" button

## Main Configuration Items

- **Enable Model Redirect**
  - When enabled, the model redirect algorithm will be invoked when you manually click "Regenerate" or during specific synchronization processes.
- **Standard Model List**
  - Built-in standard models from common vendors, such as:
    - OpenAI series: `gpt-4o`, `gpt-4o-mini`, `o3`, `o3-mini`, etc.
    - Mainstream models from Anthropic / Google / Mistral / DeepSeek / Tongyi Qianwen, etc.
  - You can add or delete as needed, or manually enter custom standard model names.
- **Regenerate Mappings Now**
  - After clicking the button, the plugin will:
    - Fetch all channel lists (filtering out manually/automatically disabled channels).
    - Calculate the "Standard Model → Actual Model" mapping table for each channel.
    - Merge the results with the existing `model_mapping` and write them back (new keys overwrite old values).

## How It Works (Briefly)

1. Read the model redirect configuration from user preferences:
   - If not enabled, return directly and prompt "Feature is disabled".
2. Calculate the standard model set:
   - If you haven't customized it, the full set of built-in standard models will be used.
3. Obtain all channel lists via the New API management interface.
4. For each channel:
   - Parse the channel's `models` field into a list of actual models.
   - Perform multi-stage matching for each standard model:
     - If the channel itself contains a model with the same name, skip (no redirection needed).
     - Otherwise, find the closest candidate actual model based on the unified "model normalization rule" (`renameModel`).
     - Select an unoccupied actual model from the candidate set and write the `standardModel -> actualModel` mapping.
   - Merge the new mapping with the channel's existing `model_mapping` JSON and write it back.
5. Summarize the number of successfully updated channels and reasons for failure, displaying them as a toast in the UI.

## Typical Use Cases

- **Unify OpenAI Compatible Model Names**
  - Different upstream providers might use slightly different model naming conventions (e.g., with prefixes/suffixes).
  - Through model redirect, downstream applications can always use a unified name, such as `gpt-4o`, with New API routing to the actual model according to the mapping.
- **Cooperate with Channel Priority**
  - Set weights/priorities for different channels in New API, and then combine with unified standard model names to achieve multi-upstream disaster recovery and traffic distribution.

## Common Issues

- **New API Configuration Missing Prompt**
  - Please first fill in the Admin URL, Token, and User ID in **"Basic Settings → New API Integration Settings"** and save.
- **Feature Not Enabled Prompt**
  - Confirm that the "Enable Model Redirect" switch is turned on in the "Model Redirect" area.
- **Some Standard Models Not Mapped**
  - This indicates that no matching actual model was found in the corresponding channel, or all candidates have already been occupied by other standard models.
  - You can check if the channel's `models` field is complete, or adjust the standard model list.
- **Will Existing Manual Configurations Be Overwritten?**
  - For the same `standardModel`, newly generated mappings will overwrite old values;
  - Other manually added but not overwritten keys will still be retained in `model_mapping`.

## Usage Recommendations

- It is recommended to first verify the generation results in a test environment or on a small number of channels before performing batch redirection on all channels.
- If you primarily maintain the model list through **New API Model Sync**, it is recommended to click "Regenerate Mappings" after completing the synchronization.

## Related Documentation

- [New API Model List Sync](./new-api-model-sync.md)
- [New API Channel Management](./new-api-channel-management.md)
- [Quick Export Site Configuration](./quick-export.md)