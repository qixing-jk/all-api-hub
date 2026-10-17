# All API Hub Privacy Policy

**Last updated:** October 17, 2026

[简体中文](https://all-api-hub.qixing1217.top/privacy.html) | [English](https://all-api-hub.qixing1217.top/en/privacy.html) | [日本語](https://all-api-hub.qixing1217.top/ja/privacy.html)

## Scope and developer

This policy covers the All API Hub browser extension and its uninstall feedback page. All API Hub is maintained by the [qixing-jk/all-api-hub open-source project](https://github.com/qixing-jk/all-api-hub). “We” means the project developers. API platforms, sync services and other third-party services you configure are operated by their respective providers.

**The extension accesses, uses and stores user data needed for its features, including sensitive authentication information. Local storage does not mean that no data is processed.** Account credentials are not uploaded to us as product analytics. However, account operations require the extension to send authentication information to the corresponding service. Product analytics, enabled by default, and feedback you submit are sent to PostHog for developer analysis, as described below.

## Data collection and use

| Category | Source and data | Purpose |
| --- | --- | --- |
| Account and authentication information | Service addresses, account names, user IDs, email addresses (when returned by a site), API keys, access/refresh tokens, login sessions and cookies that you enter, import or authorize the extension to read from a site; login details entered in applicable login flows | Identify and sign in to accounts, retrieve account status, manage keys and perform configured site operations |
| Account status and service data | Balances, quotas, models, prices, usage/request logs, check-in status and announcements returned by the corresponding platform | Account displays, balance history, usage analysis, model pricing comparisons, check-ins and announcements |
| Content and settings | Bookmarks, notes, tags, ordering, preferences, imported files, managed-site configuration, and sync/notification addresses and credentials | Configuration, import/export, site administration, automated tasks, backup, sync and notifications |
| Feature-related web and input content | Page addresses, relevant page content, selected content, clipboard data or verification input accessed according to permissions and actions in account setup, cookie import, web API credential detection, redemption assistance or API verification | Extract site/credential details, redeem codes or send verification requests to a selected API; not continuously record all visited pages to build a browsing history |
| Product analytics and feedback | Feature events, an installation analytics identifier, technical context, and uninstall reasons/comments you submit, as detailed below | Measure feature reliability, investigate compatibility issues and understand feedback |

Processing depends on the features you use, permissions you grant and settings for automatic refresh, check-ins, sync and notifications. Enabled background tasks can run while the extension interface is closed. API verification sends request content to your selected API service, which may also process it through its upstream model providers.

## Product analytics and uninstall feedback

### Product analytics

Product analytics is **enabled by default** in distributed builds configured with the analytics service. **PostHog** receives and stores events, which developers can view and analyze in the project. You can turn off the option called “anonymous product analytics” in Settings to stop subsequent product analytics events.

- The extension generates and locally stores a random installation analytics ID and sends it with events to link activity from the same installation. It is not your API platform user ID and does not require your name or email. However, it is a persistent, linkable identifier: **“anonymous” does not mean that events cannot be associated with the same installation**. Disabling analytics does not automatically delete this local ID or previously sent data.
- Business event fields are allowlisted. They include extension version, distribution channel, browser family, interface language, extension entry point, feature/action identifiers, outcomes, error categories, site types, and duration/count/scale ranges. They are used only to maintain, secure and measure the performance and reliability of the extension's disclosed features.
- Business events do not include account API keys, access/refresh tokens, cookies, authorization headers, account names, platform user IDs, email addresses, configured site addresses, notes, import/export content, raw error stacks or API request/response bodies. Exact balances, quotas and usage are not sent.
- In addition to business fields, the analytics SDK can attach technical context such as event time, browser, operating system, device/screen and extension-page information. The analytics service may also process and store IP addresses, HTTP request metadata and approximate location derived from IP addresses. Business field filtering does not mean that this network information is never processed.
- Automatic page-view events, automatic interaction capture and session recording are disabled. Product analytics is not used to record your complete browsing history on other websites.

### Uninstall feedback

On uninstall, your browser may open our [uninstall feedback page](https://all-api-hub.qixing1217.top/uninstall.html). Its URL contains the extension version, days since installation and language. Only while analytics is enabled does it include the installation analytics ID and send a page-open event linking the uninstall to earlier usage. With analytics disabled, that ID is omitted and no page-open event is sent; loading the page still makes a network request to its hosting service.

After you choose a reason and submit, the selected reason, any comment you enter (up to 500 characters), and the version and related context described above are sent to the same PostHog project for developers to view. **Submitting feedback sends these details even if product analytics is disabled**, without linking to the earlier installation analytics ID. Do not include passwords, API keys or other sensitive information in comments.

## Data storage and security

- **Local data:** Accounts, credentials, preferences and history are stored by default in extension-local storage or local databases in your current browser profile. Browser storage isolation does not mean that the extension additionally encrypts all local data. People with access to your device or browser profile may be able to read it.
- **Local exports:** You control exported JSON files, copied configuration and share snapshots. Backups and configuration may contain credentials; review their contents before sharing and store them securely.
- **WebDAV (optional):** Selected backup data is sent to your configured server, authenticated with your supplied username/password. Backups may contain account credentials. WebDAV backup encryption depends on whether you enable the relevant setting. Use HTTPS; encrypted transport cannot be promised for HTTP addresses you configure.
- **GitHub Secret Gist (optional):** The extension calls GitHub's API with your supplied GitHub token. Backups are encrypted locally with your password using AES-256-GCM before upload. GitHub receives the authentication token and encrypted backup. The Gist token, Gist ID and encryption password are excluded from manual JSON exports. A Secret Gist is unlisted, which does not mean only you can access its link. See [cloud sync](./webdav-sync.md).
- **Analytics and feedback:** Stored in the configured PostHog project, serviced by PostHog and accessible to developers. Processing is also subject to [PostHog's privacy policy](https://posthog.com/privacy) and applicable service terms.

We do not operate an account-management server that centrally stores your account credentials. Protect your device, backups, sync passwords and third-party accounts. No storage or transmission method guarantees absolute security.

## Data sharing and recipients

We do not sell or rent user data or use it for personalized advertising or cross-site advertising tracking. Data is transferred to the following recipients for the features and processing described in this policy:

| Recipient | When and what is transferred |
| --- | --- |
| API platforms, managed sites and their related authentication/upstream services that you add or select | Authentication information, operation parameters and verification content needed for account requests, login, refresh, check-ins, key/model management, managed-site imports or API verification; the extension also reads the results |
| Your configured WebDAV provider; GitHub when you select Gist | Service authentication information and backup content when you back up or enable automatic sync; encryption is described above |
| Export tools or applications you select | Selected service addresses, keys and configuration when you export, copy or open an application integration, such as Cherry Studio or CC Switch; your action determines the destination |
| Notification services you enable | Telegram, DingTalk, Feishu, WeCom, ntfy or custom webhooks receive the relevant authentication/routing information and task notification titles/bodies, which may include task results and site/account-related details; browser notifications are handled by your local browser |
| PostHog and project developers | The product events described above while analytics is enabled, and uninstall feedback when you submit it |
| GitHub, LDOH (ldoh.105117.xyz) and external websites you open | Ordinary network request information when retrieving updates, project announcements or public site indexes; LDOH index matching takes place locally, and clicking a site lookup link passes the site hostname to the destination page as a search term |
| GitHub Pages hosting for documentation and the uninstall page, and CDN services through which page requests pass | IP addresses, requested URLs (including query parameters), browser request headers and other ordinary network information when you visit, to deliver pages and operate the service |

Third-party services may process data outside your country or region. Their retention, security and deletion rules depend on their policies and your configuration. When you send support requests or post public GitHub issues, developers and the relevant platform also receive the information you provide. Public issues are visible to others.

## Retention, deletion and your choices

- **Accounts and settings:** Kept locally until you edit/delete entries or clear extension data. Balance and usage history are cleaned up according to their feature-specific retention settings. Deleting a local account does not close the corresponding platform account or automatically revoke issued API keys.
- **Uninstalling:** Browsers normally remove extension-local data on uninstall. Separate exported files, clipboard contents, other devices, remote backups and data held by third-party services are not automatically deleted.
- **Remote copies:** Disabling automatic sync stops subsequent scheduled syncs but does not delete existing WebDAV/Gist backups. Delete backups and their revision history in the corresponding service and revoke tokens where appropriate. Check other synced devices to prevent re-upload.
- **Analytics and feedback:** Disabling analytics or uninstalling does not delete events already sent. The extension has no automatic remote-event expiry or one-click remote deletion feature. Sent events and feedback remain in the PostHog project until deleted there or removed by applicable service retention settings; they do not expire automatically because you disable analytics or uninstall. You can request access to or deletion of records we can locate through the contact channels below. Records without a linkable identifier may not be attributable to an individual.
- **Permissions and background tasks:** Revoke optional permissions in your browser, turn off automatic refresh, check-ins, sync or notifications in the extension, or stop using and uninstall the extension.

To request access, correction or deletion of analytics or feedback data accessible to us, first contact a maintainer with the type of request. Do not post credentials publicly. We may ask for information needed to locate the relevant records.

## Chrome Web Store User Data Policy

All API Hub's use and transfer of user data obtained through browser APIs complies with the Chrome Web Store User Data Policy, including its Limited Use requirements. Such data is used only to provide or improve the disclosed single purpose and user-facing features. It is not used for personalized advertising, sold to data brokers or used for creditworthiness or lending decisions. Human access to such data is not permitted except in policy-allowed circumstances, such as explicit user consent, necessary security investigations, legal requirements, or internal operations using aggregated and de-identified data.

## Policy updates and contact

We will update this page and its “Last updated” date when the policy changes. Changes requiring additional disclosure or consent will be addressed in the product as applicable. Updating this policy does not replace any required authorization.

For privacy questions or data requests, contact the [GitHub project maintainer](https://github.com/qixing-jk) or [project issues](https://github.com/qixing-jk/all-api-hub/issues). Issues are public: do not attach API keys, passwords, full backups or sensitive personal information. If your request needs private handling, first ask the maintainer for an available private communication channel.
