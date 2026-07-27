# All API Hub Privacy Policy

**Last Updated:** December 30, 2025

## Overview

All API Hub is a browser extension designed to help users manage account information for AI API aggregation services. This Privacy Policy explains how we handle your data and how we limit data processing to the minimum necessary for implementing features, troubleshooting issues, and improving the user experience.

## Data Collection and Storage

### Data Collection

This extension **does not collect or transmit any personal identifiable data or sensitive account data to our servers**. The account data you add and manage is primarily used for local functionality, including account display, balance refresh, key management, model management, usage analysis, automatic sign-in, website announcements, and synchronization, among other capabilities you actively enable or trigger.

Specifically, All API Hub does not collect or transmit the following data to our servers:

*   Does not collect or transmit API Keys, access tokens, Cookies, full URLs, account balances, request content, or response content to any server.
*   Does not collect sensitive account information, personally identifiable information, or browsing history.
*   Does not record browsing history.
*   Does not store any personally identifiable information.

## Anonymous Product Analytics

All API Hub can collect anonymous product analytics via PostHog, which are enabled by default. This type of analytics is used solely to understand which features are being used, which operations are more prone to failure, the general distribution of different site types, and which compatibility issues should be prioritized for maintenance. Its purpose is not to identify users, but to help us focus our repair and development efforts on areas that actually impact user experience.

You can disable anonymous product analytics in "Settings"; doing so will immediately stop subsequent analytics events.

Anonymous product analytics adhere to the principles of minimization and de-identification:

*   Only fixed enumerated values or rough intervals are sent, such as extension version, browser type, interface language, entry page, feature/operation identifiers, success or failure results, error categories, duration intervals, quantity intervals, and fixed enumerated site types.
*   Free text, raw error stacks, page addresses, site domains, account names, token names, user notes, import/export content, request content, response content, Prompts, or model outputs are not sent.
*   Precise balances, quotas, usage, account counts, or durations are not sent; interval values are used only when necessary to determine the scale of a problem.
*   Before being sent, analytics events undergo field whitelisting, enumerated value validation, and sensitive field filtering within the code; fields that are not whitelisted, whose names appear to contain sensitive meanings like URL, Token, Key, Cookie, email, balance, Prompt, response content, or account, or whose values are not controlled enumerations/intervals, are discarded.

In other words, anonymous product analytics do not collect API Keys, access tokens, refresh tokens, Cookies, authorization headers, account names, token names, user IDs, emails, full URLs, domains, sources, paths, query parameters, account balances, quotas, request content, response content, Prompts, model outputs, import/export content, user notes, or raw error stacks.

These restrictions can be reviewed through the open-source code. The relevant filtering logic is located in `src/services/productAnalytics/privacy.ts`, with corresponding tests in `tests/services/productAnalytics/privacy.test.ts`.

### How Data is Stored

Apart from the anonymous product analytics described above, account data and user management data are **stored on your local device by default**, including:

*   The browser's local storage
*   No account data or user management data is transmitted to any external servers operated by us.
*   Account data and user management data are synchronized only if you enable browser sync or this extension's WebDAV sync feature, in which case the data is handled by the corresponding sync mechanism or your configured WebDAV server.

### Optional Cloud Sync Feature

This extension offers an **optional** WebDAV sync feature:

*   You can choose to synchronize your account data to your own WebDAV server.
*   This feature is **off by default**.
*   When enabled, data will only be transmitted to your specified WebDAV server via a secure connection (HTTPS).
*   We cannot access your WebDAV server or related credentials.

## How Data is Used

Any account data accessed or stored by this extension is used solely to enable the functionality you use within the extension, such as managing accounts, refreshing status, executing automated tasks you configure, displaying local analysis results, importing/exporting configurations, or synchronizing to your specified location.

Apart from the anonymous product analytics described above, this data will not be used for purposes such as analytics, advertising, user profiling, or tracking. Anonymous product analytics will also not be used for advertising, cross-site tracking, user profiling, or selling data to third parties.

The primary value of anonymous product analytics to users is helping us prioritize fixing issues that have a significant impact in real-world usage, such as an increased failure rate for a certain type of function, degradation of compatibility with a specific site type, instability in the experience of a particular entry point, or a new version encountering more errors in specific browser environments.

## Third-Party Services

Apart from the PostHog anonymous product analytics mentioned above, this extension **does not integrate any third-party advertising or data collection services**.

This extension will only communicate with the following third-party services **if explicitly configured by you**, including but not limited to:

*   AI API aggregation platforms you add (e.g., one-api, new-api, etc.)
*   Your configured WebDAV server (e.g., if the sync feature is enabled)

All communication with these services is actively triggered by you, or by automated functions you explicitly enable according to their settings, and is solely for the purpose of enabling the corresponding functionality.
We do not receive, monitor, or store any data transmitted to these services.

## Changes to This Privacy Policy

We may update this Privacy Policy from time to time. Any changes will be reflected in the "Last Updated" date.
Your continued use of this extension after a policy update signifies your agreement to the updated Privacy Policy.

## Open Source Information

This extension is open-source software. You can view the source code at:
[https://github.com/qixing-jk/all-api-hub](https://github.com/qixing-jk/all-api-hub)

## Contact Us

If you have any privacy-related questions or concerns, please:

*   Contact us by submitting an Issue in the GitHub repository

---

**Your Privacy Matters**: All API Hub is designed to limit data processing to local and necessary scopes. Apart from the anonymous product analytics described above and any sync features you explicitly enable, account data and user management data remain on your device, and we cannot access your account information or API keys; anonymous product analytics also reduce data risks through whitelisting, intervalization, and sensitive field filtering, and can be disabled by you and reviewed through the open-source code.
