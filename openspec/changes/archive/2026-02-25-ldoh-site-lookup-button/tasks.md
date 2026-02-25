## 1. LDOH Discovery (Playwright)

- [x] 1.1 Use Playwright to log in to `https://ldoh.105117.xyz/` and capture the network request(s) that return the LDOH site list data
- [x] 1.2 Identify the LDOH route + query parameter(s) that pre-filter the site list to a single site (deeplink/search-on-load)
- [x] 1.3 Decide the minimal persisted fields needed for matching + deeplink building (e.g., site URL/hostname + optional display name/id)

## 2. Data Model & Cache

- [x] 2.1 Add TypeScript types for LDOH site list items and the persisted TTL cache payload
- [x] 2.2 Implement URL normalization helpers (origin + hostname extraction) for account URLs and LDOH items
- [x] 2.3 Implement TTL cache read/write helpers using extension local storage + `services/storageWriteLock.ts`
- [x] 2.4 Implement unambiguous matching (exact origin first; hostname fallback only when unique) and an indexed lookup map for fast per-account checks

## 3. LDOH Site List Fetch Integration

- [x] 3.1 Add a background/service entry point to refresh the LDOH site list cache (dedupe concurrent refresh attempts)
- [x] 3.2 Implement same-origin fetch by executing code in an LDOH tab/page context (so the user’s authenticated session is used)
- [x] 3.3 Handle unauthenticated/expired sessions as a safe cache-miss (no button) and avoid retry loops during UI rendering

## 4. Account List Button

- [x] 4.1 Identify the shared account row component(s) used by Popup and Options account lists and the best place to render an extra per-account action button
- [x] 4.2 Add a conditional “View on LDOH” button that renders only when the account is matched to a cached LDOH site entry
- [x] 4.3 Implement click behavior to open a new tab to LDOH with the discovered search parameter prefilled to the matched site
- [x] 4.4 Ensure the open URL uses origin/hostname only (no account paths/queries/fragments; no secrets)

## 5. i18n & UX

- [x] 5.1 Add i18n keys for “View on LDOH” (and any optional error/toast shown only on explicit user actions)
- [x] 5.2 Ensure account list rendering remains non-blocking (buttons appear only after cache exists; no per-row network work)

## 6. Tests

- [x] 6.1 Add unit tests for TTL cache behavior (hit/expire) and URL normalization
- [x] 6.2 Add unit tests for matching behavior (exact origin match, hostname fallback, multiple matches => no match)
- [x] 6.3 Add a component test that verifies the button is shown/hidden correctly based on match availability

## 7. Quality Gates

- [x] 7.1 Run `pnpm -s lint`
- [x] 7.2 Run `pnpm -s format:check`
- [x] 7.3 Run `pnpm -s compile`
- [x] 7.4 Run `pnpm -s test`
