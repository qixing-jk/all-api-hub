# Model List and Price Comparison

> Bring together model, price, and availability information from your accounts and API credentials, then compare options for the way you plan to use them.

## Features at a Glance

- 💰 **Cross-account Price Comparison**: Compare the same model across accounts and API credentials using a consistent price basis.
- 🎯 **Usage-aware Estimates**: Choose a workload such as general chat, code completion, or coding agents, or set your own input, output, and cache usage mix.
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

### 2. Compare Prices

For a cross-account comparison, click **"Compare Prices"**. The page switches to all accounts and puts the lower-priced offers for each model first.

- **Set the comparison conditions**: Choose the closest workload, or adjust the input, output, cache-read, and cache-write shares yourself.
- **Review comparable offers**: Only offers with the same billing mode and all price data required by the current conditions are ranked together. Other offers remain under **"Not compared under current conditions"**, where you can see which price item is unavailable.
- **Check the price breakdown**: Token-billed models show input, output, and cache prices per 1 million tokens. Per-call models show a price per request. Expand a model to review prices for each group.

Use the price badges as follows:

- **Estimated**: Calculated from the available price table and group information. Use it to shortlist options; the provider's bill remains authoritative.
- **Lowest Price**: The lowest comparable offer under the current filters and comparison conditions.
- **Best Group**: Shown when one available group has the unique lowest price among comparable groups. If the lowest price is tied, no single group is selected as best.

### 3. Group Switching and Simulation

If a site supports multiple user groups (for example, `default`, `vip`, or `svip`), use the group filter to choose which groups participate in the comparison, then expand a model to review each group's price.

> 💡 **Tip**: Groups directly affect the calculated unit price. Before using an offer, confirm that your account can access the corresponding group.

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
| **Sort By** | Use the default order, cheapest offer per model, price ascending or descending, or verification latency. |
| **Price Comparison** | When using a price sort, choose a workload or customize the input, output, and cache shares. |
| **Display Settings** | Control whether to show CNY prices and endpoint types. |

## FAQ

| Question | Solution |
|------|----------|
| Why is a model priced at 0 or excluded from the comparison? | A model may be free when the site explicitly reports a zero price. If required price data is missing, the page marks the offer as not comparable instead of treating it as free. |
| How is the exchange rate calculated for cross-site comparison? | The extension has a built-in fixed exchange rate of 1 USD = 7.3 CNY (referencing the New API convention) to provide a uniform comparison baseline. |
| Why is an offer shown as "Not compared under current conditions"? | Its source does not provide a price item required by the current usage mix, such as cache-read pricing. Try another workload, adjust the shares, or expand the offer to review the available prices. |
| Why does the verification result show "Unknown"? | Please check if your API Key has permission to call the model, or if the site is currently triggering a rate limit. |

## Related Docs

- [API Credential Library](./api-credential-profiles.md): How to save `Base URL + API Key` pairs without accounts.
- [Usage Analytics](./usage-analytics.md): View the actual spending generated by these models.
- [Supported Sites](./supported-sites.md): View the architecture types that support automatic price recognition.
