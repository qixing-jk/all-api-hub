## Why

Users want a fast, one-click way to share a clean “cashflow snapshot” (numbers-only, no charts) from All API Hub as an image + caption for social platforms. Today they must screenshot manually, which is slow, hard to localize, and risks leaking secrets (access tokens/cookies) or unwanted personal metadata (tags/notes).

## What Changes

- Add a popup overview share action (top-right, on the same row as the accounts/bookmarks switcher) to export an **aggregate** snapshot across **enabled accounts only**, without listing or revealing specific accounts.
- Add an account-level share action in each account’s “more” menu to export a snapshot for that specific account.
- Generate a localized caption and a share image (PNG, `1200×1200`) using built-in Apple-like mesh gradient backgrounds (randomized per export via a seed).
- Enforce strict privacy rules for exported content:
  - Allow public information (site name and site URL **origin only**).
  - Exclude personal information (e.g., tags/notes) from share exports.
  - Prohibit secrets (access tokens, refresh tokens, cookies, Authorization headers, backup/export blobs, etc.) from ever being included.
- Respect existing behaviors/settings:
  - When `showTodayCashflow = false`, do not include numeric today cashflow values (caption omits today line; image renders placeholders).
  - Exclude disabled accounts from aggregates and counts.
- Provide one-click “Copy share image + caption” with a download fallback if clipboard image copy is unsupported.

## Capabilities

### New Capabilities

- `share-snapshots`: Create privacy-safe, localized share images + captions for (1) an aggregate overview across enabled accounts and (2) a selected account, with Apple-like mesh gradient styling and one-click export.

### Modified Capabilities

<!-- None. -->

## Impact

- UI: popup overview header layout and account action menus gain share/export entry points.
- Services: introduce a share-snapshot export pipeline (allowlisted payload builder, origin URL sanitization, redaction/guardrails, image rendering, caption generation).
- Platform APIs: clipboard and download behaviors may vary by browser (Chromium MV3 vs Firefox MV2) and need graceful fallback.
- i18n: new localized strings for share labels and caption templates across supported languages.
- Tests: add coverage for “no secrets in payload”, origin-only URL formatting, enabled-only aggregation/counting, and `showTodayCashflow`-driven omission.
