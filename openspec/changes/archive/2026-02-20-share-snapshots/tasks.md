## 1. Share Payload + Privacy Guardrails

- [x] 1.1 Define allowlisted `ShareSnapshotPayload` types for overview and account snapshots (no raw account/display objects).
- [x] 1.2 Implement origin-only URL sanitizer (`baseUrl` → `origin`) with invalid-URL handling (omit on failure).
- [x] 1.3 Implement secret redaction helper for optional user-controlled text (JWT/Bearer/token-like patterns) and add unit tests. (Defense-in-depth; v1 exports do not include free-text fields.)
- [x] 1.4 Implement snapshot payload builders:
  - [x] 1.4.1 `buildOverviewShareSnapshotPayload()` aggregates enabled accounts only and includes count + totals in current currency.
  - [x] 1.4.2 `buildAccountShareSnapshotPayload()` for a selected enabled account (site name + origin URL optional; tags/notes are not included).
- [x] 1.5 Add unit tests covering: enabled-only aggregation, count semantics, origin-only URL, and “no secrets possible by payload”.

## 2. Rendering (PNG) + Caption Generation

- [x] 2.1 Implement mesh gradient background generator (seedable); default exports pick a fresh random seed per export.
- [x] 2.2 Implement canvas renderer for `1200x1200` PNG:
  - [x] 2.2.1 Numbers-only layout (no charts), Apple-like typography, and stable spacing.
  - [x] 2.2.2 Always include localized All API Hub watermark/label.
  - [x] 2.2.3 Always include “as of” (fallback to export time when unknown).
  - [x] 2.2.4 Respect `showTodayCashflow`: include numeric today cashflow values only when enabled; when disabled, omit the today line and render placeholders (`—`) for image blocks.
- [x] 2.3 Implement localized caption generator for overview and account snapshots (include “as of” always; omit today line when disabled).
- [x] 2.4 Add unit tests for canvas renderer output (overlay placeholder + today-net rendering).

## 3. Export UX (Clipboard + Download Fallback)

- [x] 3.1 Implement export action that attempts clipboard image copy (guard `navigator`/`navigator.clipboard`, then `navigator.clipboard.write` + `ClipboardItem`) and falls back to PNG download when unsupported or when clipboard writes reject (e.g., permission denial / non-secure contexts).
- [x] 3.2 Ensure caption is always surfaced to the user (attempt copy; otherwise show a follow-up toast for one-click caption copy).
- [x] 3.3 Add toast feedback for success/failure (copied, downloaded fallback, disabled/no accounts).
- [x] 3.4 Add integration tests (where feasible) for the export decision logic (clipboard-supported vs fallback path).

## 4. UI Entry Points + Customization Flow

- [x] 4.1 Add popup overview share button (top-right, same row as accounts/bookmarks switcher) and wire to overview snapshot export.
- [x] 4.2 Add account “more” menu item to export account snapshot for that account.
- [x] 4.3 Ensure overview snapshot never lists accounts; ensure account snapshot is blocked for disabled accounts.

## 5. Localization + Documentation

- [x] 5.1 Add i18n keys for share actions, labels, and caption-copy toast in all supported locales.

## 6. Validation

- [x] 6.1 Run targeted unit tests for snapshot builders/redaction/export utilities.
- [x] 6.2 Run `pnpm lint` + `pnpm compile`; run Prettier checks for touched files.
