## Why

Users often manage many API relay “sites” in All API Hub, but discovering extra metadata about a given site (status, description, links, etc.) on `https://ldoh.105117.xyz/` currently requires manual searching. Providing a contextual, per-account shortcut reduces friction and helps users quickly verify and learn about the site an account belongs to.

## What Changes

- Add an integration that can load and search the LDOH site list from `https://ldoh.105117.xyz/` (site requires login; integration relies on the user’s existing browser session).
- Cache the LDOH site list (and/or per-account match results) so account list rendering does not trigger repeated network fetches.
- In account list UIs, show a per-account “View on LDOH” button only when the extension can find a matching site entry from the cached LDOH site list; otherwise do not show the button.
- Clicking the button opens a new tab to LDOH with the discovered search query parameter (e.g., `https://ldoh.105117.xyz/?q=<hostname>`) so LDOH filters to the matched site.

## Capabilities

### New Capabilities
- `ldoh-site-lookup`: Load and cache the authenticated LDOH site directory, match accounts to LDOH site entries, and expose a per-account action to open the matched LDOH view.

### Modified Capabilities
- (none)

## Impact

- UI: account list item actions/menus (Popup/Options and any other account list surfaces) will gain a conditional “View on LDOH” action; new i18n strings are required.
- Services/Storage: add persisted cache for LDOH directory data and lookup state; ensure safe failure behavior when the user is not logged in or LDOH is unreachable.
- Security/Privacy: must not leak secrets (API keys/tokens/cookies) to LDOH; only use the account’s site identifier (e.g., origin) for lookup/deeplinks.
