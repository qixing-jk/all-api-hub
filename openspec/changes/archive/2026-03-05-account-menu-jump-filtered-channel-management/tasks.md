## 1. Navigation plumbing

- [x] 1.1 Extend `openManagedSiteChannelsPage` navigation helper to accept a `search` query param in addition to `channelId`
- [x] 1.2 Add a new account action handler that navigates to `#managedSiteChannels` with either `channelId` or `search`

## 2. Matching logic

- [x] 2.1 Fetch account API token list on-demand and decide whether key-based matching is possible (single token vs multiple/none)
- [x] 2.2 Use managed-site service helpers to attempt exact match (base URL + models + key), then fall back to base URL filtering with user-facing explanation

## 3. Localization

- [x] 3.1 Add i18n strings for the new menu entry label and fallback toasts in `src/locales/en/account.json` and `src/locales/zh_CN/account.json`

## 4. Tests

- [x] 4.1 Add/adjust `AccountActionButtons` tests to cover navigation behavior for: exact match, key-unavailable fallback, and multi-token fallback
