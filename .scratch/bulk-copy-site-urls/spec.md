# Account bulk mode: copy site addresses + clearer select-all copy

Status: implemented

## Request (user, 2026-09-28)

> 账号的批量模式下，支持复制站点地址，同时现在的全选文案，选择当前结果不够用户友好，让人看不太懂

Two changes in the options-page account bulk toolbar:

1. Add a bulk action that copies the site addresses of the selected accounts.
2. Replace the `选择当前结果` / `Clear visible selection` wording with copy users can parse without guessing the scope.

## Decisions

- **Where the action lives**: a fourth button in the existing action group, next to `复制邀请链接`, instead of a dropdown on the copy button. Both copies stay one click, and the group already wraps and draws its own separator at narrow widths.
- **Scope: every selected account, disabled included.** The invite-link copy follows `enabledCount` because disabled accounts are not fetched; a stored address costs nothing, so the new button follows `selectedCount` and copies disabled accounts too. Deleting behaves the same way, and the button's scope is asserted in both the component test and the workflow test.
- **Payload**: raw addresses, one per line, in list order, blank addresses dropped. No labels (a URL identifies its own site) and no dedupe (N selected → N lines, matching the review modal).
- **Order**: both bulk copies follow the rendered rows through `orderAccountsByDisplayOrder`, not the storage order of the selection. `selectedAccounts` comes from `displayData` (storage order), so a sorted or grouped list used to paste back in a different order than the user saw. Selections hidden by search/filters have no row to follow and stay last in their incoming order.
- **Clipboard failure**: a toast that points at the account list (`请手动复制账号列表中的站点地址。`) rather than the invite-link manual-copy dialog. Invite links need that dialog because the payload was generated and appears nowhere else; addresses are already on screen and one click away from a retry.
- **Analytics**: new `copy_selected_account_site_urls` action (same shape/insights as `copy_selected_account_invite_links`) so adoption of a new toolbar button is observable.
- **Rewording**: `全选当前列表` / `取消选中当前列表` (`Select all in this list` / `Deselect all in this list`). `当前结果` never said whose results; `当前列表` names the thing on screen, which is exactly the scope the action has (search + filters applied). Same length as before, so the toolbar's compact-selection breakpoint is unchanged.
- **Icons**: the selection-scope buttons had none while every action button had one, and the two copy buttons used the generic `Copy`/`Link` glyphs. Added `CheckCheck` / `SquareX` / `Eraser` for scope and clearing, and swapped in `UserPlus` (invite links) / `Globe2` (site addresses). Every toolbar icon keeps the existing `hidden [@container(min-width:24rem)]:block` rule, so narrow layouts stay text-only and the wrap points did not move.

## Touched surfaces

- `src/features/AccountManagement/siteUrlCopyWorkflow.ts` (new): payload + clipboard write, returns `Success` / `ClipboardFailure` / `NoCopyableUrls`.
- `AccountBulkToolbar.tsx`: new `onCopySiteUrls` prop + button.
- `AccountList/index.tsx`: `handleBulkCopySiteUrls` (analytics, toasts, `isBulkCopyingSiteUrls` busy tracking and re-entry guard).
- `src/locales/*/account.json` (8 locales): `bulk.copySiteUrls`, `bulk.copySiteUrlsSuccess(_one/_many/_other)`, `bulk.copySiteUrlsClipboardFailed`, `bulk.copySiteUrlsNone`, plus the reworded `bulk.selectVisible` / `bulk.clearVisible`.
- `docs/docs/account-management.md` + `en/` + `ja/`: bulk action list.
- `e2e/accountToolbarLayout.spec.ts`: renamed selectors, plus a `Copy site URLs` / `复制站点地址` visibility assertion at 320/480/960/1280 in both themes.

## Validation

- `tests/features/AccountManagement/siteUrlCopyWorkflow.test.ts` (new, 5 cases), `AccountBulkToolbar.test.tsx`, `AccountList.test.tsx` (order, disabled accounts, blank addresses, blocked clipboard, analytics payloads).
- `npx vitest run tests/features/AccountManagement tests/entrypoints/options/AccountAndBookmarkPages.test.tsx` → 88 files / 1250 tests pass; `tests/services/productAnalytics` 320 pass.
- `i18n:extract:ci` clean, `i18n:status` 100% for every locale, `tsc --noEmit`, eslint, prettier clean.
- `npx playwright test e2e/accountToolbarLayout.spec.ts -g "keeps bulk selection review and actions usable"` → passes; screenshots confirm one row at 1280 in zh-CN, no horizontal overflow at 320px, and the English toolbar wrapping onto a second action row exactly as it already did with three buttons.

## Notes for review

- The English toolbar wraps the action group onto its own row at 1280 (visible separator). Measuring the 1280px screenshot, the selection group plus the three-button action row already exceeded the content column, so the third button did not introduce the wrap; the fourth keeps the same shape.
- A test-harness trap worth remembering: `userEvent.setup()` installs its own `navigator.clipboard` stub, so a mock defined in `beforeEach` loses to it. Define the clipboard mock *after* `userEvent.setup()` (the existing invite-link tests do this).
