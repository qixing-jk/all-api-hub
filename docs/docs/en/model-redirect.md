# Model Redirect

> Automatically generates "Standard Model → Actual Model" mappings for New API channels, allowing you to call unified model names (e.g., `gpt-4o`) downstream, with the system automatically routing to the actual models provided by various upstream gateways.

## Feature Overview

- **Unified Model Invocation Entrypoint**
  - You can uniformly use a set of "standard model names" (e.g., `gpt-4o`, `claude-4.5-haiku`) in New API.
  - Model Redirect will map them to the actual available model names for each channel.
- **Automatic Mapping Generation**
  - Automatically calculates the most suitable correspondences based on the `models` list reported by channels and a set of "standard model lists."
  - Supports incremental merging by channel, preserving your manually configured mappings.
- **Use in Conjunction with Model Synchronization and Channel Management**
  - Typically used with **New API Model List Synchronization** and **New API Channel Management**:
    - Model Synchronization is responsible for pulling the upstream available model list into New API.
    - Model Redirect is responsible for aligning these models to a set of "standard models."

## Prerequisites

- **New API Integration Settings** have been configured in the plugin:
  - Fill in **Admin URL**, **Admin Token**, and **User ID**.
- At least one valid channel exists in New API, and the channel's `models` field contains a list of available models.
- A model synchronization has been completed (recommended) to ensure the model list within the channel is up-to-date.

## Accessing Settings

1. Open the plugin → Navigate to the **Settings** page.
2. Switch to the **"New API"** tab.
3. Locate the **"Model Redirect"** area (`id="model-redirect"`) at the bottom of the page.
4. You will see:
   - An enable toggle
   - A multi-select list for standard models
   - A "Regenerate Mappings Now" button

## Key Configuration Items

- **Enable Model Redirect**
  - When enabled, the Model Redirect algorithm will be invoked when you manually click "Regenerate" or during specific synchronization processes.
- **Standard Model List**
  - Built-in standard models from common vendors, for example:
    - OpenAI Series: `gpt-4o`, `gpt-4o-mini`, `o3`, `o3-mini`, etc.
    - Mainstream models from Anthropic / Google / Mistral / DeepSeek / Qwen, etc.
  - You can add or remove as needed, or manually enter custom standard model names.
- **Regenerate Mappings Now**
  - After clicking the button, the plugin will:
    - Fetch all channel lists (filtering out manually/automatically disabled channels).
    - Calculate the "Standard Model → Actual Model" mapping table for each channel.
    - Merge the results with the existing `model_mapping` and write them back (new keys overwrite old values).
- **Clear Model Redirect Mappings (Dangerous Operation)**
  - Clicking this will first open a **Preview/Selection** modal, loading the channel list for the current site:
    - **Select All** channels by default;
    - Supports **Select All / Deselect All** quick actions;
    - Supports individually selecting channels to clear.
  - After clicking "Continue" in the preview modal, a **secondary confirmation** (unreachable by accident) will appear:
    - Upon confirmation, `model_mapping = "{}"` will be written to the selected channels (clearing mappings).
    - **Channels not selected will not be modified**.
    - This operation will clear any custom mappings you may have manually maintained and **cannot be undone**.
  - If **partial failures** occur:
    - The plugin will continue to attempt clearing other channels;
    - The UI will provide a summary of successes/failures and display failure details in the modal for you to retry or handle manually.

## How It Works (Briefly)

1. Read the Model Redirect configuration from user preferences:
   - If not enabled, return directly and prompt "Feature is disabled."
2. Calculate the standard model set:
   - If you haven't customized it, use the built-in complete set of standard models.
3. Obtain all channel lists through the New API management interface.
4. For each channel:
   - Parse the channel's `models` field into a list of actual models.
   - Perform multi-stage matching for each standard model:
     - If the channel itself contains a model with the same name, skip (no redirection needed).
     - Otherwise, find the closest candidate actual model based on the unified "Model Normalization Rule" (`renameModel`).
     - **Version Guard**: Only match models of the same version; do not downgrade/upgrade across versions (e.g., `claude-4.5-sonnet` will not be mapped to `claude-3.5-sonnet`; if no same-version candidate is found, skip this standard model).
     - Select an unused actual model from the candidate set and write the `standardModel -> actualModel` mapping.
   - Merge the new mappings with the channel's existing `model_mapping` JSON and write them back.
5. Summarize the number of successfully updated channels and reasons for failure, displayed as a toast in the UI.

## Typical Use Cases

- **Unifying OpenAI Compatible Model Names**
  - Different upstream providers may use slightly different model naming conventions (e.g., with prefixes/suffixes).
  - Through Model Redirect, you can consistently use unified names in downstream applications, such as `gpt-4o`, with New API routing to the actual model based on the mapping.
- **Coordinating with Channel Priority**
  - Set weights/priorities for different channels in New API, and then combine with unified standard model names to achieve multi-upstream disaster recovery and traffic distribution.

## Frequently Asked Questions

- **Prompting for Missing New API Configuration**
  - Please first fill in the Admin URL, Token, and User ID in **"Basic Settings → New API Integration Settings"** and save.
- **Prompting that the Feature is Not Enabled**
  - Confirm that the "Enable Model Redirect" toggle has been turned on in the "Model Redirect" area.
- **Some Standard Models Did Not Generate Mappings**
  - This indicates that no matching actual model was found in the corresponding channel, or all candidates were already occupied by other standard models.
  - It's also possible that the channel has no **same-version** candidate models: the plugin will not generate mappings by downgrading/upgrading across versions.
  - You can check if the channel's `models` field is complete, or adjust the standard model list.
- **Will Existing Manual Configurations Be Overwritten?**
  - For the same `standardModel`, newly generated mappings will overwrite old values;
  - Other keys added manually but not overwritten will remain in `model_mapping`.

## Usage Recommendations

- It is recommended to first validate the generation results on a test environment or a small number of channels before performing batch redirection on all channels.
- If you primarily maintain your model list through **New API Model Synchronization**, it is recommended to click "Regenerate Mappings" after completing the synchronization.

## Related Documentation

- [New API Model List Synchronization](./new-api-model-sync.md)
- [New API Channel Management](./new-api-channel-management.md)
- [Quick Export Site Configuration](./quick-export.md)