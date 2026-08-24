# Model List and Price Comparison

> Model List reads, filters, compares, and verifies the model catalog provided by the current data source. It brings together model, price, and availability information from accounts and API credentials and helps you choose a model and source based on currently loaded, comparable data and your actual use case.

## Features at a Glance

- 🔍 **Three data sources**: All Accounts, a specific account, or an API Credential Profile.
- 💰 **Cross-account price comparison**: Compare currently available quotes for the same model across accounts using a consistent basis.
- 🎯 **Usage-based estimates**: Select a scenario such as regular chat, code completion, or coding agent, or adjust input, output, and cache proportions yourself.
- 🏷️ **Search, filter, and sort**: Search names and descriptions; filter by vendor, billing method, capability, group, or verification result; and sort by price, latency, and other fields.
- ✅ **Model verification**: Single and bulk verification are one-time probes that check whether a model or endpoint currently works and whether it is CLI-compatible.
- 📦 **Keys for a model**: Select a compatible key or, when supported, create a Token restricted to that model.

## How to Access

1. Click the **`Model List`** icon in the extension popup.
2. In the full-page view, open **`Model List`** under **Interfaces** in the sidebar.
3. In Account Management or the API Credential Library, click **`Open in Model List`** to open the corresponding source directly.

## Core Operations

### 1. Select a Data Source

Use the **`Select Data Source`** dropdown at the top of the page:

- **All Accounts**: Aggregate every added site account for cross-site comparison.
- **Specific Account**: View the model catalog for one account.
- **API Credential**: Read a catalog using a `Base URL + API Key` saved in the API Credential Library, without creating a site account.

> "Provider catalog / personalized catalog" describes an internal data scope for some accounts. It is not a separate top-level data source.

Available information differs by source:

| Data source | Price / multiplier / group | Description |
|------|------|------|
| All Accounts | Depends on each account | Used for aggregate comparison |
| Specific Account | Depends on its adapter | Some sources provide prices, multipliers, and groups; others provide only a model catalog |
| API Credential | Usually unavailable | Primarily for model discovery and verification |

### 2. Search, Filter, and Sort

- **Search**: Matches model ID, display name, and description; it does not search site names.
- **Vendor tabs**: Group models by the parsed vendor, including Uncategorized.
- **Billing method**: All / Token-based / Per-call.
- **Model capabilities**: Image, audio, video, PDF, reasoning, tool calling, structured output, and more, when the source supplies capability information.
- **Group filter**: Filter by account group. In All Accounts, select participating groups separately for each account.
- **Test result**: Success / Failed / Untested.
- **Sort order**: Default, price low to high, price high to low, or test latency low to high. All Accounts also offers Lowest Price for Same Model First.
- **Price comparison conditions**: Under price sorting, select a use case or adjust input, output, cache-read, and cache-write proportions.
- **Display content**: Actual recharge amount and endpoint type.

> Filters and sorting controls appear only when the current source supports them. Do not assume every source has every control.

### 3. Compare Prices

Click **`One-click Price Comparison`** to clear current filters, switch to All Accounts, and sort by the lowest price for the same model.

- **Set comparison conditions**: Select a scenario close to your use case or adjust input, output, cache-read, and cache-write proportions.
- **Review comparable quotes**: Only quotes with the same billing method and all price data required by the current conditions participate in ranking. Other quotes remain under **`Not Included in Current Comparison`** so you can see what data is missing.
- **Review price details**: Token-based models show input, output, and cache prices per one million Tokens. Per-call models show a per-request price. Expand a model to view group prices.

Price labels mean:

- **Estimated Price**: Calculated from available price and group information for filtering. The provider's bill remains authoritative.
- **Lowest Price**: The lowest comparable quote under the current filters and conditions.
- **Best Group**: Shown only when exactly one comparable group has the lowest price. No group is selected when the lowest price is tied.

> - Price comparison is a **local calculation** covering only currently loaded data with valid, comparable prices. It is not an official promise, a complete real-time market, or a "lowest price on the internet" claim.
> - Missing or invalid prices are **not comparable** and are never treated as `0` or a default value. When a site explicitly reports a zero price, the model may genuinely be free.
> - Price sources can differ, such as site pricing endpoints, official catalogs, and estimates. The page displays source and precision where possible.

### 4. Switch Groups and Find the Best Group

When a source supports multiple user groups, use the group filter to limit participating groups and expand a model to view group prices. Groups directly affect the actual unit price; confirm that the account can use a group before relying on its quote.

**"Best Group" is a local result under the current filters and comparison conditions**, not an official provider recommendation or long-term guarantee.

### 5. Verify One Model

Click the verification icon on a model card:

- **Verify API**: Send one probe to check whether the model or endpoint currently works and whether its response matches expectations.
- **Verify CLI Compatibility**: Evaluate whether the model is suitable for CLI tools, such as support for streaming and text generation.

> - Verification is a **one-time probe**. It does not guarantee long-term availability or permanent failure.
> - CLI compatibility verification **does not launch a real external CLI**. It performs a protocol-level simulation only.

### 6. Bulk Test

Click **`Bulk Test`** in the toolbar to open **`Bulk Test Models`**:

1. Select a **`Test Item`**, either automatically by endpoint type or explicitly, such as text generation, tool calling, or structured output.
2. Under **`Models to Run`**, select or select all models to test.
3. Click **`Start Bulk Test`**. Tests run in a queue with at most five concurrent tasks. You can **`Stop Testing`** at any time and keep partial results already produced.
4. The dialog shows totals for passed, failed, and skipped tests.

> Inapplicable test items are skipped automatically. Results reflect that probe only and are for reference.

### 7. Keys for a Model

Click the key button on a model card to open **`Keys for Model`**:

- Select a compatible key. Only keys whose group or capabilities match are listed.
- When supported, **`Quick Create`** a new Token restricted to this model or use **`Custom Create`**.

> This changes a key or Token. It does not edit the model catalog itself.

### 8. Refresh Data

Click **`Refresh Data`** to request the current source again and invalidate related local caches. Refresh behavior differs by source; refreshed data is determined by the source response.

## List Controls

| Setting | Description |
|------|------|
| **Data Source** | All Accounts / Specific Account / API Credential |
| **Search** | Fuzzy search by model ID, display name, or description |
| **Vendor Tabs** | View models by vendor |
| **Billing Method** | All / Token-based / Per-call |
| **Model Capabilities** | Image, audio, video, PDF, reasoning, tool calling, and more, when supplied by the source |
| **Group Filter** | Filter by account group |
| **Test Result** | Success / Failed / Untested |
| **Sort Order** | Default, price ascending or descending, test latency, lowest price for same model first |
| **Comparison Conditions** | Use case or input, output, cache-read, and cache-write proportions |
| **Display Content** | Actual recharge amount, endpoint type |

## Boundaries

- Model List **does not create, edit, delete, enable, disable, or bulk-sync remote models**.
- Model synchronization for self-hosted sites is a separate feature. See [Managed Site Model Sync](./managed-site-model-sync.md).

## FAQ

| Question | Answer |
|------|------|
| Why is a model price 0, or why can't it participate in comparison? | A model may genuinely be free when the site explicitly reports a zero price. Incomplete price data is marked not comparable and is not treated as free. |
| How is cross-site price comparison calculated? | It is a local calculation over currently loaded data with valid, comparable prices. Use the source and precision shown on the page; actual charges follow each site's published prices. |
| Why does a quote show "Not Included in Current Comparison"? | A price required by the current conditions, such as cache-read price, is missing. Choose another scenario, adjust the proportions, or expand the quote to see available prices. |
| Why does verification show failed or unknown? | Verification is one probe and can be affected by permissions, model restrictions, rate limits, and other conditions. Use the target tool's actual behavior as the final reference. |
| Why does my account have no price or multiplier? | The source may not provide price, multiplier, or group data. For example, API Credentials generally support model discovery and verification only. |

## Related Documentation

- [API Credential Library](./api-credential-profiles.md)
- [Key Management](./key-management.md)
- [Managed Site Model Sync](./managed-site-model-sync.md)
- [Supported Sites](./supported-sites.md)
- [Usage Analytics](./usage-analytics.md)
