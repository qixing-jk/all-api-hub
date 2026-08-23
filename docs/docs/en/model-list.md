# Model List and Price Comparison

> See the details of all models across all your relay sites at a glance. Supports cross-site price comparison, automatic selection of the best group, and batch availability verification to help you make the most cost-effective choice.

## Features at a Glance

- 💰 **Real-time Price Comparison**: Automatically calculates the actual unit price of each model at different sites based on billing ratios, group ratios, and exchange rates.
- 🎯 **Best Path Recommendation**: In the "All Accounts" view, the system highlights the lowest price within the current comparison scope. Within one site, it shows a "Best Group" only when one group has a uniquely lowest price.
- 🔍 **Multi-dimensional Deep Filtering**: Supports combined filtering by site source, API credentials, providers (OpenAI, Anthropic, etc.), billing modes, and tags.
- ✅ **Batch Availability Verification**: Supports model connectivity testing, token compatibility checks, and CLI proxy availability verification.
- 📊 **Billing Transparency**: Clearly distinguishes between "Token Billing" and "Per-Call Billing," and shows actual input, output, and cache prices when available.

## How to Access

1. Click the **"Model List"** icon at the bottom left of the extension popup.
2. Or go to **Settings → Model Management**.

## Core Operating Guide

### 1. Select Data Source

In the selector at the top of the page, you can switch between different data sources:

- **All Accounts**: Aggregates all site accounts you've added to enable cross-site comparison.
- **Specific Account**: View the full model catalog of a specific site.
- **API credentials**: View models supported by keys saved in the API Credential Library (no site account required).

### 2. Intelligent Price Comparison

Model cards display detailed billing information for the model:

- **Actual Unit Price**: Token-billed models are converted to **Per 1M Tokens (USD/CNY)**, with separate input, output, and cache prices when available. Per-call models show a **Per Call** price.
- **Group Prices**: Expand the model details to compare available groups and their ratios. Switching groups updates the calculated price.
- **Price Badges**: "Estimated" means the price is calculated from available catalog and group information, so the provider's bill remains authoritative. "Lowest Price" identifies the lowest comparable option within the current filters and billing mode. "Best Group" appears only when one available group is uniquely cheapest; tied groups are not ranked against each other.

### 3. Group Switching and Simulation

If a site supports multiple user groups (e.g., `default`, `vip`, `svip`), you can switch groups in the filter bar to preview real-time price changes for different tiers.

> 💡 **Tip**: The system calculates with the lowest available group price. If multiple groups have the same price, it does not label any one of them as the "Best Group."

### 4. Model Verification

Click the verification icons on the right side of the model card:

- **Verify Model**: Sends a lightweight request to confirm if the model is currently truly available.
- **Verify CLI Compatibility**: Tests if the model supports streaming output and can be normally called by command-line tools.
- **Batch Verification**: Click **"Batch Verify"** in the toolbar to queue tests for all currently filtered models. You can also manually select multiple models via checkboxes to perform verification only on the selected set.

## List Control Options

| Option | Description |
|------|------|
| **Search Box** | Supports fuzzy search by Model ID (e.g., `gpt-4o`) or site name. |
| **Billing Mode** | Filter models by "Token Billing" or "Per-Call Billing." |
| **Provider Filter** | Quickly lock onto models from OpenAI, Anthropic, Google, Meta, and other vendors. |
| **Sort By** | Supports sorting by Name, Price (Low to High), and Account Count. |
| **Display Settings** | Control whether to show CNY prices and endpoint types. |

## FAQ

| Question | Solution |
|------|----------|
| Why do some models show a price of 0? | The site may have set this model to be free, or the site hasn't provided valid billing data, in which case it falls back to the default catalog. |
| How is the exchange rate calculated for cross-site comparison? | The extension has a built-in fixed exchange rate of 1 USD = 7.3 CNY (referencing the New API convention) to provide a uniform comparison baseline. |
| What does "Best Group" mean? | When a model is available in multiple groups (e.g., `default` and `vip`), the badge appears only for a group with a uniquely lowest price. If the lowest price is tied, no group is presented as better than the others. |
| Why does the verification result show "Unknown"? | Please check if your API Key has permission to call the model, or if the site is currently triggering a rate limit. |

## Related Docs

- [API Credential Library](./api-credential-profiles.md): How to save `Base URL + API Key` pairs without accounts.
- [Usage Analytics](./usage-analytics.md): View the actual spending generated by these models.
- [Supported Sites](./supported-sites.md): View the architecture types that support automatic price recognition.
