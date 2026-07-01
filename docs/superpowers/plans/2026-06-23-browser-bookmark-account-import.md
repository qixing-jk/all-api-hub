# Browser Bookmark Account Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users import account sites from browser-native bookmarks through the existing Account Management detection and save flow.

**Architecture:** Add `bookmarks` as an optional permission, wrap the WebExtension bookmarks API at the browser boundary, classify bookmark URLs into reviewable import candidates, and run selected imports sequentially through `autoDetectAccount(...)` and `validateAndSaveAccount(...)`. Keep the dialog as Account Management UI state; do not add background jobs or a new account persistence format.

**Tech Stack:** TypeScript, React, WXT, WebExtension `bookmarks` optional permission, existing shadcn-style UI primitives, i18next locale JSON, Vitest, React Testing Library.

---

## File Structure

- Modify `wxt.config.ts`
  - Add `bookmarks` to manifest `optional_permissions` for Chromium and Firefox builds, never to required permissions.
- Modify `src/services/permissions/permissionManager.ts`
  - Add `OPTIONAL_PERMISSION_IDS.Bookmarks`.
- Create `src/services/permissions/permissionDisplay.ts`
  - Centralize optional-permission title and description lookup so Permission Settings and onboarding stay exhaustive.
- Modify `src/features/BasicSettings/components/tabs/Permissions/PermissionSettings.tsx`
  - Use `permissionDisplay.ts` instead of local switch statements.
- Modify `src/features/OptionsOverview/components/dialogs/PermissionOnboardingDialog.tsx`
  - Use `permissionDisplay.ts` instead of local switch statements.
- Modify `src/features/BasicSettings/components/tabs/Permissions/Permissions.search.ts`
  - Add a searchable permissions control for `bookmarks`.
- Modify `src/services/productAnalytics/events.ts`
  - Add `PRODUCT_ANALYTICS_PERMISSION_IDS.Bookmarks` and `PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountsFromBookmarks`.
- Modify `src/utils/browser/browserApi.ts`
  - Add a narrow browser bookmarks API wrapper.
- Create `src/features/AccountManagement/bookmarkImport/types.ts`
  - Own bookmark import state, candidate, scan, and import result types.
- Create `src/features/AccountManagement/bookmarkImport/candidates.ts`
  - Flatten bookmark trees, parse and normalize URLs, dedupe by normalized origin, and classify duplicates against saved accounts.
- Create `src/features/AccountManagement/bookmarkImport/importAccounts.ts`
  - Run selected candidate imports sequentially through account operations with injected dependencies for tests.
- Create `src/features/AccountManagement/bookmarkImport/useBookmarkAccountImportDialog.ts`
  - Own permission, scan, review selection, import progress, result state, and safe telemetry completion.
- Create `src/features/AccountManagement/components/BookmarkAccountImportDialog/index.tsx`
  - Render the import dialog workflow.
- Modify `src/features/AccountManagement/AccountManagement.tsx`
  - Add the header action button and mount the dialog.
- Modify `src/features/AccountManagement/testIds.ts`
  - Add stable test ids for the import button, dialog, candidate rows, duplicate override, import button, and failed-row add-account action.
- Modify `src/features/AccountManagement/sponsors/types.ts`
  - Generalize `AddAccountPrefill` so non-sponsor add-account sources can prefill a URL.
- Modify `src/features/AccountManagement/sponsors/pendingAddAccountIntent.ts`
  - Rename public helpers only if necessary; keep current sponsor helper exports as compatibility aliases, and support bookmark-import prefill validation.
- Modify `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
  - Accept bookmark-import prefill with a URL and optional site type.
- Modify `src/features/AccountManagement/hooks/DialogStateContext.tsx`
  - Keep threading `AddAccountPrefill` through `openAddAccount`.
- Modify locale files:
  - `src/locales/zh-CN/account.json`
  - `src/locales/en/account.json`
  - `src/locales/ja/account.json`
  - `src/locales/zh-TW/account.json`
  - `src/locales/vi/account.json`
  - `src/locales/zh-CN/ui.json`
  - `src/locales/en/ui.json`
  - `src/locales/ja/ui.json`
  - `src/locales/zh-TW/ui.json`
  - `src/locales/vi/ui.json`
  - `src/locales/zh-CN/settings.json`
  - `src/locales/en/settings.json`
  - `src/locales/ja/settings.json`
  - `src/locales/zh-TW/settings.json`
  - `src/locales/vi/settings.json`
- Create or modify tests:
  - `tests/services/permissions/permissionManager.test.ts`
  - `tests/entrypoints/options/PermissionSettings.test.tsx`
  - `tests/features/OptionsOverview/PermissionOnboardingDialog.languageSelection.test.tsx`
  - `tests/features/BasicSettings/Permissions.search.test.ts`
  - `tests/services/productAnalytics/privacy.test.ts`
  - `tests/utils/browserApi.test.ts`
  - `tests/features/AccountManagement/bookmarkImport/candidates.test.ts`
  - `tests/features/AccountManagement/bookmarkImport/importAccounts.test.ts`
  - `tests/features/AccountManagement/components/BookmarkAccountImportDialog.test.tsx`
  - `tests/features/AccountManagement/AccountManagement.bookmarkImport.test.tsx`
  - `tests/features/AccountManagement/hooks/useAccountDialog.bookmarkImportPrefill.test.tsx`

## Task 1: Optional Bookmarks Permission Plumbing

**Files:**
- Modify: `wxt.config.ts`
- Modify: `src/services/permissions/permissionManager.ts`
- Create: `src/services/permissions/permissionDisplay.ts`
- Modify: `src/features/BasicSettings/components/tabs/Permissions/PermissionSettings.tsx`
- Modify: `src/features/OptionsOverview/components/dialogs/PermissionOnboardingDialog.tsx`
- Modify: `src/features/BasicSettings/components/tabs/Permissions/Permissions.search.ts`
- Modify: `src/services/productAnalytics/events.ts`
- Modify locale files under `src/locales/*/settings.json`
- Test: `tests/services/permissions/permissionManager.test.ts`
- Test: `tests/entrypoints/options/PermissionSettings.test.tsx`
- Test: `tests/features/OptionsOverview/PermissionOnboardingDialog.languageSelection.test.tsx`
- Test: `tests/features/BasicSettings/Permissions.search.test.ts`

- [ ] **Step 1: Add failing permission-manager and search tests**

Update the mocked manifest in `tests/services/permissions/permissionManager.test.ts` so `bookmarks` appears in the optional permission list:

```ts
  getManifest: vi.fn(() => ({
    optional_permissions: [
      "cookies",
      "webRequest",
      "clipboardRead",
      "notifications",
      "bookmarks",
    ],
  })),
```

Update the first test expectation:

```ts
    expect(OPTIONAL_PERMISSIONS).toEqual([
      "cookies",
      "webRequest",
      "clipboardRead",
      "notifications",
      "bookmarks",
    ])
    expect(OPTIONAL_PERMISSION_IDS.Bookmarks).toBe("bookmarks")
```

Create `tests/features/BasicSettings/Permissions.search.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { permissionsSearchControls } from "~/features/BasicSettings/components/tabs/Permissions/Permissions.search"

describe("permissions settings search definitions", () => {
  it("registers every optional permission control including browser bookmarks", () => {
    expect(permissionsSearchControls.map((control) => control.id)).toEqual([
      "control:permissions-refresh",
      "control:permissions-cookies",
      "control:permissions-dnr-host-access",
      "control:permissions-webrequest",
      "control:permissions-webrequest-blocking",
      "control:permissions-clipboard-read",
      "control:permissions-notifications",
      "control:permissions-bookmarks",
    ])

    expect(
      permissionsSearchControls.find(
        (control) => control.id === "control:permissions-bookmarks",
      ),
    ).toMatchObject({
      menuItemId: "permissions",
      targetId: "bookmarks",
      labelKey: "settings:permissions.items.bookmarks.title",
      descriptionKey: "settings:permissions.items.bookmarks.description",
      keywords: ["permission", "bookmark", "bookmarks", "browser bookmarks"],
    })
  })
})
```

- [ ] **Step 2: Add failing settings/onboarding render expectations**

In `tests/entrypoints/options/PermissionSettings.test.tsx`, add `Bookmarks` to the mocked IDs and arrays:

```ts
    Bookmarks: "bookmarks",
```

```ts
  OPTIONAL_PERMISSIONS: ["cookies", "clipboardRead", "notifications", "bookmarks"],
  OPTIONAL_PERMISSION_DEFINITIONS: [
    { id: "cookies" },
    { id: "clipboardRead" },
    { id: "notifications" },
    { id: "bookmarks" },
  ],
```

Update the first test to assert the new row:

```ts
    expect(
      screen.getByText("settings:permissions.items.bookmarks.title"),
    ).toBeInTheDocument()

    const bookmarksRow = document.getElementById("bookmarks")
    if (!bookmarksRow) {
      throw new Error("Expected bookmarks permission row to be rendered")
    }
```

In `tests/features/OptionsOverview/PermissionOnboardingDialog.languageSelection.test.tsx`, add `"bookmarks"` to the mocked `OPTIONAL_PERMISSIONS` and assert seven denied statuses in the open-status test:

```ts
    expect(
      screen.getAllByText(i18n.t("permissions.status.denied")),
    ).toHaveLength(6)
```

Then update the grant-all assertion to include `"bookmarks"`:

```ts
      expect(permissionMocks.ensurePermissionsDetailed).toHaveBeenCalledWith([
        "cookies",
        "declarativeNetRequestWithHostAccess",
        "webRequest",
        "webRequestBlocking",
        "clipboardRead",
        "notifications",
        "bookmarks",
      ])
```

- [ ] **Step 3: Run the permission tests and confirm failure**

Run:

```bash
pnpm vitest --run tests/services/permissions/permissionManager.test.ts tests/entrypoints/options/PermissionSettings.test.tsx tests/features/OptionsOverview/PermissionOnboardingDialog.languageSelection.test.tsx tests/features/BasicSettings/Permissions.search.test.ts
```

Expected: fail because `Bookmarks` is missing from permission IDs, display switches, manifest optional permissions, and search definitions.

- [ ] **Step 4: Add the optional manifest permission**

In `wxt.config.ts`, add a separate optional permission constant:

```ts
const BOOKMARK_IMPORT_OPTIONAL_PERMISSIONS = ["bookmarks"] as const
```

Update `getManifestOptionalPermissions`:

```ts
function getManifestOptionalPermissions(browser: BrowserTarget) {
  const browserOptionalPermissions = isFirefoxManifestTarget(browser)
    ? FIREFOX_COOKIE_OPTIONAL_PERMISSIONS
    : getChromiumOptionalPermissions()

  return [
    ...browserOptionalPermissions,
    ...COMMON_OPTIONAL_PERMISSIONS,
    ...BOOKMARK_IMPORT_OPTIONAL_PERMISSIONS,
  ]
}
```

- [ ] **Step 5: Add permission ID and shared display helpers**

In `src/services/permissions/permissionManager.ts`, add:

```ts
  Bookmarks: "bookmarks",
```

Create `src/services/permissions/permissionDisplay.ts`:

```ts
import type { TFunction } from "i18next"

import type { ManifestOptionalPermissions } from "./permissionManager"

/** Resolve the localized title for a supported optional permission. */
export function getOptionalPermissionTitle(
  t: TFunction,
  id: ManifestOptionalPermissions,
) {
  switch (id) {
    case "cookies":
      return t("settings:permissions.items.cookies.title")
    case "declarativeNetRequestWithHostAccess":
      return t(
        "settings:permissions.items.declarativeNetRequestWithHostAccess.title",
      )
    case "webRequest":
      return t("settings:permissions.items.webRequest.title")
    case "webRequestBlocking":
      return t("settings:permissions.items.webRequestBlocking.title")
    case "clipboardRead":
      return t("settings:permissions.items.clipboardRead.title")
    case "notifications":
      return t("settings:permissions.items.notifications.title")
    case "bookmarks":
      return t("settings:permissions.items.bookmarks.title")
  }
}

/** Resolve the localized description for a supported optional permission. */
export function getOptionalPermissionDescription(
  t: TFunction,
  id: ManifestOptionalPermissions,
) {
  switch (id) {
    case "cookies":
      return t("settings:permissions.items.cookies.description")
    case "declarativeNetRequestWithHostAccess":
      return t(
        "settings:permissions.items.declarativeNetRequestWithHostAccess.description",
      )
    case "webRequest":
      return t("settings:permissions.items.webRequest.description")
    case "webRequestBlocking":
      return t("settings:permissions.items.webRequestBlocking.description")
    case "clipboardRead":
      return t("settings:permissions.items.clipboardRead.description")
    case "notifications":
      return t("settings:permissions.items.notifications.description")
    case "bookmarks":
      return t("settings:permissions.items.bookmarks.description")
  }
}
```

In `PermissionSettings.tsx` and `PermissionOnboardingDialog.tsx`, remove the local `getPermissionTitle` and `getPermissionDescription` functions and import:

```ts
import {
  getOptionalPermissionDescription,
  getOptionalPermissionTitle,
} from "~/services/permissions/permissionDisplay"
```

Replace calls:

```ts
const label = getOptionalPermissionTitle(t, id)
description: getOptionalPermissionDescription(t, permission.id)
```

- [ ] **Step 6: Add settings search entry**

In `src/features/BasicSettings/components/tabs/Permissions/Permissions.search.ts`, append after notifications:

```ts
  buildControlDefinition(
    "control:permissions-bookmarks",
    "permissions",
    "bookmarks",
    "settings:permissions.items.bookmarks.title",
    707,
    {
      descriptionKey: "settings:permissions.items.bookmarks.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.permissions",
        "settings:permissions.title",
      ],
      keywords: ["permission", "bookmark", "bookmarks", "browser bookmarks"],
      isVisible: (context) => context.hasOptionalPermissions,
    },
  ),
```

- [ ] **Step 7: Add permission analytics enum**

In `src/services/productAnalytics/events.ts`, add:

```ts
  Bookmarks: "bookmarks",
```

inside `PRODUCT_ANALYTICS_PERMISSION_IDS`.

- [ ] **Step 8: Add localized permission copy**

Add this key shape under `permissions.items` in each `src/locales/*/settings.json`.

For `src/locales/en/settings.json`:

```json
"bookmarks": {
  "title": "Browser bookmarks",
  "description": "Read browser bookmarks only when importing account sites from saved bookmark URLs."
}
```

For `src/locales/zh-CN/settings.json`:

```json
"bookmarks": {
  "title": "浏览器书签",
  "description": "仅在从浏览器书签导入账号站点时读取已保存的书签网址。"
}
```

For `src/locales/zh-TW/settings.json`:

```json
"bookmarks": {
  "title": "瀏覽器書籤",
  "description": "僅在從瀏覽器書籤匯入帳號站點時讀取已儲存的書籤網址。"
}
```

For `src/locales/ja/settings.json`:

```json
"bookmarks": {
  "title": "ブラウザのブックマーク",
  "description": "保存済みのブックマーク URL からアカウントサイトをインポートするときだけ、ブラウザのブックマークを読み取ります。"
}
```

For `src/locales/vi/settings.json`:

```json
"bookmarks": {
  "title": "Dau trang trinh duyet",
  "description": "Chi doc dau trang trinh duyet khi nhap trang tai khoan tu URL dau trang da luu."
}
```

- [ ] **Step 9: Run permission tests**

Run:

```bash
pnpm vitest --run tests/services/permissions/permissionManager.test.ts tests/entrypoints/options/PermissionSettings.test.tsx tests/features/OptionsOverview/PermissionOnboardingDialog.languageSelection.test.tsx tests/features/BasicSettings/Permissions.search.test.ts
```

Expected: pass.

- [ ] **Step 10: Commit optional permission plumbing**

Run:

```bash
git add wxt.config.ts src/services/permissions/permissionManager.ts src/services/permissions/permissionDisplay.ts src/features/BasicSettings/components/tabs/Permissions/PermissionSettings.tsx src/features/OptionsOverview/components/dialogs/PermissionOnboardingDialog.tsx src/features/BasicSettings/components/tabs/Permissions/Permissions.search.ts src/services/productAnalytics/events.ts src/locales/en/settings.json src/locales/ja/settings.json src/locales/zh-CN/settings.json src/locales/zh-TW/settings.json src/locales/vi/settings.json tests/services/permissions/permissionManager.test.ts tests/entrypoints/options/PermissionSettings.test.tsx tests/features/OptionsOverview/PermissionOnboardingDialog.languageSelection.test.tsx tests/features/BasicSettings/Permissions.search.test.ts
git commit -m "feat(permissions): add optional bookmarks permission"
```

## Task 2: Browser Bookmarks API Wrapper

**Files:**
- Modify: `src/utils/browser/browserApi.ts`
- Test: `tests/utils/browserApi.test.ts`

- [ ] **Step 1: Add failing browser API wrapper tests**

Update imports in `tests/utils/browserApi.test.ts`:

```ts
  getBrowserBookmarkTree,
  hasBookmarksAPI,
```

Append:

```ts
describe("browserApi bookmark helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as any).browser = undefined
  })

  afterAll(() => {
    ;(globalThis as any).browser = originalBrowser
    ;(globalThis as any).chrome = originalChrome
  })

  it("reports bookmark API support only when getTree is callable", () => {
    ;(globalThis as any).browser = {}
    expect(hasBookmarksAPI()).toBe(false)

    ;(globalThis as any).browser = { bookmarks: {} }
    expect(hasBookmarksAPI()).toBe(false)

    ;(globalThis as any).browser = {
      bookmarks: { getTree: vi.fn() },
    }
    expect(hasBookmarksAPI()).toBe(true)
  })

  it("reads the browser bookmark tree when supported", async () => {
    const tree = [
      {
        id: "root",
        title: "Bookmarks",
        children: [
          { id: "node-1", title: "Example", url: "https://one.example.invalid" },
        ],
      },
    ]
    ;(globalThis as any).browser = {
      bookmarks: {
        getTree: vi.fn().mockResolvedValue(tree),
      },
    }

    await expect(getBrowserBookmarkTree()).resolves.toEqual({
      success: true,
      tree,
    })
  })

  it("classifies missing bookmarks API and getTree failures without throwing", async () => {
    ;(globalThis as any).browser = {}

    await expect(getBrowserBookmarkTree()).resolves.toEqual({
      success: false,
      reason: "unavailable",
    })

    ;(globalThis as any).browser = {
      bookmarks: {
        getTree: vi.fn().mockRejectedValue(new Error("native read failed")),
      },
    }

    await expect(getBrowserBookmarkTree()).resolves.toEqual({
      success: false,
      reason: "read_failed",
    })
  })
})
```

- [ ] **Step 2: Run the browser API test and confirm failure**

Run:

```bash
pnpm vitest --run tests/utils/browserApi.test.ts
```

Expected: fail because `hasBookmarksAPI` and `getBrowserBookmarkTree` are not exported.

- [ ] **Step 3: Add the wrapper**

In `src/utils/browser/browserApi.ts`, add near other API capability helpers:

```ts
export type BrowserBookmarkTreeNode = browser.bookmarks.BookmarkTreeNode

export type BrowserBookmarkTreeReadResult =
  | {
      success: true
      tree: BrowserBookmarkTreeNode[]
    }
  | {
      success: false
      reason: "unavailable" | "read_failed"
    }

/** Checks whether the native WebExtension bookmarks API is available. */
export function hasBookmarksAPI(): boolean {
  return typeof (globalThis as any).browser?.bookmarks?.getTree === "function"
}

/**
 * Reads the full native browser bookmark tree without exposing browser APIs to UI code.
 */
export async function getBrowserBookmarkTree(): Promise<BrowserBookmarkTreeReadResult> {
  const getTree = (globalThis as any).browser?.bookmarks?.getTree as
    | (() => Promise<BrowserBookmarkTreeNode[]>)
    | undefined

  if (typeof getTree !== "function") {
    return { success: false, reason: "unavailable" }
  }

  try {
    return {
      success: true,
      tree: await getTree(),
    }
  } catch (error) {
    logger.warn("bookmarks.getTree failed", {
      error: getErrorMessage(error),
    })
    return { success: false, reason: "read_failed" }
  }
}
```

- [ ] **Step 4: Run the browser API test**

Run:

```bash
pnpm vitest --run tests/utils/browserApi.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit browser wrapper**

Run:

```bash
git add src/utils/browser/browserApi.ts tests/utils/browserApi.test.ts
git commit -m "feat(browser): wrap native bookmark reads"
```

## Task 3: Bookmark Import Candidate Builder

**Files:**
- Create: `src/features/AccountManagement/bookmarkImport/types.ts`
- Create: `src/features/AccountManagement/bookmarkImport/candidates.ts`
- Test: `tests/features/AccountManagement/bookmarkImport/candidates.test.ts`

- [ ] **Step 1: Write failing candidate-builder tests**

Create `tests/features/AccountManagement/bookmarkImport/candidates.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  buildBookmarkAccountImportCandidates,
  summarizeBookmarkAccountImportScan,
} from "~/features/AccountManagement/bookmarkImport/candidates"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

describe("bookmark account import candidates", () => {
  it("flattens bookmark trees, keeps web URLs, rejects malformed and non-web URLs, and dedupes origins", () => {
    const result = buildBookmarkAccountImportCandidates({
      bookmarkTree: [
        {
          id: "root",
          title: "Root",
          children: [
            {
              id: "folder-1",
              title: "Folder",
              children: [
                {
                  id: "ready-1",
                  title: "Ready",
                  url: "https://alpha.example.invalid/dashboard",
                },
                {
                  id: "ready-duplicate",
                  title: "Duplicate bookmark",
                  url: "https://alpha.example.invalid/settings",
                },
                {
                  id: "non-web",
                  title: "Mail",
                  url: "mailto:owner@example.invalid",
                },
                {
                  id: "malformed",
                  title: "Broken",
                  url: "https://",
                },
              ],
            },
          ],
        },
      ],
      existingAccounts: [],
    })

    expect(result.candidates).toEqual([
      {
        id: "bookmark-import:https://alpha.example.invalid",
        url: "https://alpha.example.invalid",
        normalizedOrigin: "https://alpha.example.invalid",
        status: "ready",
        selectedByDefault: true,
        sourceBookmarkCount: 2,
      },
    ])
    expect(result.ignoredCounts).toEqual({
      folder: 2,
      malformed: 1,
      nonWeb: 1,
      repeatedOrigin: 1,
      unsupported: 0,
    })
  })

  it("marks existing origins as duplicates while keeping them available for explicit override", () => {
    const result = buildBookmarkAccountImportCandidates({
      bookmarkTree: [
        {
          id: "root",
          title: "Root",
          children: [
            {
              id: "existing",
              title: "Existing",
              url: "https://existing.example.invalid/path",
            },
            {
              id: "new",
              title: "New",
              url: "https://new.example.invalid/path",
            },
          ],
        },
      ],
      existingAccounts: [
        buildSiteAccount({
          id: "account-existing",
          site_url: "https://existing.example.invalid/dashboard",
        }),
      ],
    })

    expect(result.candidates).toEqual([
      {
        id: "bookmark-import:https://existing.example.invalid",
        url: "https://existing.example.invalid",
        normalizedOrigin: "https://existing.example.invalid",
        status: "duplicate",
        selectedByDefault: false,
        sourceBookmarkCount: 1,
        existingAccountCount: 1,
      },
      {
        id: "bookmark-import:https://new.example.invalid",
        url: "https://new.example.invalid",
        normalizedOrigin: "https://new.example.invalid",
        status: "ready",
        selectedByDefault: true,
        sourceBookmarkCount: 1,
      },
    ])
    expect(summarizeBookmarkAccountImportScan(result)).toEqual({
      candidateCount: 2,
      readyCount: 1,
      duplicateCount: 1,
      invalidCount: 0,
      ignoredCount: 1,
      selectedDefaultCount: 1,
    })
  })
})
```

- [ ] **Step 2: Run the candidate test and confirm failure**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/bookmarkImport/candidates.test.ts
```

Expected: fail because the bookmark import candidate modules do not exist.

- [ ] **Step 3: Create bookmark import types**

Create `src/features/AccountManagement/bookmarkImport/types.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import type { BrowserBookmarkTreeNode } from "~/utils/browser/browserApi"

export type BookmarkAccountImportCandidateStatus =
  | "ready"
  | "duplicate"

export interface BookmarkAccountImportCandidate {
  id: string
  url: string
  normalizedOrigin: string
  status: BookmarkAccountImportCandidateStatus
  selectedByDefault: boolean
  sourceBookmarkCount: number
  existingAccountCount?: number
  detectedSiteType?: AccountSiteType
}

export interface BookmarkAccountImportIgnoredCounts {
  folder: number
  malformed: number
  nonWeb: number
  repeatedOrigin: number
  unsupported: number
}

export interface BookmarkAccountImportScanResult {
  candidates: BookmarkAccountImportCandidate[]
  ignoredCounts: BookmarkAccountImportIgnoredCounts
}

export interface BookmarkAccountImportScanSummary {
  candidateCount: number
  readyCount: number
  duplicateCount: number
  invalidCount: number
  ignoredCount: number
  selectedDefaultCount: number
}

export type NativeBookmarkTreeNode = Pick<
  BrowserBookmarkTreeNode,
  "id" | "title" | "url" | "children"
>
```

- [ ] **Step 4: Implement candidate builder**

Create `src/features/AccountManagement/bookmarkImport/candidates.ts`:

```ts
import { SITE_TYPES } from "~/constants/siteType"
import { normalizeAccountSiteUrlForDuplicateCheck } from "~/services/accounts/utils/siteUrlNormalization"
import type { SiteAccount } from "~/types"

import type {
  BookmarkAccountImportCandidate,
  BookmarkAccountImportIgnoredCounts,
  BookmarkAccountImportScanResult,
  BookmarkAccountImportScanSummary,
  NativeBookmarkTreeNode,
} from "./types"

interface BuildBookmarkAccountImportCandidatesInput {
  bookmarkTree: NativeBookmarkTreeNode[]
  existingAccounts: SiteAccount[]
}

function createEmptyIgnoredCounts(): BookmarkAccountImportIgnoredCounts {
  return {
    folder: 0,
    malformed: 0,
    nonWeb: 0,
    repeatedOrigin: 0,
    unsupported: 0,
  }
}

function flattenBookmarkNodes(nodes: NativeBookmarkTreeNode[]) {
  const result: NativeBookmarkTreeNode[] = []
  const visit = (node: NativeBookmarkTreeNode) => {
    result.push(node)
    for (const child of node.children ?? []) {
      visit(child)
    }
  }

  for (const node of nodes) {
    visit(node)
  }

  return result
}

function parseWebBookmarkUrl(value: unknown):
  | {
      url: string
      normalizedOrigin: string
    }
  | "malformed"
  | "non-web"
  | "unsupported" {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "malformed"
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return "malformed"
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "non-web"
  }

  const normalizedOrigin = normalizeAccountSiteUrlForDuplicateCheck({
    siteType: SITE_TYPES.UNKNOWN,
    url: parsed.href,
  })

  if (!normalizedOrigin) {
    return "unsupported"
  }

  return {
    url: normalizedOrigin,
    normalizedOrigin,
  }
}

function buildExistingOriginCounts(accounts: SiteAccount[]) {
  const counts = new Map<string, number>()

  for (const account of accounts) {
    const origin = normalizeAccountSiteUrlForDuplicateCheck({
      siteType: account.site_type,
      url: account.site_url,
    })
    if (!origin) continue

    counts.set(origin, (counts.get(origin) ?? 0) + 1)
  }

  return counts
}

export function buildBookmarkAccountImportCandidates(
  input: BuildBookmarkAccountImportCandidatesInput,
): BookmarkAccountImportScanResult {
  const ignoredCounts = createEmptyIgnoredCounts()
  const existingOriginCounts = buildExistingOriginCounts(input.existingAccounts)
  const candidatesByOrigin = new Map<string, BookmarkAccountImportCandidate>()

  for (const node of flattenBookmarkNodes(input.bookmarkTree)) {
    if (node.children) {
      ignoredCounts.folder += 1
    }

    if (typeof node.url !== "string") {
      continue
    }

    const parsed = parseWebBookmarkUrl(node.url)
    if (parsed === "malformed") {
      ignoredCounts.malformed += 1
      continue
    }
    if (parsed === "non-web") {
      ignoredCounts.nonWeb += 1
      continue
    }
    if (parsed === "unsupported") {
      ignoredCounts.unsupported += 1
      continue
    }

    const existing = candidatesByOrigin.get(parsed.normalizedOrigin)
    if (existing) {
      existing.sourceBookmarkCount += 1
      ignoredCounts.repeatedOrigin += 1
      continue
    }

    const existingAccountCount =
      existingOriginCounts.get(parsed.normalizedOrigin) ?? 0
    const status = existingAccountCount > 0 ? "duplicate" : "ready"

    candidatesByOrigin.set(parsed.normalizedOrigin, {
      id: `bookmark-import:${parsed.normalizedOrigin}`,
      url: parsed.url,
      normalizedOrigin: parsed.normalizedOrigin,
      status,
      selectedByDefault: status === "ready",
      sourceBookmarkCount: 1,
      ...(existingAccountCount > 0 ? { existingAccountCount } : {}),
    })
  }

  return {
    candidates: Array.from(candidatesByOrigin.values()).sort((a, b) =>
      a.normalizedOrigin.localeCompare(b.normalizedOrigin),
    ),
    ignoredCounts,
  }
}

export function summarizeBookmarkAccountImportScan(
  scan: BookmarkAccountImportScanResult,
): BookmarkAccountImportScanSummary {
  const readyCount = scan.candidates.filter(
    (candidate) => candidate.status === "ready",
  ).length
  const duplicateCount = scan.candidates.filter(
    (candidate) => candidate.status === "duplicate",
  ).length
  const ignoredCount = Object.values(scan.ignoredCounts).reduce(
    (sum, count) => sum + count,
    0,
  )

  return {
    candidateCount: scan.candidates.length,
    readyCount,
    duplicateCount,
    invalidCount:
      scan.ignoredCounts.unsupported +
      scan.ignoredCounts.malformed +
      scan.ignoredCounts.nonWeb,
    ignoredCount,
    selectedDefaultCount: scan.candidates.filter(
      (candidate) => candidate.selectedByDefault,
    ).length,
  }
}
```

- [ ] **Step 5: Run candidate tests**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/bookmarkImport/candidates.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit candidate builder**

Run:

```bash
git add src/features/AccountManagement/bookmarkImport/types.ts src/features/AccountManagement/bookmarkImport/candidates.ts tests/features/AccountManagement/bookmarkImport/candidates.test.ts
git commit -m "feat(account): classify bookmark import candidates"
```

## Task 4: Sequential Import Pipeline

**Files:**
- Modify: `src/features/AccountManagement/bookmarkImport/types.ts`
- Create: `src/features/AccountManagement/bookmarkImport/importAccounts.ts`
- Test: `tests/features/AccountManagement/bookmarkImport/importAccounts.test.ts`

- [ ] **Step 1: Write failing sequential import tests**

Create `tests/features/AccountManagement/bookmarkImport/importAccounts.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createEmptyAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { runBookmarkAccountImport } from "~/features/AccountManagement/bookmarkImport/importAccounts"
import { AuthTypeEnum } from "~/types"

describe("runBookmarkAccountImport", () => {
  it("runs selected candidates sequentially through auto-detect and deferred save", async () => {
    const draft = createEmptyAccountDialogDraft()
    const autoDetectAccount = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        message: "detected",
        data: {
          username: "alpha-user",
          accessToken: "alpha-token",
          userId: "alpha-id",
          exchangeRate: 7,
          checkIn: draft.checkIn,
          siteName: "Alpha",
          siteType: SITE_TYPES.NEW_API,
          authType: AuthTypeEnum.AccessToken,
        },
      })
      .mockResolvedValueOnce({
        success: false,
        message: "private backend detail",
      })
    const validateAndSaveAccount = vi.fn().mockResolvedValue({
      success: true,
      message: "saved",
      accountId: "account-alpha",
    })
    const onProgress = vi.fn()

    const result = await runBookmarkAccountImport({
      candidates: [
        {
          id: "bookmark-import:https://alpha.example.invalid",
          url: "https://alpha.example.invalid",
          normalizedOrigin: "https://alpha.example.invalid",
          status: "ready",
          selectedByDefault: true,
          sourceBookmarkCount: 1,
        },
        {
          id: "bookmark-import:https://beta.example.invalid",
          url: "https://beta.example.invalid",
          normalizedOrigin: "https://beta.example.invalid",
          status: "ready",
          selectedByDefault: true,
          sourceBookmarkCount: 1,
        },
      ],
      autoDetectAccount,
      validateAndSaveAccount,
      onProgress,
    })

    expect(autoDetectAccount.mock.calls.map((call) => call[0])).toEqual([
      "https://alpha.example.invalid",
      "https://beta.example.invalid",
    ])
    expect(validateAndSaveAccount).toHaveBeenCalledWith(
      "https://alpha.example.invalid",
      "Alpha",
      "alpha-user",
      "alpha-token",
      "alpha-id",
      "7",
      "",
      [],
      draft.checkIn,
      SITE_TYPES.NEW_API,
      AuthTypeEnum.AccessToken,
      "",
      "",
      false,
      false,
      undefined,
      {
        deferDataRefresh: true,
      },
    )
    expect(onProgress).toHaveBeenCalledWith({
      completedCount: 1,
      totalCount: 2,
      currentCandidateId: "bookmark-import:https://alpha.example.invalid",
    })
    expect(result).toMatchObject({
      successCount: 1,
      failureCount: 1,
      skippedCount: 0,
      rows: [
        {
          candidateId: "bookmark-import:https://alpha.example.invalid",
          status: "success",
          accountId: "account-alpha",
          failureCategory: undefined,
        },
        {
          candidateId: "bookmark-import:https://beta.example.invalid",
          status: "failed",
          failureCategory: "detection",
          safeMessageKey: "ui:dialog.bookmarkAccountImport.failures.detection",
        },
      ],
    })
  })

  it("records save failures locally and continues with the next candidate", async () => {
    const draft = createEmptyAccountDialogDraft()
    const autoDetectAccount = vi.fn().mockResolvedValue({
      success: true,
      message: "detected",
      data: {
        username: "user",
        accessToken: "token",
        userId: "id",
        exchangeRate: null,
        checkIn: draft.checkIn,
        siteName: "Example",
        siteType: SITE_TYPES.UNKNOWN,
        authType: AuthTypeEnum.AccessToken,
      },
    })
    const validateAndSaveAccount = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        message: "private save failure",
      })
      .mockResolvedValueOnce({
        success: true,
        message: "saved",
        accountId: "account-2",
      })

    const result = await runBookmarkAccountImport({
      candidates: [
        {
          id: "bookmark-import:https://one.example.invalid",
          url: "https://one.example.invalid",
          normalizedOrigin: "https://one.example.invalid",
          status: "ready",
          selectedByDefault: true,
          sourceBookmarkCount: 1,
        },
        {
          id: "bookmark-import:https://two.example.invalid",
          url: "https://two.example.invalid",
          normalizedOrigin: "https://two.example.invalid",
          status: "ready",
          selectedByDefault: true,
          sourceBookmarkCount: 1,
        },
      ],
      autoDetectAccount,
      validateAndSaveAccount,
    })

    expect(validateAndSaveAccount).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(result)).not.toContain("private save failure")
    expect(result.failureCount).toBe(1)
    expect(result.successCount).toBe(1)
    expect(result.rows[0]).toMatchObject({
      status: "failed",
      failureCategory: "save",
      safeMessageKey: "ui:dialog.bookmarkAccountImport.failures.save",
    })
  })
})
```

- [ ] **Step 2: Run the import pipeline test and confirm failure**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/bookmarkImport/importAccounts.test.ts
```

Expected: fail because `runBookmarkAccountImport` is not implemented.

- [ ] **Step 3: Extend import types**

Append to `src/features/AccountManagement/bookmarkImport/types.ts`:

```ts
export type BookmarkAccountImportFailureCategory =
  | "detection"
  | "save"
  | "unknown"

export interface BookmarkAccountImportProgress {
  completedCount: number
  totalCount: number
  currentCandidateId: string
}

export type BookmarkAccountImportRowResult =
  | {
      candidateId: string
      url: string
      status: "success"
      accountId: string | null
    }
  | {
      candidateId: string
      url: string
      status: "failed"
      failureCategory: BookmarkAccountImportFailureCategory
      safeMessageKey: string
    }

export interface BookmarkAccountImportRunResult {
  rows: BookmarkAccountImportRowResult[]
  successCount: number
  failureCount: number
  skippedCount: number
}
```

- [ ] **Step 4: Implement sequential pipeline**

Create `src/features/AccountManagement/bookmarkImport/importAccounts.ts`:

```ts
import { isAccountSiteType, SITE_TYPES } from "~/constants/siteType"
import { createEmptyAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import {
  autoDetectAccount as defaultAutoDetectAccount,
  validateAndSaveAccount as defaultValidateAndSaveAccount,
} from "~/services/accounts/accountOperations"
import {
  AuthTypeEnum,
  type CheckInConfig,
} from "~/types"
import type {
  AccountSaveResponse,
  AccountValidationResponse,
} from "~/types/serviceResponse"

import type {
  BookmarkAccountImportCandidate,
  BookmarkAccountImportProgress,
  BookmarkAccountImportRowResult,
  BookmarkAccountImportRunResult,
} from "./types"

interface RunBookmarkAccountImportInput {
  candidates: BookmarkAccountImportCandidate[]
  autoDetectAccount?: (
    url: string,
    authType: AuthTypeEnum,
  ) => Promise<AccountValidationResponse>
  validateAndSaveAccount?: typeof defaultValidateAndSaveAccount
  onProgress?: (progress: BookmarkAccountImportProgress) => void
}

function resolveSiteType(value: unknown) {
  return isAccountSiteType(value) ? value : SITE_TYPES.UNKNOWN
}

function resolveAuthType(value: unknown) {
  return Object.values(AuthTypeEnum).includes(value as AuthTypeEnum)
    ? (value as AuthTypeEnum)
    : AuthTypeEnum.AccessToken
}

function resolveCheckIn(value: unknown): CheckInConfig {
  if (value && typeof value === "object") {
    return value as CheckInConfig
  }

  return createEmptyAccountDialogDraft().checkIn
}

function createFailureRow(
  candidate: BookmarkAccountImportCandidate,
  failureCategory: "detection" | "save" | "unknown",
): BookmarkAccountImportRowResult {
  return {
    candidateId: candidate.id,
    url: candidate.url,
    status: "failed",
    failureCategory,
    safeMessageKey: `ui:dialog.bookmarkAccountImport.failures.${failureCategory}`,
  }
}

export async function runBookmarkAccountImport({
  candidates,
  autoDetectAccount = defaultAutoDetectAccount,
  validateAndSaveAccount = defaultValidateAndSaveAccount,
  onProgress,
}: RunBookmarkAccountImportInput): Promise<BookmarkAccountImportRunResult> {
  const rows: BookmarkAccountImportRowResult[] = []
  let completedCount = 0

  for (const candidate of candidates) {
    try {
      const detection = await autoDetectAccount(
        candidate.url,
        AuthTypeEnum.AccessToken,
      )

      if (!detection.success || !detection.data) {
        rows.push(createFailureRow(candidate, "detection"))
        continue
      }

      const data = detection.data
      const siteType = resolveSiteType(data.siteType)
      const authType = resolveAuthType(data.authType)
      const saveResult: AccountSaveResponse = await validateAndSaveAccount(
        candidate.url,
        data.siteName.trim(),
        data.username.trim(),
        data.accessToken.trim(),
        data.userId.trim(),
        data.exchangeRate === null || data.exchangeRate === undefined
          ? ""
          : String(data.exchangeRate),
        "",
        [],
        resolveCheckIn(data.checkIn),
        siteType,
        authType,
        "",
        "",
        false,
        false,
        data.sub2apiAuth,
        {
          deferDataRefresh: true,
        },
      )

      if (!saveResult.success) {
        rows.push(createFailureRow(candidate, "save"))
        continue
      }

      rows.push({
        candidateId: candidate.id,
        url: candidate.url,
        status: "success",
        accountId:
          typeof saveResult.accountId === "string" &&
          saveResult.accountId.trim()
            ? saveResult.accountId.trim()
            : null,
      })
    } catch {
      rows.push(createFailureRow(candidate, "unknown"))
    } finally {
      completedCount += 1
      onProgress?.({
        completedCount,
        totalCount: candidates.length,
        currentCandidateId: candidate.id,
      })
    }
  }

  const successCount = rows.filter((row) => row.status === "success").length
  const failureCount = rows.filter((row) => row.status === "failed").length

  return {
    rows,
    successCount,
    failureCount,
    skippedCount: 0,
  }
}
```

- [ ] **Step 5: Run import pipeline tests**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/bookmarkImport/importAccounts.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit import pipeline**

Run:

```bash
git add src/features/AccountManagement/bookmarkImport/types.ts src/features/AccountManagement/bookmarkImport/importAccounts.ts tests/features/AccountManagement/bookmarkImport/importAccounts.test.ts
git commit -m "feat(account): import bookmark candidates sequentially"
```

## Task 5: Import Dialog Controller and UI

**Files:**
- Create: `src/features/AccountManagement/bookmarkImport/useBookmarkAccountImportDialog.ts`
- Create: `src/features/AccountManagement/components/BookmarkAccountImportDialog/index.tsx`
- Modify: `src/features/AccountManagement/testIds.ts`
- Modify locale files under `src/locales/*/ui.json`
- Test: `tests/features/AccountManagement/components/BookmarkAccountImportDialog.test.tsx`

- [ ] **Step 1: Add test IDs**

In `src/features/AccountManagement/testIds.ts`, add:

```ts
  bookmarkImportButton: "account-management-bookmark-import-button",
  bookmarkImportDialog: "account-management-bookmark-import-dialog",
  bookmarkImportAllowScanButton:
    "account-management-bookmark-import-allow-scan-button",
  bookmarkImportImportButton:
    "account-management-bookmark-import-import-button",
  bookmarkImportIncludeExistingCheckbox:
    "account-management-bookmark-import-include-existing-checkbox",
  bookmarkImportCandidateRow:
    "account-management-bookmark-import-candidate-row",
  bookmarkImportOpenFailedAddAccountButton:
    "account-management-bookmark-import-open-failed-add-account-button",
```

- [ ] **Step 2: Write failing dialog tests**

Create `tests/features/AccountManagement/components/BookmarkAccountImportDialog.test.tsx`:

```tsx
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import BookmarkAccountImportDialog from "~/features/AccountManagement/components/BookmarkAccountImportDialog"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsFailureReason,
  type ProductAnalyticsFailureStage,
} from "~/services/productAnalytics/events"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"

const mocks = vi.hoisted(() => ({
  ensurePermissionsDetailed: vi.fn(),
  getBrowserBookmarkTree: vi.fn(),
  loadAccountData: vi.fn(),
  openAddAccount: vi.fn(),
  runBookmarkAccountImport: vi.fn(),
  startProductAnalyticsAction: vi.fn(),
  trackerComplete: vi.fn(),
}))

vi.mock("~/services/permissions/permissionManager", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/permissions/permissionManager")>()
  return {
    ...actual,
    OPTIONAL_PERMISSION_IDS: {
      ...actual.OPTIONAL_PERMISSION_IDS,
      Bookmarks: "bookmarks",
    },
    ensurePermissionsDetailed: mocks.ensurePermissionsDetailed,
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getBrowserBookmarkTree: mocks.getBrowserBookmarkTree,
  }
})

vi.mock("~/features/AccountManagement/bookmarkImport/importAccounts", () => ({
  runBookmarkAccountImport: (...args: unknown[]) =>
    mocks.runBookmarkAccountImport(...args),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    accounts: [
      buildSiteAccount({
        id: "existing-account",
        site_url: "https://existing.example.invalid/dashboard",
      }),
    ],
    loadAccountData: mocks.loadAccountData,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/DialogStateContext", () => ({
  useDialogStateContext: () => ({
    openAddAccount: mocks.openAddAccount,
  }),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: unknown[]) =>
    mocks.startProductAnalyticsAction(...args),
}))

describe("BookmarkAccountImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ensurePermissionsDetailed.mockResolvedValue({
      success: true,
      results: [
        {
          id: "bookmarks",
          requested: true,
          success: true,
          wasGrantedBefore: false,
          wasGrantedAfter: true,
        },
      ],
      requestedResults: [],
    })
    mocks.getBrowserBookmarkTree.mockResolvedValue({
      success: true,
      tree: [
        {
          id: "root",
          title: "Root",
          children: [
            {
              id: "ready",
              title: "Ready",
              url: "https://ready.example.invalid/path",
            },
            {
              id: "existing",
              title: "Existing",
              url: "https://existing.example.invalid/path",
            },
          ],
        },
      ],
    })
    mocks.runBookmarkAccountImport.mockResolvedValue({
      rows: [
        {
          candidateId: "bookmark-import:https://ready.example.invalid",
          url: "https://ready.example.invalid",
          status: "success",
          accountId: "account-ready",
        },
      ],
      successCount: 1,
      failureCount: 0,
      skippedCount: 0,
    })
    mocks.loadAccountData.mockResolvedValue(undefined)
    mocks.startProductAnalyticsAction.mockReturnValue({
      complete: mocks.trackerComplete,
    })
  })

  it("requests bookmarks permission, scans candidates, skips duplicates by default, and imports selected rows", async () => {
    const user = userEvent.setup()

    render(<BookmarkAccountImportDialog isOpen onClose={vi.fn()} />)

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
      ),
    )

    expect(mocks.ensurePermissionsDetailed).toHaveBeenCalledWith(["bookmarks"])
    expect(await screen.findByText("https://ready.example.invalid")).toBeInTheDocument()
    expect(screen.getByText("https://existing.example.invalid")).toBeInTheDocument()

    await user.click(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportImportButton),
    )

    await waitFor(() => {
      expect(mocks.runBookmarkAccountImport).toHaveBeenCalledWith(
        expect.objectContaining({
          candidates: [
            expect.objectContaining({
              normalizedOrigin: "https://ready.example.invalid",
            }),
          ],
        }),
      )
      expect(mocks.loadAccountData).toHaveBeenCalledTimes(1)
    })
  })

  it("allows duplicate origins only after the include-existing override is enabled", async () => {
    const user = userEvent.setup()

    render(<BookmarkAccountImportDialog isOpen onClose={vi.fn()} />)

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
      ),
    )
    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportIncludeExistingCheckbox,
      ),
    )
    await user.click(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportImportButton),
    )

    await waitFor(() => {
      const call = mocks.runBookmarkAccountImport.mock.calls[0]?.[0]
      expect(call.candidates.map((candidate: any) => candidate.normalizedOrigin)).toEqual([
        "https://existing.example.invalid",
        "https://ready.example.invalid",
      ])
    })
  })

  it("keeps permission denial recoverable and records permission failure analytics", async () => {
    const user = userEvent.setup()
    mocks.ensurePermissionsDetailed.mockResolvedValueOnce({
      success: false,
      results: [
        {
          id: "bookmarks",
          requested: true,
          success: false,
          wasGrantedBefore: false,
          wasGrantedAfter: false,
        },
      ],
      requestedResults: [
        {
          id: "bookmarks",
          requested: true,
          success: false,
          wasGrantedBefore: false,
          wasGrantedAfter: false,
        },
      ],
    })

    render(<BookmarkAccountImportDialog isOpen onClose={vi.fn()} />)

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
      ),
    )

    expect(
      await screen.findByText("ui:dialog.bookmarkAccountImport.permissionDenied"),
    ).toBeInTheDocument()
    expect(mocks.trackerComplete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
        insights: expect.objectContaining({
          failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionDenied,
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Permission,
        }),
      }),
    )
  })

  it("opens failed imports in Add Account with a bookmark-import prefill", async () => {
    const user = userEvent.setup()
    mocks.runBookmarkAccountImport.mockResolvedValueOnce({
      rows: [
        {
          candidateId: "bookmark-import:https://ready.example.invalid",
          url: "https://ready.example.invalid",
          status: "failed",
          failureCategory: "detection",
          safeMessageKey: "ui:dialog.bookmarkAccountImport.failures.detection",
        },
      ],
      successCount: 0,
      failureCount: 1,
      skippedCount: 0,
    })

    render(<BookmarkAccountImportDialog isOpen onClose={vi.fn()} />)

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton,
      ),
    )
    await user.click(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportImportButton),
    )

    const failedRow = await screen.findByText("https://ready.example.invalid")
    const row = failedRow.closest("li")
    if (!row) throw new Error("Expected failed row")
    await user.click(
      within(row).getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportOpenFailedAddAccountButton,
      ),
    )

    expect(mocks.openAddAccount).toHaveBeenCalledWith({
      source: "bookmark-import",
      siteUrl: "https://ready.example.invalid",
    })
  })
})
```

- [ ] **Step 3: Run the dialog test and confirm failure**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/components/BookmarkAccountImportDialog.test.tsx
```

Expected: fail because the dialog and controller do not exist.

- [ ] **Step 4: Implement the controller hook**

Create `src/features/AccountManagement/bookmarkImport/useBookmarkAccountImportDialog.ts`:

```ts
import { useMemo, useState } from "react"

import {
  buildBookmarkAccountImportCandidates,
  summarizeBookmarkAccountImportScan,
} from "~/features/AccountManagement/bookmarkImport/candidates"
import { runBookmarkAccountImport } from "~/features/AccountManagement/bookmarkImport/importAccounts"
import type {
  BookmarkAccountImportCandidate,
  BookmarkAccountImportProgress,
  BookmarkAccountImportRunResult,
  BookmarkAccountImportScanResult,
} from "~/features/AccountManagement/bookmarkImport/types"
import { ensurePermissionsDetailed, OPTIONAL_PERMISSION_IDS } from "~/services/permissions/permissionManager"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import type { SiteAccount } from "~/types"
import { getBrowserBookmarkTree } from "~/utils/browser/browserApi"

export type BookmarkAccountImportDialogStage =
  | "permission-needed"
  | "scanning"
  | "review"
  | "importing"
  | "results"

export type BookmarkAccountImportDialogError =
  | "permission-denied"
  | "api-unavailable"
  | "read-failed"
  | "empty"
  | "no-candidates"
  | "reload-failed"
  | null

interface UseBookmarkAccountImportDialogInput {
  accounts: SiteAccount[]
  loadAccountData: () => Promise<void>
}

function completeBookmarkImportActionFailure(params: {
  failureReason: ProductAnalyticsFailureReason
  failureStage: ProductAnalyticsFailureStage
  errorCategory: ProductAnalyticsErrorCategory
  itemCount?: number
}) {
  const tracker = startProductAnalyticsAction({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
    actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountsFromBookmarks,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })

  tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
    errorCategory: params.errorCategory,
    insights: {
      itemCount: params.itemCount,
      failureReason: params.failureReason,
      failureStage: params.failureStage,
    },
  })
}

export function useBookmarkAccountImportDialog({
  accounts,
  loadAccountData,
}: UseBookmarkAccountImportDialogInput) {
  const [stage, setStage] =
    useState<BookmarkAccountImportDialogStage>("permission-needed")
  const [error, setError] = useState<BookmarkAccountImportDialogError>(null)
  const [scanResult, setScanResult] =
    useState<BookmarkAccountImportScanResult | null>(null)
  const [includeExisting, setIncludeExisting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<BookmarkAccountImportProgress | null>(
    null,
  )
  const [runResult, setRunResult] =
    useState<BookmarkAccountImportRunResult | null>(null)

  const selectedCandidates = useMemo(() => {
    if (!scanResult) return []
    return scanResult.candidates.filter((candidate) => {
      if (candidate.status === "duplicate" && !includeExisting) return false
      return selectedIds.has(candidate.id)
    })
  }, [includeExisting, scanResult, selectedIds])

  const startScan = async () => {
    setError(null)
    setStage("scanning")

    const permissionResult = await ensurePermissionsDetailed([
      OPTIONAL_PERMISSION_IDS.Bookmarks,
    ])

    if (!permissionResult.success) {
      setError("permission-denied")
      setStage("permission-needed")
      completeBookmarkImportActionFailure({
        failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionDenied,
        failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Permission,
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
      })
      return
    }

    const treeResult = await getBrowserBookmarkTree()
    if (!treeResult.success) {
      setError(
        treeResult.reason === "unavailable" ? "api-unavailable" : "read-failed",
      )
      setStage("permission-needed")
      completeBookmarkImportActionFailure({
        failureReason:
          treeResult.reason === "unavailable"
            ? PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionUnavailable
            : PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
        failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
        errorCategory:
          treeResult.reason === "unavailable"
            ? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported
            : PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      return
    }

    if (treeResult.tree.length === 0) {
      setError("empty")
      setStage("review")
      setScanResult({ candidates: [], ignoredCounts: {
        folder: 0,
        malformed: 0,
        nonWeb: 0,
        repeatedOrigin: 0,
        unsupported: 0,
      } })
      return
    }

    const nextScan = buildBookmarkAccountImportCandidates({
      bookmarkTree: treeResult.tree,
      existingAccounts: accounts,
    })
    const defaultSelectedIds = new Set(
      nextScan.candidates
        .filter((candidate) => candidate.selectedByDefault)
        .map((candidate) => candidate.id),
    )

    setScanResult(nextScan)
    setSelectedIds(defaultSelectedIds)
    setError(nextScan.candidates.length === 0 ? "no-candidates" : null)
    setStage("review")
  }

  const toggleCandidate = (candidate: BookmarkAccountImportCandidate) => {
    if (candidate.status === "duplicate" && !includeExisting) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(candidate.id)) {
        next.delete(candidate.id)
      } else {
        next.add(candidate.id)
      }
      return next
    })
  }

  const toggleIncludeExisting = (nextValue: boolean) => {
    setIncludeExisting(nextValue)
    if (!scanResult) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const candidate of scanResult.candidates) {
        if (candidate.status !== "duplicate") continue
        if (nextValue) {
          next.add(candidate.id)
        } else {
          next.delete(candidate.id)
        }
      }
      return next
    })
  }

  const startImport = async () => {
    if (selectedCandidates.length === 0) return

    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountsFromBookmarks,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    setStage("importing")
    setProgress(null)

    const result = await runBookmarkAccountImport({
      candidates: selectedCandidates,
      onProgress: setProgress,
    })
    setRunResult(result)

    try {
      await loadAccountData()
    } catch {
      setError("reload-failed")
    }

    const scanSummary = scanResult
      ? summarizeBookmarkAccountImportScan(scanResult)
      : {
          candidateCount: selectedCandidates.length,
          duplicateCount: 0,
          ignoredCount: 0,
        }

    tracker.complete(
      result.failureCount > 0
        ? PRODUCT_ANALYTICS_RESULTS.Failure
        : PRODUCT_ANALYTICS_RESULTS.Success,
      {
        errorCategory:
          result.failureCount > 0
            ? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
            : undefined,
        insights: {
          itemCount: scanSummary.candidateCount,
          selectedCount: selectedCandidates.length,
          successCount: result.successCount,
          failureCount: result.failureCount,
          skippedCount:
            scanSummary.duplicateCount +
            Math.max(scanSummary.candidateCount - selectedCandidates.length, 0),
          warningCount: scanSummary.ignoredCount,
          failureStage:
            result.failureCount > 0
              ? PRODUCT_ANALYTICS_FAILURE_STAGES.Execute
              : undefined,
          failureReason:
            result.failureCount > 0
              ? PRODUCT_ANALYTICS_FAILURE_REASONS.PartialSuccess
              : undefined,
        },
      },
    )
    setStage("results")
  }

  return {
    stage,
    error,
    scanResult,
    includeExisting,
    selectedIds,
    selectedCandidates,
    progress,
    runResult,
    startScan,
    startImport,
    toggleCandidate,
    toggleIncludeExisting,
  }
}
```

- [ ] **Step 5: Implement dialog UI**

Create `src/features/AccountManagement/components/BookmarkAccountImportDialog/index.tsx`:

```tsx
import { DialogTitle } from "@headlessui/react"
import { BookmarkPlus, ExternalLink, Import, ListChecks } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Alert } from "~/components/ui/Alert"
import { Badge } from "~/components/ui/badge"
import { Button, Checkbox, Modal } from "~/components/ui"
import { useBookmarkAccountImportDialog } from "~/features/AccountManagement/bookmarkImport/useBookmarkAccountImportDialog"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"

interface BookmarkAccountImportDialogProps {
  isOpen: boolean
  onClose: () => void
}

export default function BookmarkAccountImportDialog({
  isOpen,
  onClose,
}: BookmarkAccountImportDialogProps) {
  const { t } = useTranslation(["ui", "account", "common"])
  const { accounts, loadAccountData } = useAccountDataContext()
  const { openAddAccount } = useDialogStateContext()
  const flow = useBookmarkAccountImportDialog({ accounts, loadAccountData })
  const isWorking = flow.stage === "scanning" || flow.stage === "importing"

  return (
    <Modal
      isOpen={isOpen}
      onClose={isWorking ? () => {} : onClose}
      closeOnBackdropClick={!isWorking}
      closeOnEsc={!isWorking}
      showCloseButton={!isWorking}
      size="lg"
      header={
        <div className="flex min-w-0 flex-col gap-1 pr-8">
          <div className="flex items-center gap-2">
            <BookmarkPlus className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <DialogTitle className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
              {t("ui:dialog.bookmarkAccountImport.title")}
            </DialogTitle>
          </div>
          <p className="dark:text-dark-text-secondary text-sm text-gray-500">
            {t("ui:dialog.bookmarkAccountImport.description")}
          </p>
        </div>
      }
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isWorking}>
            {t("common:actions.close")}
          </Button>
          {flow.stage === "review" && (
            <Button
              type="button"
              onClick={() => void flow.startImport()}
              disabled={flow.selectedCandidates.length === 0}
              leftIcon={<Import className="h-4 w-4" />}
              data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportImportButton}
            >
              {t("ui:dialog.bookmarkAccountImport.actions.importSelected", {
                count: flow.selectedCandidates.length,
              })}
            </Button>
          )}
        </div>
      }
    >
      <div
        className="space-y-4"
        data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportDialog}
      >
        {flow.stage === "permission-needed" && (
          <div className="space-y-4">
            <Alert
              variant={flow.error ? "warning" : "info"}
              description={
                flow.error === "permission-denied"
                  ? t("ui:dialog.bookmarkAccountImport.permissionDenied")
                  : flow.error === "api-unavailable"
                    ? t("ui:dialog.bookmarkAccountImport.apiUnavailable")
                    : flow.error === "read-failed"
                      ? t("ui:dialog.bookmarkAccountImport.readFailed")
                      : t("ui:dialog.bookmarkAccountImport.permissionNeeded")
              }
            />
            <Button
              type="button"
              onClick={() => void flow.startScan()}
              leftIcon={<ListChecks className="h-4 w-4" />}
              data-testid={
                ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton
              }
            >
              {t("ui:dialog.bookmarkAccountImport.actions.allowAndScan")}
            </Button>
          </div>
        )}

        {flow.stage === "scanning" && (
          <Alert
            variant="info"
            description={t("ui:dialog.bookmarkAccountImport.scanning")}
          />
        )}

        {flow.stage === "review" && flow.scanResult && (
          <div className="space-y-4">
            {flow.error === "empty" && (
              <Alert
                variant="info"
                description={t("ui:dialog.bookmarkAccountImport.empty")}
              />
            )}
            {flow.error === "no-candidates" && (
              <Alert
                variant="warning"
                description={t("ui:dialog.bookmarkAccountImport.noCandidates")}
              />
            )}

            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={flow.includeExisting}
                onCheckedChange={(checked) =>
                  flow.toggleIncludeExisting(checked === true)
                }
                data-testid={
                  ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportIncludeExistingCheckbox
                }
              />
              <span>{t("ui:dialog.bookmarkAccountImport.includeExisting")}</span>
            </label>

            <ul className="max-h-[50vh] space-y-2 overflow-auto">
              {flow.scanResult.candidates.map((candidate) => {
                const disabled =
                  candidate.status === "duplicate" && !flow.includeExisting
                return (
                  <li
                    key={candidate.id}
                    className="dark:border-dark-bg-tertiary rounded-md border border-gray-200 p-3"
                    data-testid={
                      ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportCandidateRow
                    }
                  >
                    <label className="flex min-w-0 items-start gap-3">
                      <Checkbox
                        checked={flow.selectedIds.has(candidate.id)}
                        disabled={disabled}
                        onCheckedChange={() => flow.toggleCandidate(candidate)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {candidate.url}
                        </span>
                        <span className="dark:text-dark-text-tertiary text-xs text-gray-500">
                          {candidate.status === "duplicate"
                            ? t("ui:dialog.bookmarkAccountImport.status.duplicate", {
                                count: candidate.existingAccountCount ?? 0,
                              })
                            : t("ui:dialog.bookmarkAccountImport.status.ready")}
                        </span>
                      </span>
                      <Badge variant={candidate.status === "ready" ? "success" : "warning"}>
                        {candidate.sourceBookmarkCount}
                      </Badge>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {flow.stage === "importing" && (
          <Alert
            variant="info"
            description={t("ui:dialog.bookmarkAccountImport.importing", {
              completed: flow.progress?.completedCount ?? 0,
              total: flow.progress?.totalCount ?? flow.selectedCandidates.length,
            })}
          />
        )}

        {flow.stage === "results" && flow.runResult && (
          <div className="space-y-4">
            <Alert
              variant={flow.runResult.failureCount > 0 ? "warning" : "success"}
              description={t("ui:dialog.bookmarkAccountImport.resultSummary", {
                success: flow.runResult.successCount,
                failed: flow.runResult.failureCount,
                skipped: flow.runResult.skippedCount,
              })}
            />
            <ul className="max-h-[50vh] space-y-2 overflow-auto">
              {flow.runResult.rows.map((row) => (
                <li
                  key={row.candidateId}
                  className="dark:border-dark-bg-tertiary rounded-md border border-gray-200 p-3"
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{row.url}</div>
                      <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                        {row.status === "success"
                          ? t("ui:dialog.bookmarkAccountImport.status.imported")
                          : t(row.safeMessageKey)}
                      </div>
                    </div>
                    {row.status === "failed" && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        leftIcon={<ExternalLink className="h-4 w-4" />}
                        data-testid={
                          ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportOpenFailedAddAccountButton
                        }
                        onClick={() =>
                          openAddAccount({
                            source: "bookmark-import",
                            siteUrl: row.url,
                          })
                        }
                      >
                        {t("ui:dialog.bookmarkAccountImport.actions.openAddAccount")}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 5: Add dialog locale copy**

Add this key shape under `dialog` in each `src/locales/*/ui.json`.

For `src/locales/en/ui.json`:

```json
"bookmarkAccountImport": {
  "actions": {
    "allowAndScan": "Allow and scan",
    "importSelected": "Import selected ({{count}})",
    "openAddAccount": "Open Add Account"
  },
  "apiUnavailable": "This browser does not expose native bookmarks to the extension.",
  "description": "Scan browser bookmark URLs and review account-site candidates before importing.",
  "empty": "No browser bookmarks were returned.",
  "failures": {
    "detection": "Auto-detect could not read this site.",
    "save": "The account could not be saved.",
    "unknown": "The import failed."
  },
  "importing": "Importing {{completed}} of {{total}} selected sites...",
  "includeExisting": "Include sites that already have saved accounts",
  "noCandidates": "No importable web bookmark URLs were found.",
  "permissionDenied": "Bookmark permission was not granted. You can try again without closing this dialog.",
  "permissionNeeded": "Bookmark access is optional and is requested only for this import.",
  "readFailed": "The browser bookmark tree could not be read.",
  "resultSummary": "Imported {{success}}, failed {{failed}}, skipped {{skipped}}.",
  "scanning": "Scanning browser bookmarks...",
  "status": {
    "duplicate": "Skipped by default because {{count}} saved account already uses this site.",
    "imported": "Imported",
    "ready": "Ready to import"
  },
  "title": "Import accounts from bookmarks"
}
```

Translate the same key shape in `zh-CN`, `zh-TW`, `ja`, and `vi`. Keep the keys identical across locales.

- [ ] **Step 6: Run dialog tests**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/components/BookmarkAccountImportDialog.test.tsx
```

Expected: pass after fixing any TypeScript issues from the controller hook.

- [ ] **Step 7: Commit dialog flow**

Run:

```bash
git add src/features/AccountManagement/bookmarkImport/useBookmarkAccountImportDialog.ts src/features/AccountManagement/components/BookmarkAccountImportDialog/index.tsx src/features/AccountManagement/testIds.ts src/locales/en/ui.json src/locales/ja/ui.json src/locales/zh-CN/ui.json src/locales/zh-TW/ui.json src/locales/vi/ui.json tests/features/AccountManagement/components/BookmarkAccountImportDialog.test.tsx
git commit -m "feat(account): add bookmark import dialog"
```

## Task 6: Account Management Entry Point and Add Account Prefill

**Files:**
- Modify: `src/features/AccountManagement/AccountManagement.tsx`
- Modify: `src/features/AccountManagement/sponsors/types.ts`
- Modify: `src/features/AccountManagement/sponsors/pendingAddAccountIntent.ts`
- Modify: `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
- Modify: `src/features/AccountManagement/hooks/DialogStateContext.tsx`
- Modify locale files under `src/locales/*/account.json`
- Test: `tests/features/AccountManagement/AccountManagement.bookmarkImport.test.tsx`
- Test: `tests/features/AccountManagement/hooks/useAccountDialog.bookmarkImportPrefill.test.tsx`

- [ ] **Step 1: Add failing Account Management button test**

Create `tests/features/AccountManagement/AccountManagement.bookmarkImport.test.tsx`:

```tsx
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AccountManagement from "~/features/AccountManagement/AccountManagement"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

const openAddAccountMock = vi.fn()

vi.mock("~/features/AccountManagement/hooks/AccountManagementProvider", () => ({
  AccountManagementProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock("~/features/AccountManagement/hooks/DialogStateContext", () => ({
  useDialogStateContext: () => ({
    openAddAccount: openAddAccountMock,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    displayData: [],
    isRefreshing: false,
    isRefreshingDisabledAccounts: false,
    handleRefresh: vi.fn(),
    handleRefreshDisabledAccounts: vi.fn(),
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountActionsContext", () => ({
  useAccountActionsContext: () => ({
    handleOpenExternalCheckIns: vi.fn(),
  }),
}))

vi.mock("~/features/AccountManagement/components/AccountList", () => ({
  default: () => <div>AccountList</div>,
}))

vi.mock("~/features/AccountManagement/components/DedupeAccountsDialog", () => ({
  default: () => null,
}))

vi.mock(
  "~/features/AccountManagement/components/BookmarkAccountImportDialog",
  () => ({
    default: ({ isOpen }: { isOpen: boolean }) =>
      isOpen ? <div>BookmarkAccountImportDialog</div> : null,
  }),
)

describe("AccountManagement bookmark import entry", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("opens the bookmark import dialog from the header action", async () => {
    render(<AccountManagement />)

    const button = await screen.findByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportButton,
    )
    expect(button).toHaveTextContent("account:actions.importFromBookmarks")
    expect(button).toHaveAttribute(
      "data-analytics-action-id",
      PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountsFromBookmarks,
    )
    expect(button).toHaveAttribute(
      "data-analytics-feature-id",
      PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
    )
    expect(button).toHaveAttribute(
      "data-analytics-surface-id",
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementHeader,
    )
    expect(button).toHaveAttribute(
      "data-analytics-entrypoint",
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    )

    fireEvent.click(button)

    expect(await screen.findByText("BookmarkAccountImportDialog")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Add failing bookmark-import prefill test**

Create `tests/features/AccountManagement/hooks/useAccountDialog.bookmarkImportPrefill.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { ACCOUNT_DIALOG_FORM_SOURCES } from "~/features/AccountManagement/components/AccountDialog/models"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { SITE_TYPES } from "~/constants/siteType"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    warnOnDuplicateAccountAdd: true,
    managedSiteType: "new-api",
    autoFillCurrentSiteUrlOnAccountAdd: false,
    autoProvisionKeyOnAccountAdd: false,
    updateWarnOnDuplicateAccountAdd: vi.fn(),
  }),
}))

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  useChannelDialog: () => ({
    openChannelDialog: vi.fn(),
  }),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getActiveTabs: vi.fn().mockResolvedValue([]),
    getAllTabs: vi.fn().mockResolvedValue([]),
    onTabActivated: vi.fn(() => vi.fn()),
    onTabUpdated: vi.fn(() => vi.fn()),
    sendRuntimeMessage: vi.fn(),
    sendTabMessage: vi.fn(),
  }
})

describe("useAccountDialog bookmark import prefill", () => {
  it("uses bookmark-import prefill as a URL-only add-account entry state", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        prefill: {
          source: "bookmark-import",
          siteUrl: "https://prefill.example.invalid/path",
        },
        onClose: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://prefill.example.invalid")
    })
    expect(result.current.state.formSource).toBe(
      ACCOUNT_DIALOG_FORM_SOURCES.BOOKMARK_IMPORT,
    )
    expect(result.current.state.siteType).toBe(SITE_TYPES.UNKNOWN)
  })
})
```

- [ ] **Step 3: Run the entry and prefill tests and confirm failure**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/AccountManagement.bookmarkImport.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.bookmarkImportPrefill.test.tsx
```

Expected: fail because the button and prefill source do not exist.

- [ ] **Step 4: Generalize Add Account prefill**

In `src/features/AccountManagement/sponsors/types.ts`, add:

```ts
export const BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE =
  "bookmark-import" as const
```

Replace `AddAccountPrefill` with:

```ts
export type AddAccountPrefill =
  | {
      source: typeof SPONSOR_ADD_ACCOUNT_PREFILL_SOURCE
      sponsorId: string
      siteType: AccountSiteType
      siteUrl: string
      authType?: AuthTypeEnum
    }
  | {
      source: typeof BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE
      siteUrl: string
      siteType?: AccountSiteType
      authType?: AuthTypeEnum
    }
```

In `src/features/AccountManagement/components/AccountDialog/models.ts`, add:

```ts
  BOOKMARK_IMPORT: "bookmark-import",
```

to `ACCOUNT_DIALOG_FORM_SOURCES`.

In `src/features/AccountManagement/sponsors/pendingAddAccountIntent.ts`, keep public sponsor helper names but update `normalizeSponsorAddAccountPrefillPayload`:

```ts
  if (value.source === BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE) {
    if (typeof value.siteUrl !== "string") return null
    const normalizedAuthType = normalizeOptionalAccountAuthType(value.authType)
    if (normalizedAuthType === false) return null
    const siteType =
      isAccountSiteType(value.siteType) && value.siteType !== SITE_TYPES.UNKNOWN
        ? value.siteType
        : SITE_TYPES.UNKNOWN

    try {
      const url = new URL(value.siteUrl)
      if (url.protocol !== "https:" && url.protocol !== "http:") return null
      return {
        source: BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE,
        siteUrl: url.origin,
        ...(siteType !== SITE_TYPES.UNKNOWN ? { siteType } : {}),
        ...(normalizedAuthType ? { authType: normalizedAuthType } : {}),
      }
    } catch {
      return null
    }
  }

  if (value.source !== SPONSOR_ADD_ACCOUNT_PREFILL_SOURCE) return null
```

Update imports to include `BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE`.

- [ ] **Step 5: Consume bookmark-import prefill in Account Dialog**

In `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`, where sponsor prefill is normalized, accept the new source. The reset path should set:

```ts
setUrl(normalizedPrefill?.siteUrl ?? "")
setDraft({
  ...createEmptyAccountDialogDraft(),
  siteType: normalizedPrefill?.siteType ?? SITE_TYPES.UNKNOWN,
  authType: normalizedPrefill?.authType ?? AuthTypeEnum.AccessToken,
})
setFormSource(
  normalizedPrefill?.source === "bookmark-import"
    ? ACCOUNT_DIALOG_FORM_SOURCES.BOOKMARK_IMPORT
    : normalizedPrefill
      ? ACCOUNT_DIALOG_FORM_SOURCES.SPONSOR
      : nextFlowState.formSource,
)
```

Do not require `sponsorId` for bookmark-import prefill.

- [ ] **Step 6: Add Account Management header button**

In `src/features/AccountManagement/AccountManagement.tsx`, import:

```ts
import BookmarkAccountImportDialog from "~/features/AccountManagement/components/BookmarkAccountImportDialog"
import { BookmarkPlus } from "lucide-react"
```

Add state:

```ts
  const [isBookmarkImportDialogOpen, setIsBookmarkImportDialogOpen] =
    useState(false)
```

Add the header action before the duplicate scan button:

```tsx
              <Button
                onClick={() => setIsBookmarkImportDialogOpen(true)}
                variant="secondary"
                leftIcon={<BookmarkPlus className="h-4 w-4" />}
                title={t("account:actions.importFromBookmarksHint")}
                data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportButton}
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountsFromBookmarks
                }
              >
                {t("account:actions.importFromBookmarks")}
              </Button>
```

Mount the dialog next to `DedupeAccountsDialog`:

```tsx
      <BookmarkAccountImportDialog
        isOpen={isBookmarkImportDialogOpen}
        onClose={() => setIsBookmarkImportDialogOpen(false)}
      />
```

- [ ] **Step 7: Add account locale copy**

Add to `actions` in each `src/locales/*/account.json`.

For `src/locales/en/account.json`:

```json
"importFromBookmarks": "Import from bookmarks",
"importFromBookmarksHint": "Scan browser bookmarks for account sites"
```

For `src/locales/zh-CN/account.json`:

```json
"importFromBookmarks": "从书签导入",
"importFromBookmarksHint": "扫描浏览器书签中的账号站点"
```

For `src/locales/zh-TW/account.json`:

```json
"importFromBookmarks": "從書籤匯入",
"importFromBookmarksHint": "掃描瀏覽器書籤中的帳號站點"
```

For `src/locales/ja/account.json`:

```json
"importFromBookmarks": "ブックマークからインポート",
"importFromBookmarksHint": "ブラウザのブックマークからアカウントサイトをスキャン"
```

For `src/locales/vi/account.json`:

```json
"importFromBookmarks": "Nhap tu dau trang",
"importFromBookmarksHint": "Quet dau trang trinh duyet de tim trang tai khoan"
```

- [ ] **Step 8: Run entry and prefill tests**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/AccountManagement.bookmarkImport.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.bookmarkImportPrefill.test.tsx
```

Expected: pass.

- [ ] **Step 9: Commit entry point and prefill**

Run:

```bash
git add src/features/AccountManagement/AccountManagement.tsx src/features/AccountManagement/sponsors/types.ts src/features/AccountManagement/sponsors/pendingAddAccountIntent.ts src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts src/features/AccountManagement/components/AccountDialog/models.ts src/features/AccountManagement/hooks/DialogStateContext.tsx src/locales/en/account.json src/locales/ja/account.json src/locales/zh-CN/account.json src/locales/zh-TW/account.json src/locales/vi/account.json tests/features/AccountManagement/AccountManagement.bookmarkImport.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.bookmarkImportPrefill.test.tsx
git commit -m "feat(account): open bookmark import from account management"
```

## Task 7: Telemetry Privacy Tests

**Files:**
- Modify: `src/services/productAnalytics/events.ts`
- Modify: `tests/services/productAnalytics/privacy.test.ts`
- Test: `tests/services/productAnalytics/privacy.test.ts`

- [ ] **Step 1: Add failing privacy sanitizer tests**

Append to `tests/services/productAnalytics/privacy.test.ts`:

```ts
it("keeps bookmark import action counts and drops bookmark/account details", () => {
  const sanitized = sanitizeProductAnalyticsEvent(
    PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
    {
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountsFromBookmarks,
      surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      error_category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      failure_stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      failure_reason: PRODUCT_ANALYTICS_FAILURE_REASONS.PartialSuccess,
      item_count: 3,
      selected_count: 2,
      success_count: 1,
      failure_count: 1,
      skipped_count: 1,
      warning_count: 4,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      bookmark_url: "https://private.example.invalid/path",
      bookmark_title: "Private bookmark",
      host: "private.example.invalid",
      account_id: "account-private",
      backend_message: "private backend detail",
      stack: "Error stack",
    },
  )

  expect(sanitized).toEqual({
    feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
    action_id: PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountsFromBookmarks,
    surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
    result: PRODUCT_ANALYTICS_RESULTS.Failure,
    error_category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    failure_stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
    failure_reason: PRODUCT_ANALYTICS_FAILURE_REASONS.PartialSuccess,
    item_count: 3,
    selected_count: 2,
    success_count: 1,
    failure_count: 1,
    skipped_count: 1,
    warning_count: 4,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
})

it("allows bookmarks permission result telemetry without allowing raw bookmark fields", () => {
  expect(
    sanitizeProductAnalyticsEvent(PRODUCT_ANALYTICS_EVENTS.PermissionResult, {
      permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.Bookmarks,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
      outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.Granted,
      was_granted_before: false,
      was_granted_after: true,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      bookmark_url: "https://private.example.invalid",
    }),
  ).toEqual({
    permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.Bookmarks,
    result: PRODUCT_ANALYTICS_RESULTS.Success,
    operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
    outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.Granted,
    was_granted_before: false,
    was_granted_after: true,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
})
```

- [ ] **Step 2: Run privacy tests and confirm failure**

Run:

```bash
pnpm vitest --run tests/services/productAnalytics/privacy.test.ts
```

Expected: fail until `ImportAccountsFromBookmarks` and `Bookmarks` enums exist.

- [ ] **Step 3: Add action enum**

In `src/services/productAnalytics/events.ts`, add:

```ts
  ImportAccountsFromBookmarks: "import_accounts_from_bookmarks",
```

inside `PRODUCT_ANALYTICS_ACTION_IDS`.

`PRODUCT_ANALYTICS_PERMISSION_IDS.Bookmarks` was added in Task 1. If Task 1 has not landed in this branch, add it here too.

- [ ] **Step 4: Run privacy tests**

Run:

```bash
pnpm vitest --run tests/services/productAnalytics/privacy.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit telemetry privacy coverage**

Run:

```bash
git add src/services/productAnalytics/events.ts tests/services/productAnalytics/privacy.test.ts
git commit -m "feat(analytics): track bookmark import counts"
```

## Task 8: Focused Validation and Handoff

**Files:**
- Verify all task-scoped files from Tasks 1-7.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm vitest --run tests/services/permissions/permissionManager.test.ts tests/entrypoints/options/PermissionSettings.test.tsx tests/features/OptionsOverview/PermissionOnboardingDialog.languageSelection.test.tsx tests/features/BasicSettings/Permissions.search.test.ts tests/services/productAnalytics/privacy.test.ts tests/utils/browserApi.test.ts tests/features/AccountManagement/bookmarkImport/candidates.test.ts tests/features/AccountManagement/bookmarkImport/importAccounts.test.ts tests/features/AccountManagement/components/BookmarkAccountImportDialog.test.tsx tests/features/AccountManagement/AccountManagement.bookmarkImport.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.bookmarkImportPrefill.test.tsx
```

Expected: pass.

- [ ] **Step 2: Run i18n extraction check**

Run:

```bash
pnpm run i18n:extract:ci
```

Expected: pass. If it reports updates, run:

```bash
pnpm run i18n:extract
```

Then inspect locale diffs and include only intended `account`, `settings`, or `ui` key-shape changes.

- [ ] **Step 3: Run TypeScript compile**

Run:

```bash
pnpm compile
```

Expected: pass.

- [ ] **Step 4: Stage task-scoped files and run commit gate**

Run:

```bash
git status --porcelain
git add wxt.config.ts src/services/permissions/permissionManager.ts src/services/permissions/permissionDisplay.ts src/features/BasicSettings/components/tabs/Permissions/PermissionSettings.tsx src/features/OptionsOverview/components/dialogs/PermissionOnboardingDialog.tsx src/features/BasicSettings/components/tabs/Permissions/Permissions.search.ts src/services/productAnalytics/events.ts src/utils/browser/browserApi.ts src/features/AccountManagement/bookmarkImport src/features/AccountManagement/components/BookmarkAccountImportDialog src/features/AccountManagement/AccountManagement.tsx src/features/AccountManagement/testIds.ts src/features/AccountManagement/sponsors/types.ts src/features/AccountManagement/sponsors/pendingAddAccountIntent.ts src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts src/features/AccountManagement/components/AccountDialog/models.ts src/features/AccountManagement/hooks/DialogStateContext.tsx src/locales/en/account.json src/locales/en/settings.json src/locales/en/ui.json src/locales/ja/account.json src/locales/ja/settings.json src/locales/ja/ui.json src/locales/zh-CN/account.json src/locales/zh-CN/settings.json src/locales/zh-CN/ui.json src/locales/zh-TW/account.json src/locales/zh-TW/settings.json src/locales/zh-TW/ui.json src/locales/vi/account.json src/locales/vi/settings.json src/locales/vi/ui.json tests/services/permissions/permissionManager.test.ts tests/entrypoints/options/PermissionSettings.test.tsx tests/features/OptionsOverview/PermissionOnboardingDialog.languageSelection.test.tsx tests/features/BasicSettings/Permissions.search.test.ts tests/services/productAnalytics/privacy.test.ts tests/utils/browserApi.test.ts tests/features/AccountManagement/bookmarkImport/candidates.test.ts tests/features/AccountManagement/bookmarkImport/importAccounts.test.ts tests/features/AccountManagement/components/BookmarkAccountImportDialog.test.tsx tests/features/AccountManagement/AccountManagement.bookmarkImport.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.bookmarkImportPrefill.test.tsx
pnpm run validate:staged
```

Expected: pass. If hooks modify files, inspect `git diff --staged` before retrying.

- [ ] **Step 5: Run pre-push gate**

Run:

```bash
pnpm run validate:push
```

Expected: pass because this change touches manifest permissions, browser wrappers, product analytics contracts, account import behavior, and TypeScript exports.

- [ ] **Step 6: Commit final integration if earlier tasks were not committed one-by-one**

If the implementation was batched instead of task-committed, run:

```bash
git commit -m "feat(account): import accounts from browser bookmarks"
```

Expected: one isolated task-scoped commit.

- [ ] **Step 7: E2E decision**

Do not add Playwright E2E for v1 unless the existing harness can deterministically seed native browser bookmarks and grant the `bookmarks` optional permission. The planned Vitest and React Testing Library coverage is the right layer for permission outcomes, wrapper behavior, candidate classification, review selection, sequential import, failed-row recovery, and telemetry privacy.

- [ ] **Step 8: Final diff inspection**

Run:

```bash
git status --porcelain
git diff --stat HEAD
git log --oneline -8
```

Expected:

- task-scoped files only;
- no changes to app-owned Site Bookmarks storage or bookmark management flows except the pre-existing sponsor fallback helpers if already present;
- no telemetry field containing bookmark URLs, hosts, titles, account IDs, backend messages, raw errors, or stack traces;
- no real bookmark URLs or real account names in tests;
- `bookmarks` appears only in optional permission plumbing, not required manifest permissions.

- [ ] **Step 9: Handoff**

Report:

- commit hash or hashes;
- focused tests, `i18n:extract:ci`, `compile`, `validate:staged`, and `validate:push` results;
- E2E decision from Step 7;
- any environment blocker, if validation could not run;
- any unrelated local files left untouched.
