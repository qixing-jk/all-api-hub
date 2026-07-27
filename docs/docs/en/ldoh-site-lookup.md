# LDOH Site Lookup

> Jump to the LDOH site directory from the account list to look up a site.

## Feature Overview

- **Site Navigation**: In the account management list, an LDOH icon appears to the right of each site name. Click it to jump to the LDOH website and search for the corresponding site.
- **Add Account Assistance**: In the add account dialog, you can click the "Open LDOH Site List" entry to help find and confirm site addresses.
- **Background Caching**: The LDOH site directory is automatically refreshed in the background with a cache validity of 12 hours.

## Why This Feature

In the AI relay station ecosystem, many sites are operated by community members. Jumping directly to relevant discussions on LDOH lets you:
- **Check user reviews**: Understand the site's stability, response speed, and after-sales support.
- **Get the latest updates**: Discover if the site has new activities, model adjustments, or address changes.
- **Avoid pitfalls**: If a site has many negative reviews in the community, it serves as a reference for your usage.

## Privacy & Performance

- **Silent matching**: The matching process runs automatically in the background without intrusive popups.
- **Caching**: To save network resources, the matching index is cached locally for 12 hours. The extension only requests an index update when the cache expires or a manual refresh is triggered.
- **No login required**: This feature only uses public URLs for comparison and search redirection; it does not require you to log into a LDOH account.

## Notes

- **Match failed?**: Since community sites are constantly emerging, the index may not cover 100% of all sites. If your site doesn't show a match, it simply means the address has not yet been collected in the current LDOH index.
- **Data source**: This feature is supported by the [LDOH Site Aggregator API](https://ldoh.105117.xyz) maintained by community volunteers.

## How to Use

### Jump from Account List

1. Open **Settings → Account Management**
2. Click the LDOH icon to the right of the site name
3. The browser will automatically open the LDOH website and search for the corresponding site

### Find Sites from the Add Account Entry

1. In **Settings → Account Management**, click **Add Account**
2. Near the site address input field, click **Open LDOH Site List**
3. Find the target site on the LDOH website, record the address, and return to the extension to manually add it

## Data Source

The LDOH site lookup data comes from the LDOH public site directory service (`ldoh.105117.xyz`), cached in the extension's local storage and refreshed automatically.

## Notes

- LDOH site lookup only provides navigation links; it does not automatically add accounts.
- Site directory updates are controlled by the LDOH server; the extension only caches and displays them.
- If the LDOH icon is not shown, it means the current site has no matching record in the LDOH directory.

## Related Documentation

- [Account Management](./get-started.md#add-site)
- [Auto Detect](./auto-detect.md)