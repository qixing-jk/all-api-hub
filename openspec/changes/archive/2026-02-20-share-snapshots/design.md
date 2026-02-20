## Context

All API Hub currently presents cashflow and balance information inside the extension UI (popup overview + account list). Users who want to share these results externally must take manual screenshots, which is slow, inconsistent across languages, and risky because account objects contain sensitive fields (tokens/cookies) and personal metadata (tags/notes).

This change adds a built-in “share snapshot” export that produces:
- a localized caption, and
- a PNG image in an Apple-like visual style with built-in mesh gradient backgrounds.

Key constraints:
- Privacy: secrets (access tokens, refresh tokens, cookies, Authorization headers, backups/exports) must never be included in exported content.
- UI/UX: default path must be fast and effectively one-click; v1 keeps customization minimal (background randomized per export; no extra UI).
- Compatibility: works in WebExtension popup/options (Chromium MV3 + Firefox MV2) with graceful fallbacks when clipboard features are unavailable.
- Consistency: respect existing toggles/semantics:
  - `showTodayCashflow = false` → do not include numeric today cashflow values (caption omits today line; image shows placeholders).
  - disabled accounts are excluded from aggregates and counts.
  - “counts” means number of enabled accounts (no detailed usage/token stats).
  - “current currency only” (use current currency preference, do not display both).

## Goals / Non-Goals

**Goals:**
- Provide two snapshot views:
  - **Overview snapshot**: aggregate across enabled accounts only; MUST NOT list or reveal specific accounts.
  - **Account snapshot**: for a specific account; may show site name and site URL (origin only).
- Add entry points:
  - popup overview header: top-right on the same row as the accounts/bookmarks switcher.
  - account list: “more” menu item on each account.
- Export pipeline is privacy-safe by construction (allowlist payload), localized, and fast (no network requests).
- Built-in mesh gradient backgrounds or generator (seeded; randomized per export in v1).
- Default behavior copies share content with a download fallback.

**Non-Goals:**
- Balance history visualization or charts (numbers-only v1).
- Detailed usage breakdown (tokens/requests/logs), per-model analytics, or exporting raw tables.
- Uploading to third-party services, generating share links, or any server-side rendering.
- Showing account lists, site names, or URLs in the overview aggregate snapshot.
- Supporting user-entered free text fields (e.g., notes/tags) in share exports.

## Decisions

### 1) Use a strict allowlist `ShareSnapshotPayload` (never pass raw account objects)
**Decision:** Build share outputs from a minimal, typed payload containing only the fields required for rendering/caption generation (strings/numbers/dates), produced by dedicated builder functions.

**Rationale:** Core account/runtime types include secrets (e.g., token/cookie values) and personal metadata. A strict allowlist prevents accidental inclusion during rendering and logging.

**Alternatives considered:**
- Redact a copied account object recursively → rejected as brittle and prone to misses when types evolve.
- Render directly from UI state objects → rejected because UI objects may still contain sensitive fields.

### 2) Enforce origin-only URL display for account snapshots
**Decision:** When an account snapshot includes a URL, show only `new URL(baseUrl).origin`. If parsing fails, omit the URL.

**Rationale:** Prevent leaking paths, query strings, or fragments that may contain identifiers or tokens.

**Alternatives considered:**
- Display full `baseUrl` → rejected due to privacy risk.
- Try to “clean” paths heuristically → rejected (origin is the safest unambiguous rule).

### 3) Aggregation semantics are enabled-only, count-only, and currency-single
**Decision:**
- Overview snapshot aggregates **enabled accounts only** (disabled excluded).
- “Account count” is the number of enabled accounts.
- Do not include detailed usage stats (tokens/requests).
- Only render values in the current `currencyType` preference.
- `showTodayCashflow = false` omits numeric today income/outcome/net values (caption omits today line; image renders placeholders and no net subline).
- “As of” timestamp uses the latest `last_sync_time` among enabled accounts (falls back to export time when unknown).

**Rationale:** Matches user expectations and existing specs (disabled-account exclusion + today cashflow hiding) while keeping the share content minimal and safe.

**Alternatives considered:**
- Include per-site breakdown in overview → rejected (must not reveal specific accounts).
- Show both USD/CNY → rejected (explicit “current currency only” requirement).

### 4) Canvas-based renderer for a lightweight, Apple-like image
**Decision:** Render the share image via a dedicated canvas renderer that draws:
- mesh gradient background (generated),
- a foreground “card” with typography and numbers,
- watermark/app name and an “as of” date.

Outputs a PNG `Blob` suitable for clipboard/download.

**Rationale:** Canvas keeps the implementation dependency-light, avoids DOM-to-image/CSS quirks, and is fast inside extension pages.

**Alternatives considered:**
- DOM-to-image libraries (e.g., `html-to-image`) → rejected due to bundle cost, CSS/CSP brittleness, and inconsistent rendering across browsers.

### 5) Mesh gradient generator is built-in and seedable
**Decision:** Implement a mesh gradient generator that uses a curated palette and a seed to produce consistent backgrounds:
- several large radial gradients with soft blur (or pre-blurred composition),
- optional subtle noise overlay (if performance allows),
- default exports pick a fresh random seed; developer tools can override seeds for deterministic previews/tests.

**Rationale:** Meets “Apple-like” style with small code size and supports customization without shipping many static assets.

**Alternatives considered:**
- Ship a set of static background images → rejected (less customizable; increases package size).

### 6) One-click export with clipboard-first and download fallback
**Decision:** Default action attempts clipboard write first, with graceful fallback:
- Try `navigator.clipboard.write` with a `ClipboardItem` containing `image/png` (and `text/plain` when supported).
- If clipboard image write fails/unsupported, download the PNG (Blob URL) and, if safe, copy caption text via `writeText`.
- Always show user feedback (toast) with clear success/failure; if caption wasn't copied, show a follow-up toast with one-click caption copy.

**Rationale:** Clipboard APIs differ across Chromium/Firefox and may be permission-gated; download is the most universal fallback.

**Alternatives considered:**
- Always open a “share dialog” first → rejected (not one-click by default).
- Use `browser.downloads.download` everywhere → rejected (more permissions/complexity than needed; anchor download works well in extension pages).

### 7) Customization is intentionally minimal in v1
**Decision:** v1 does not ship an end-user customization UI (no “Customize…” flow and no optional personal metadata fields like tags/notes).

- Each export generates a new random mesh gradient `backgroundSeed` by default.
- Captions include the origin-only URL (when available) and are derived only from allowlisted fields.

**Notes:**
- A `redactShareSecrets()` helper exists as defense-in-depth, but v1 does not include any user-controlled free-text fields in exports.
- A developer-only Mesh Gradient Lab exists in options to preview palettes/layouts and overlay typography with controlled seeds.

## Risks / Trade-offs

- [Clipboard image support varies by browser / context] → Provide robust fallback to download + caption copy; surface actionable toasts.
- [Rendering differences across platforms/fonts] → Use system font stack, conservative layout rules, and text truncation/line-clamp.
- [Long localized strings overflow] → Clamp lines, reduce font size within bounds, and prefer numeric-first layouts.
- [Future optional notes/tags may contain secrets] → Keep default OFF and apply best-effort redaction (e.g., `redactShareSecrets()`) if these fields are introduced.
- [No enabled accounts] → Disable share actions and explain why in UI/toast.

## Migration Plan

No storage migration is required if share options are ephemeral.

If we later persist share defaults (e.g., last used background seed), introduce new preference fields with safe defaults and migrate using the existing preferences migration flow.

## Resolved Questions

Resolved in implementation:
- Image size/aspect ratio: `1200×1200` PNG.
- Watermark/app name: always included (localized via `ui:app.name`, fallback to “All API Hub”).
- “As of”: always included (caption uses locale date+time; image uses locale date).
- Disabled accounts: account snapshot export is blocked.
