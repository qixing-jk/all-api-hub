# LDOH Site Lookup

> LDOH Site Lookup is an enhancement tool based on [Linux.do](https://linux.do) community data. It automatically matches your added site addresses with corresponding discussion, promotion, or instruction posts in the community, helping you gain deeper insights into the background, reputation, and feedback of a site.

## Why This Feature?

In the AI relay station ecosystem, many sites are operated by community members. By jumping directly to relevant discussions on Linux.do, you can:
- **Check User Reviews**: Understand the stability, response speed, and after-sales support of the site.
- **Get Latest Updates**: Discover if the site has new activities, model adjustments, or address changes.
- **Avoid Pitfalls**: If a site has many negative reviews in the community, it serves as a reference for your usage.

## How it Works

1. **Auto Matching**: When you add a site or view details of an existing one, the extension automatically compares the site's `Base URL` with the [LDOH Site Index](https://ldoh.105117.xyz) maintained in the backend.
2. **Display Indicator**: If a match is found, you will see a link or jump icon in the site info section of **`Account Management`**.
3. **One-Click Access**: Click the indicator, and the extension will generate a Linux.do search link to take you directly to relevant community discussions.

## Privacy & Performance

- **Silent Matching**: The matching process runs automatically in the background without intrusive popups.
- **Caching Mechanism**: To save network resources, the matching index is cached locally for 12 hours. The extension only requests an index update when the cache expires or a manual refresh is triggered.
- **No Login Required**: This feature only uses public URLs for comparison and search redirection; it does not require you to log into a Linux.do account.

## Notes

- **Match Failed?**: Since community sites are constantly emerging, the index may not cover 100% of all sites. If your site doesn't show a match, it simply means the address has not yet been collected in the current LDOH index.
- **Data Source**: This feature is supported by the [LDOH Site Aggregator API](https://ldoh.105117.xyz) maintained by community volunteers.

## Related Documentation

- [Supported Sites](./supported-sites.md)
- [Account Management](./README.md)