# Product Risk Announcements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-controlled remote product risk announcement channel with a fixed announcement icon, local seen/dismissed state, and a focused Overview risk banner.

**Architecture:** Add an independent `productAnnouncements` service domain with bundled JSON, best-effort remote refresh, local extension storage, typed runtime messaging, and selector-driven presentation models. UI entrypoints consume sanitized state through typed messages: Options gets the persistent header popover plus Overview banner, while Popup gets only a compact high-risk entry point.

**Tech Stack:** TypeScript, React, WXT, `@plasmohq/storage`, `@webext-core/messaging`, Radix Popover, existing `IconButton`/`Badge` primitives, Vitest, Testing Library, i18next extraction.

---

## File Structure

- Create `public/product-announcements.json`
  - Bundled fallback feed. Start with schema version 1 and an empty `announcements` array.
- Create `src/services/productAnnouncements/types.ts`
  - Own raw feed types, normalized notice types, severity constants, state shape, and presentation list types.
- Create `src/services/productAnnouncements/constants.ts`
  - Own schema version, bundled/remote URL constants, refresh interval, locale fallbacks, and alarm name.
- Create `src/services/productAnnouncements/versionRange.ts`
  - Parse and evaluate simple semver-like ranges such as `>=3.44.0 <3.44.1`.
- Create `src/services/productAnnouncements/urlPolicy.ts`
  - Validate CTA URLs against the project allow-list.
- Create `src/services/productAnnouncements/catalog.ts`
  - Validate remote/bundled feed payloads, apply locale fallback, filter by version/time/dismissal, sort active notices, and produce UI-ready notices.
- Modify `src/services/core/storageKeys.ts`
  - Add product announcement storage key and lock.
- Create `src/services/productAnnouncements/storage.ts`
  - Persist state, cached feed, seen timestamps, and dismissed revisions.
- Create `src/services/productAnnouncements/service.ts`
  - Load cached notices immediately, refresh stale remote feed in the background, reconcile the refresh alarm, and expose mark-seen/dismiss APIs.
- Create `src/services/productAnnouncements/messaging.ts`
  - Define typed runtime messages for `getState`, `refresh`, `markSeen`, and `dismiss`.
- Modify `src/services/runtimeMessaging/messageTypes.ts`
  - Add `ProductAnnouncementsMessageTypes`.
- Modify `src/entrypoints/background/runtimeMessages.ts`
  - Register product announcement typed message listeners.
- Modify `src/entrypoints/background/servicesInit.ts`
  - Initialize product announcement refresh alarm with the other alarm-backed services.
- Create `src/features/ProductAnnouncements/hooks/useProductAnnouncements.ts`
  - React hook for Options/Popup surfaces.
- Create `src/features/ProductAnnouncements/ProductAnnouncementButton.tsx`
  - Fixed icon button with unread badge and popover.
- Create `src/features/ProductAnnouncements/ProductAnnouncementPopover.tsx`
  - Current notice list with Active/Dismissed filters, empty states, CTA, and dismiss action.
- Create `src/features/ProductAnnouncements/ProductAnnouncementBanner.tsx`
  - Compact Overview risk banner for the highest-priority active `critical`/`warning` notice.
- Create `src/features/ProductAnnouncements/ProductAnnouncementList.tsx`
  - Shared list rendering used by the popover.
- Create `src/features/ProductAnnouncements/testIds.ts`
  - Stable selectors for critical controls and lists.
- Modify `src/entrypoints/options/components/Header.tsx`
  - Add the fixed product announcement entry to the right-side header utility group.
- Modify `src/features/OptionsOverview/OptionsOverview.tsx`
  - Render the risk banner above the Overview grid.
- Modify `src/entrypoints/popup/components/HeaderSection.tsx`
  - Add compact product announcement entry only when active `critical`/`warning` notices exist.
- Modify `src/services/productAnalytics/events.ts`
  - Add product announcement feature/action/surface enums and controlled severity/action-kind values.
- Modify `src/services/productAnalytics/privacy.ts`
  - Allow only safe product announcement analytics fields.
- Add locale namespace files:
  - `src/locales/zh-CN/productAnnouncements.json`
  - `src/locales/en/productAnnouncements.json`
  - `src/locales/ja/productAnnouncements.json`
  - `src/locales/zh-TW/productAnnouncements.json`
  - `src/locales/vi/productAnnouncements.json`
- Create or modify tests:
  - `tests/services/productAnnouncements/versionRange.test.ts`
  - `tests/services/productAnnouncements/urlPolicy.test.ts`
  - `tests/services/productAnnouncements/catalog.test.ts`
  - `tests/services/productAnnouncements/storage.test.ts`
  - `tests/services/productAnnouncements/service.test.ts`
  - `tests/services/productAnnouncements/messaging.test.ts`
  - `tests/features/ProductAnnouncements/ProductAnnouncementButton.test.tsx`
  - `tests/features/ProductAnnouncements/ProductAnnouncementBanner.test.tsx`
  - `tests/entrypoints/options/Header.productAnnouncements.test.tsx`
  - `tests/entrypoints/popup/HeaderSection.productAnnouncements.test.tsx`
  - `tests/services/productAnalytics/privacy.test.ts`

## Task 1: Feed Contracts, Version Ranges, And URL Policy

**Files:**
- Create: `public/product-announcements.json`
- Create: `src/services/productAnnouncements/types.ts`
- Create: `src/services/productAnnouncements/constants.ts`
- Create: `src/services/productAnnouncements/versionRange.ts`
- Create: `src/services/productAnnouncements/urlPolicy.ts`
- Test: `tests/services/productAnnouncements/versionRange.test.ts`
- Test: `tests/services/productAnnouncements/urlPolicy.test.ts`

- [ ] **Step 1: Add the bundled empty feed**

Create `public/product-announcements.json`:

```json
{
  "schemaVersion": 1,
  "defaultLocale": "zh-CN",
  "announcements": []
}
```

- [ ] **Step 2: Write failing version range tests**

Create `tests/services/productAnnouncements/versionRange.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { isVersionInRange } from "~/services/productAnnouncements/versionRange"

describe("product announcement version ranges", () => {
  it("matches bounded semver-like ranges", () => {
    expect(isVersionInRange("3.44.0", ">=3.44.0 <3.44.1")).toBe(true)
    expect(isVersionInRange("3.44.0.1", ">=3.44.0 <3.44.1")).toBe(true)
    expect(isVersionInRange("3.44.1", ">=3.44.0 <3.44.1")).toBe(false)
    expect(isVersionInRange("3.43.9", ">=3.44.0 <3.44.1")).toBe(false)
  })

  it("supports exact and wildcard ranges", () => {
    expect(isVersionInRange("3.44.0", "3.44.0")).toBe(true)
    expect(isVersionInRange("3.44.1", "3.44.0")).toBe(false)
    expect(isVersionInRange("3.44.1", "*")).toBe(true)
  })

  it("fails closed for invalid ranges or versions", () => {
    expect(isVersionInRange("dev", ">=3.44.0")).toBe(false)
    expect(isVersionInRange("3.44.0", "=>3.44.0")).toBe(false)
    expect(isVersionInRange("3.44.0", "")).toBe(false)
  })
})
```

- [ ] **Step 3: Write failing URL policy tests**

Create `tests/services/productAnnouncements/urlPolicy.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { sanitizeProductAnnouncementCta } from "~/services/productAnnouncements/urlPolicy"

describe("product announcement CTA URL policy", () => {
  it("keeps project-owned and GitHub release links", () => {
    expect(
      sanitizeProductAnnouncementCta({
        label: "View release",
        url: "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.44.1",
      }),
    ).toEqual({
      label: "View release",
      url: "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.44.1",
    })

    expect(
      sanitizeProductAnnouncementCta({
        label: "Read docs",
        url: "https://all-api-hub.qixing1217.top/changelog.html",
      }),
    ).toEqual({
      label: "Read docs",
      url: "https://all-api-hub.qixing1217.top/changelog.html",
    })
  })

  it("drops unsafe or incomplete links", () => {
    expect(
      sanitizeProductAnnouncementCta({
        label: "Run",
        url: "javascript:alert(1)",
      }),
    ).toBeNull()
    expect(
      sanitizeProductAnnouncementCta({
        label: "External",
        url: "https://evil.example.test/path",
      }),
    ).toBeNull()
    expect(sanitizeProductAnnouncementCta({ label: "", url: "https://github.com/qixing-jk/all-api-hub" })).toBeNull()
  })
})
```

- [ ] **Step 4: Run the focused tests and verify they fail**

Run:

```bash
pnpm vitest --run tests/services/productAnnouncements/versionRange.test.ts tests/services/productAnnouncements/urlPolicy.test.ts
```

Expected: FAIL because the modules do not exist yet.

- [ ] **Step 5: Add constants and types**

Create `src/services/productAnnouncements/constants.ts`:

```ts
import bundledProductAnnouncementFeed from "~~/public/product-announcements.json"

export const PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION =
  bundledProductAnnouncementFeed.schemaVersion

export const PRODUCT_ANNOUNCEMENT_REMOTE_URL =
  "https://raw.githubusercontent.com/qixing-jk/all-api-hub/main/public/product-announcements.json"

export const PRODUCT_ANNOUNCEMENT_REFRESH_ALARM =
  "productAnnouncementsRefresh"

export const PRODUCT_ANNOUNCEMENT_REFRESH_INTERVAL_MINUTES = 12 * 60

export const PRODUCT_ANNOUNCEMENT_LOCALE_FALLBACKS = [
  "zh-CN",
  "en",
] as const

export const PRODUCT_ANNOUNCEMENT_SEVERITIES = {
  Critical: "critical",
  Warning: "warning",
  Info: "info",
} as const
```

Create `src/services/productAnnouncements/types.ts`:

```ts
import type { ValueOf } from "~/types"

import { PRODUCT_ANNOUNCEMENT_SEVERITIES } from "./constants"

export type ProductAnnouncementSeverity = ValueOf<
  typeof PRODUCT_ANNOUNCEMENT_SEVERITIES
>

export interface RawProductAnnouncementCta {
  label?: unknown
  url?: unknown
}

export interface RawProductAnnouncementContent {
  title?: unknown
  message?: unknown
  cta?: RawProductAnnouncementCta
}

export interface RawProductAnnouncement {
  id?: unknown
  revision?: unknown
  severity?: unknown
  priority?: unknown
  affectedVersions?: unknown
  startsAt?: unknown
  expiresAt?: unknown
  content?: unknown
}

export interface RawProductAnnouncementFeed {
  schemaVersion?: unknown
  defaultLocale?: unknown
  announcements?: unknown
}

export interface ProductAnnouncementCta {
  label: string
  url: string
}

export interface ProductAnnouncement {
  id: string
  revision: number
  severity: ProductAnnouncementSeverity
  priority: number
  startsAt: number
  expiresAt: number
  title: string
  message: string
  cta?: ProductAnnouncementCta
  dismissed: boolean
  seen: boolean
}

export interface ProductAnnouncementState {
  schemaVersion: 1
  lastFetchedAt?: number
  cachedFeed?: RawProductAnnouncementFeed
  dismissed: Record<string, number>
  seenAt: Record<string, number>
  lastShownAt: Record<string, number>
}
```

- [ ] **Step 6: Implement version matching**

Create `src/services/productAnnouncements/versionRange.ts`:

```ts
function normalizeVersion(value: string): number[] | null {
  const normalized = value.trim().replace(/^v/i, "")
  if (!/^\d+(?:\.\d+)*$/.test(normalized)) return null
  return normalized.split(".").map((part) => Number.parseInt(part, 10))
}

function compareVersions(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index++) {
    const leftPart = left[index] ?? 0
    const rightPart = right[index] ?? 0
    if (leftPart !== rightPart) return leftPart - rightPart
  }
  return 0
}

function evaluateComparator(current: number[], token: string): boolean {
  const match = /^(>=|<=|>|<|=)?(.+)$/.exec(token.trim())
  if (!match) return false

  const operator = match[1] ?? "="
  const target = normalizeVersion(match[2])
  if (!target) return false

  const comparison = compareVersions(current, target)
  switch (operator) {
    case ">=":
      return comparison >= 0
    case "<=":
      return comparison <= 0
    case ">":
      return comparison > 0
    case "<":
      return comparison < 0
    case "=":
      return comparison === 0
    default:
      return false
  }
}

export function isVersionInRange(
  currentVersion: string,
  range: string,
): boolean {
  const trimmedRange = range.trim()
  if (!trimmedRange) return false
  if (trimmedRange === "*") return normalizeVersion(currentVersion) !== null

  const current = normalizeVersion(currentVersion)
  if (!current) return false

  return trimmedRange
    .split(/\s+/)
    .every((token) => evaluateComparator(current, token))
}
```

- [ ] **Step 7: Implement CTA policy**

Create `src/services/productAnnouncements/urlPolicy.ts`:

```ts
import type {
  ProductAnnouncementCta,
  RawProductAnnouncementCta,
} from "./types"

const ALLOWED_CTA_HOSTS = new Set([
  "github.com",
  "all-api-hub.qixing1217.top",
])

function isAllowedGithubPath(url: URL): boolean {
  return (
    url.hostname === "github.com" &&
    url.pathname.startsWith("/qixing-jk/all-api-hub/")
  )
}

function isAllowedDocsPath(url: URL): boolean {
  return url.hostname === "all-api-hub.qixing1217.top"
}

export function sanitizeProductAnnouncementCta(
  value: RawProductAnnouncementCta | undefined,
): ProductAnnouncementCta | null {
  const label = typeof value?.label === "string" ? value.label.trim() : ""
  const urlValue = typeof value?.url === "string" ? value.url.trim() : ""
  if (!label || !urlValue) return null

  let url: URL
  try {
    url = new URL(urlValue)
  } catch {
    return null
  }

  if (url.protocol !== "https:" || !ALLOWED_CTA_HOSTS.has(url.hostname)) {
    return null
  }

  if (!isAllowedGithubPath(url) && !isAllowedDocsPath(url)) {
    return null
  }

  return { label, url: url.toString() }
}
```

- [ ] **Step 8: Run the focused tests and commit**

Run:

```bash
pnpm vitest --run tests/services/productAnnouncements/versionRange.test.ts tests/services/productAnnouncements/urlPolicy.test.ts
```

Expected: PASS.

Commit:

```bash
git add public/product-announcements.json src/services/productAnnouncements/types.ts src/services/productAnnouncements/constants.ts src/services/productAnnouncements/versionRange.ts src/services/productAnnouncements/urlPolicy.ts tests/services/productAnnouncements/versionRange.test.ts tests/services/productAnnouncements/urlPolicy.test.ts
git commit -m "feat(product-announcements): add feed contracts"
```

## Task 2: Feed Normalization And Presentation Selectors

**Files:**
- Create: `src/services/productAnnouncements/catalog.ts`
- Test: `tests/services/productAnnouncements/catalog.test.ts`

- [ ] **Step 1: Write failing catalog tests**

Create `tests/services/productAnnouncements/catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION,
  PRODUCT_ANNOUNCEMENT_SEVERITIES,
} from "~/services/productAnnouncements/constants"
import {
  normalizeProductAnnouncementFeed,
  selectProductAnnouncementView,
} from "~/services/productAnnouncements/catalog"

const now = Date.parse("2026-06-06T12:00:00.000Z")
const baseFeed = {
  schemaVersion: PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION,
  defaultLocale: "zh-CN",
  announcements: [
    {
      id: "critical-risk",
      revision: 1,
      severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Critical,
      priority: 100,
      affectedVersions: ">=3.44.0 <3.44.1",
      startsAt: "2026-06-06T00:00:00.000Z",
      expiresAt: "2026-06-20T00:00:00.000Z",
      content: {
        "zh-CN": {
          title: "关键风险",
          message: "请升级到 3.44.1。",
          cta: {
            label: "查看修复说明",
            url: "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.44.1",
          },
        },
        en: {
          title: "Critical risk",
          message: "Update to 3.44.1.",
        },
      },
    },
    {
      id: "info-note",
      revision: 1,
      severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Info,
      priority: 1,
      affectedVersions: "*",
      startsAt: "2026-06-01T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z",
      content: {
        en: {
          title: "FYI",
          message: "Informational note.",
        },
      },
    },
  ],
}

describe("product announcement feed normalization", () => {
  it("filters by version and resolves localized content with fallback", () => {
    const normalized = normalizeProductAnnouncementFeed(baseFeed, {
      currentVersion: "3.44.0",
      locale: "zh-TW",
      now,
      dismissed: {},
      seenAt: {},
    })

    expect(normalized.errors).toEqual([])
    expect(normalized.notices.map((notice) => notice.id)).toEqual([
      "critical-risk",
      "info-note",
    ])
    expect(normalized.notices[0]).toMatchObject({
      title: "关键风险",
      message: "请升级到 3.44.1。",
      cta: {
        label: "查看修复说明",
        url: "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.44.1",
      },
      seen: false,
      dismissed: false,
    })
    expect(normalized.notices[1]).toMatchObject({
      title: "FYI",
      message: "Informational note.",
    })
  })

  it("keeps dismissed notices in the list while excluding them from active selectors", () => {
    const normalized = normalizeProductAnnouncementFeed(baseFeed, {
      currentVersion: "3.44.0",
      locale: "zh-CN",
      now,
      dismissed: { "critical-risk": 1 },
      seenAt: { "critical-risk": now - 1000 },
    })
    const view = selectProductAnnouncementView(normalized.notices)

    expect(normalized.notices.find((item) => item.id === "critical-risk")).toMatchObject({
      dismissed: true,
      seen: true,
    })
    expect(view.activeNotices.map((notice) => notice.id)).toEqual(["info-note"])
    expect(view.dismissedNotices.map((notice) => notice.id)).toEqual([
      "critical-risk",
    ])
    expect(view.unseenActiveCount).toBe(1)
    expect(view.primaryRiskNotice).toBeNull()
  })

  it("resurfaces higher revisions and sorts active notices by severity and priority", () => {
    const feed = {
      ...baseFeed,
      announcements: [
        ...(baseFeed.announcements as any[]),
        {
          id: "warning",
          revision: 2,
          severity: PRODUCT_ANNOUNCEMENT_SEVERITIES.Warning,
          priority: 200,
          affectedVersions: "*",
          startsAt: "2026-06-05T00:00:00.000Z",
          expiresAt: "2026-06-20T00:00:00.000Z",
          content: {
            "zh-CN": { title: "警告", message: "请注意。" },
          },
        },
      ],
    }

    const normalized = normalizeProductAnnouncementFeed(feed, {
      currentVersion: "3.44.0",
      locale: "zh-CN",
      now,
      dismissed: { warning: 1 },
      seenAt: {},
    })
    const view = selectProductAnnouncementView(normalized.notices)

    expect(view.activeNotices.map((notice) => notice.id)).toEqual([
      "critical-risk",
      "warning",
      "info-note",
    ])
    expect(view.primaryRiskNotice?.id).toBe("critical-risk")
  })
})
```

- [ ] **Step 2: Run the catalog test and verify it fails**

Run:

```bash
pnpm vitest --run tests/services/productAnnouncements/catalog.test.ts
```

Expected: FAIL because `catalog.ts` does not exist.

- [ ] **Step 3: Implement feed normalization**

Create `src/services/productAnnouncements/catalog.ts` with these exported functions:

```ts
import {
  PRODUCT_ANNOUNCEMENT_LOCALE_FALLBACKS,
  PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION,
  PRODUCT_ANNOUNCEMENT_SEVERITIES,
} from "./constants"
import { isVersionInRange } from "./versionRange"
import { sanitizeProductAnnouncementCta } from "./urlPolicy"
import type {
  ProductAnnouncement,
  ProductAnnouncementSeverity,
  RawProductAnnouncement,
  RawProductAnnouncementContent,
  RawProductAnnouncementFeed,
} from "./types"

interface NormalizeOptions {
  currentVersion: string
  locale: string
  now: number
  dismissed: Record<string, number>
  seenAt: Record<string, number>
}

export interface NormalizeProductAnnouncementResult {
  notices: ProductAnnouncement[]
  errors: string[]
}

export interface ProductAnnouncementView {
  notices: ProductAnnouncement[]
  activeNotices: ProductAnnouncement[]
  dismissedNotices: ProductAnnouncement[]
  primaryRiskNotice: ProductAnnouncement | null
  unseenActiveCount: number
}

const SEVERITY_RANK: Record<ProductAnnouncementSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

function isSeverity(value: unknown): value is ProductAnnouncementSeverity {
  return Object.values(PRODUCT_ANNOUNCEMENT_SEVERITIES).includes(
    value as ProductAnnouncementSeverity,
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null
}

function resolveLocaleKeys(locale: string, defaultLocale: string): string[] {
  const language = locale.split("-")[0]
  return [
    locale,
    language,
    ...PRODUCT_ANNOUNCEMENT_LOCALE_FALLBACKS,
    defaultLocale,
  ].filter((value, index, array) => value && array.indexOf(value) === index)
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function normalizeAnnouncement(
  value: RawProductAnnouncement,
  defaultLocale: string,
  options: NormalizeOptions,
): ProductAnnouncement | null {
  const id = typeof value.id === "string" ? value.id.trim() : ""
  const revision = typeof value.revision === "number" ? value.revision : NaN
  const severity = isSeverity(value.severity) ? value.severity : null
  const priority = typeof value.priority === "number" ? value.priority : 0
  const affectedVersions =
    typeof value.affectedVersions === "string" ? value.affectedVersions : ""
  const startsAt = parseTimestamp(value.startsAt)
  const expiresAt = parseTimestamp(value.expiresAt)
  const content = asRecord(value.content)

  if (
    !id ||
    !Number.isInteger(revision) ||
    revision < 1 ||
    !severity ||
    !startsAt ||
    !expiresAt ||
    startsAt > options.now ||
    expiresAt <= options.now ||
    !isVersionInRange(options.currentVersion, affectedVersions) ||
    !content
  ) {
    return null
  }

  const localized = resolveLocaleKeys(options.locale, defaultLocale)
    .map((key) => asRecord(content[key]) as RawProductAnnouncementContent | null)
    .find(Boolean)
  const title = typeof localized?.title === "string" ? localized.title.trim() : ""
  const message =
    typeof localized?.message === "string" ? localized.message.trim() : ""
  if (!title || !message) return null

  const dismissedRevision = options.dismissed[id]
  const dismissed =
    typeof dismissedRevision === "number" && dismissedRevision >= revision

  return {
    id,
    revision,
    severity,
    priority,
    startsAt,
    expiresAt,
    title,
    message,
    cta: sanitizeProductAnnouncementCta(localized?.cta),
    dismissed,
    seen: typeof options.seenAt[id] === "number",
  }
}

export function normalizeProductAnnouncementFeed(
  feed: RawProductAnnouncementFeed,
  options: NormalizeOptions,
): NormalizeProductAnnouncementResult {
  if (feed.schemaVersion !== PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION) {
    return { notices: [], errors: ["unsupported_schema"] }
  }

  const defaultLocale =
    typeof feed.defaultLocale === "string" && feed.defaultLocale.trim()
      ? feed.defaultLocale.trim()
      : "zh-CN"
  const announcements = Array.isArray(feed.announcements)
    ? feed.announcements
    : []

  const notices = announcements
    .map((announcement) =>
      normalizeAnnouncement(
        announcement as RawProductAnnouncement,
        defaultLocale,
        options,
      ),
    )
    .filter((notice): notice is ProductAnnouncement => Boolean(notice))
    .sort(compareProductAnnouncements)

  return { notices, errors: [] }
}

export function compareProductAnnouncements(
  left: ProductAnnouncement,
  right: ProductAnnouncement,
): number {
  return (
    SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
    right.priority - left.priority ||
    right.startsAt - left.startsAt ||
    left.id.localeCompare(right.id)
  )
}

export function selectProductAnnouncementView(
  notices: ProductAnnouncement[],
): ProductAnnouncementView {
  const activeNotices = notices.filter((notice) => !notice.dismissed)
  const dismissedNotices = notices.filter((notice) => notice.dismissed)
  const primaryRiskNotice =
    activeNotices.find(
      (notice) =>
        notice.severity === PRODUCT_ANNOUNCEMENT_SEVERITIES.Critical ||
        notice.severity === PRODUCT_ANNOUNCEMENT_SEVERITIES.Warning,
    ) ?? null

  return {
    notices,
    activeNotices,
    dismissedNotices,
    primaryRiskNotice,
    unseenActiveCount: activeNotices.filter((notice) => !notice.seen).length,
  }
}
```

- [ ] **Step 4: Run focused tests and commit**

Run:

```bash
pnpm vitest --run tests/services/productAnnouncements/catalog.test.ts tests/services/productAnnouncements/versionRange.test.ts tests/services/productAnnouncements/urlPolicy.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/services/productAnnouncements/catalog.ts tests/services/productAnnouncements/catalog.test.ts
git commit -m "feat(product-announcements): normalize feed notices"
```

## Task 3: Storage And Best-Effort Refresh Service

**Files:**
- Modify: `src/services/core/storageKeys.ts`
- Create: `src/services/productAnnouncements/storage.ts`
- Create: `src/services/productAnnouncements/service.ts`
- Test: `tests/services/productAnnouncements/storage.test.ts`
- Test: `tests/services/productAnnouncements/service.test.ts`

- [ ] **Step 1: Write failing storage tests**

Create `tests/services/productAnnouncements/storage.test.ts`:

```ts
import { Storage } from "@plasmohq/storage"
import { beforeEach, describe, expect, it } from "vitest"

import { PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION } from "~/services/productAnnouncements/constants"
import { productAnnouncementStorage } from "~/services/productAnnouncements/storage"
import { STORAGE_KEYS } from "~/services/core/storageKeys"

const storage = new Storage({ area: "local" })

describe("product announcement storage", () => {
  beforeEach(async () => {
    await storage.remove(STORAGE_KEYS.PRODUCT_ANNOUNCEMENTS_STATE)
  })

  it("returns an empty sanitized state by default", async () => {
    await expect(productAnnouncementStorage.getState()).resolves.toEqual({
      schemaVersion: 1,
      dismissed: {},
      seenAt: {},
      lastShownAt: {},
    })
  })

  it("persists cached feed, seen state, and dismissed revisions", async () => {
    await productAnnouncementStorage.updateState((state) => {
      state.lastFetchedAt = 100
      state.cachedFeed = {
        schemaVersion: PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION,
        defaultLocale: "zh-CN",
        announcements: [],
      }
      state.seenAt.notice = 200
      state.dismissed.notice = 1
    })

    await expect(productAnnouncementStorage.getState()).resolves.toMatchObject({
      lastFetchedAt: 100,
      seenAt: { notice: 200 },
      dismissed: { notice: 1 },
    })
  })
})
```

- [ ] **Step 2: Write failing service tests**

Create `tests/services/productAnnouncements/service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { productAnnouncementService } from "~/services/productAnnouncements/service"
import { productAnnouncementStorage } from "~/services/productAnnouncements/storage"

const fetchMock = vi.fn()

describe("product announcement service", () => {
  beforeEach(async () => {
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockReset()
    await productAnnouncementStorage.setState({
      schemaVersion: 1,
      dismissed: {},
      seenAt: {},
      lastShownAt: {},
    })
  })

  it("returns cached state immediately when refresh fails", async () => {
    await productAnnouncementStorage.updateState((state) => {
      state.lastFetchedAt = Date.now() - 1000
      state.cachedFeed = {
        schemaVersion: 1,
        defaultLocale: "zh-CN",
        announcements: [],
      }
    })
    fetchMock.mockRejectedValue(new Error("network failed"))

    const state = await productAnnouncementService.getCurrentState({
      locale: "zh-CN",
      currentVersion: "3.44.0",
      now: Date.parse("2026-06-06T00:00:00Z"),
    })

    expect(state.view.notices).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("marks visible notice ids as seen without dismissing them", async () => {
    await productAnnouncementService.markSeen(["notice-a"], 123)

    await expect(productAnnouncementStorage.getState()).resolves.toMatchObject({
      seenAt: { "notice-a": 123 },
      dismissed: {},
    })
  })

  it("dismisses a notice revision", async () => {
    await productAnnouncementService.dismiss("notice-a", 2)

    await expect(productAnnouncementStorage.getState()).resolves.toMatchObject({
      dismissed: { "notice-a": 2 },
    })
  })
})
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
pnpm vitest --run tests/services/productAnnouncements/storage.test.ts tests/services/productAnnouncements/service.test.ts
```

Expected: FAIL because storage/service do not exist.

- [ ] **Step 4: Add storage key and lock**

Modify `src/services/core/storageKeys.ts`:

```ts
// In STORAGE_LOCKS:
PRODUCT_ANNOUNCEMENTS: "all-api-hub:product-announcements",

// Near other private key groups:
const PRODUCT_ANNOUNCEMENTS_STORAGE_KEYS = {
  STATE: "productAnnouncements_state_v1",
} as const

// In STORAGE_KEYS:
PRODUCT_ANNOUNCEMENTS_STATE: PRODUCT_ANNOUNCEMENTS_STORAGE_KEYS.STATE,
```

- [ ] **Step 5: Implement storage**

Create `src/services/productAnnouncements/storage.ts`:

```ts
import { Storage } from "@plasmohq/storage"

import {
  STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageLock"
import { createLogger } from "~/utils/core/logger"

import type { ProductAnnouncementState } from "./types"

const logger = createLogger("ProductAnnouncementStorage")

function createEmptyState(): ProductAnnouncementState {
  return {
    schemaVersion: 1,
    dismissed: {},
    seenAt: {},
    lastShownAt: {},
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null
}

function sanitizeNumberRecord(value: unknown): Record<string, number> {
  const record = asRecord(value)
  if (!record) return {}

  return Object.fromEntries(
    Object.entries(record).filter(
      ([key, entry]) => key && typeof entry === "number",
    ),
  ) as Record<string, number>
}

function sanitizeState(value: unknown): ProductAnnouncementState {
  const record = asRecord(value)
  if (!record || record.schemaVersion !== 1) return createEmptyState()

  return {
    schemaVersion: 1,
    lastFetchedAt:
      typeof record.lastFetchedAt === "number"
        ? record.lastFetchedAt
        : undefined,
    cachedFeed: asRecord(record.cachedFeed) ?? undefined,
    dismissed: sanitizeNumberRecord(record.dismissed),
    seenAt: sanitizeNumberRecord(record.seenAt),
    lastShownAt: sanitizeNumberRecord(record.lastShownAt),
  }
}

class ProductAnnouncementStorage {
  private storage = new Storage({ area: "local" })

  async getState(): Promise<ProductAnnouncementState> {
    try {
      return sanitizeState(
        await this.storage.get(STORAGE_KEYS.PRODUCT_ANNOUNCEMENTS_STATE),
      )
    } catch (error) {
      logger.warn("Failed to read product announcement state", error)
      return createEmptyState()
    }
  }

  async setState(state: ProductAnnouncementState): Promise<void> {
    await this.storage.set(STORAGE_KEYS.PRODUCT_ANNOUNCEMENTS_STATE, state)
  }

  async updateState(
    updater: (state: ProductAnnouncementState) => void,
  ): Promise<ProductAnnouncementState> {
    return withExtensionStorageWriteLock(
      STORAGE_LOCKS.PRODUCT_ANNOUNCEMENTS,
      async () => {
        const state = await this.getState()
        updater(state)
        await this.setState(state)
        return state
      },
    )
  }
}

export const productAnnouncementStorage = new ProductAnnouncementStorage()
```

- [ ] **Step 6: Implement best-effort service**

Create `src/services/productAnnouncements/service.ts`:

```ts
import bundledFeed from "~~/public/product-announcements.json"

import {
  createAlarm,
  getAlarm,
  getManifest,
  onAlarm,
} from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"

import {
  normalizeProductAnnouncementFeed,
  selectProductAnnouncementView,
  type ProductAnnouncementView,
} from "./catalog"
import {
  PRODUCT_ANNOUNCEMENT_REFRESH_ALARM,
  PRODUCT_ANNOUNCEMENT_REFRESH_INTERVAL_MINUTES,
  PRODUCT_ANNOUNCEMENT_REMOTE_URL,
} from "./constants"
import { productAnnouncementStorage } from "./storage"
import type { RawProductAnnouncementFeed } from "./types"

const logger = createLogger("ProductAnnouncementService")

interface GetCurrentStateOptions {
  locale: string
  currentVersion?: string
  now?: number
}

export interface ProductAnnouncementRuntimeState {
  view: ProductAnnouncementView
  lastFetchedAt?: number
}

function getCurrentVersion() {
  return getManifest().version?.trim() || "0.0.0"
}

class ProductAnnouncementService {
  private initialized = false

  initialize() {
    if (this.initialized) return
    this.initialized = true

    onAlarm((alarm) => {
      if (alarm.name === PRODUCT_ANNOUNCEMENT_REFRESH_ALARM) {
        void this.refreshRemoteFeed()
      }
    })

    void this.reconcileRefreshAlarm()
  }

  async reconcileRefreshAlarm(): Promise<void> {
    const existing = await getAlarm(PRODUCT_ANNOUNCEMENT_REFRESH_ALARM)
    if (existing) return

    await createAlarm(PRODUCT_ANNOUNCEMENT_REFRESH_ALARM, {
      delayInMinutes: PRODUCT_ANNOUNCEMENT_REFRESH_INTERVAL_MINUTES,
      periodInMinutes: PRODUCT_ANNOUNCEMENT_REFRESH_INTERVAL_MINUTES,
    })
  }

  async getCurrentState(
    options: GetCurrentStateOptions,
  ): Promise<ProductAnnouncementRuntimeState> {
    const state = await productAnnouncementStorage.getState()
    const feed = state.cachedFeed ?? bundledFeed
    const normalized = normalizeProductAnnouncementFeed(
      feed as RawProductAnnouncementFeed,
      {
        currentVersion: options.currentVersion ?? getCurrentVersion(),
        locale: options.locale,
        now: options.now ?? Date.now(),
        dismissed: state.dismissed,
        seenAt: state.seenAt,
      },
    )

    return {
      view: selectProductAnnouncementView(normalized.notices),
      lastFetchedAt: state.lastFetchedAt,
    }
  }

  async refreshRemoteFeed(now = Date.now()): Promise<boolean> {
    try {
      const response = await fetch(PRODUCT_ANNOUNCEMENT_REMOTE_URL, {
        cache: "no-store",
      })
      if (!response.ok) return false

      const feed = (await response.json()) as RawProductAnnouncementFeed
      await productAnnouncementStorage.updateState((state) => {
        state.cachedFeed = feed
        state.lastFetchedAt = now
      })
      return true
    } catch (error) {
      logger.warn("Product announcement refresh failed", error)
      return false
    }
  }

  async markSeen(ids: string[], now = Date.now()): Promise<void> {
    await productAnnouncementStorage.updateState((state) => {
      ids.forEach((id) => {
        if (id) state.seenAt[id] = now
      })
    })
  }

  async dismiss(id: string, revision: number): Promise<void> {
    await productAnnouncementStorage.updateState((state) => {
      if (id && Number.isInteger(revision)) {
        state.dismissed[id] = revision
      }
    })
  }
}

export const productAnnouncementService = new ProductAnnouncementService()
```

- [ ] **Step 7: Run focused tests and commit**

Run:

```bash
pnpm vitest --run tests/services/productAnnouncements/storage.test.ts tests/services/productAnnouncements/service.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/services/core/storageKeys.ts src/services/productAnnouncements/storage.ts src/services/productAnnouncements/service.ts tests/services/productAnnouncements/storage.test.ts tests/services/productAnnouncements/service.test.ts
git commit -m "feat(product-announcements): persist notice state"
```

## Task 4: Typed Runtime Messaging And Background Initialization

**Files:**
- Modify: `src/services/runtimeMessaging/messageTypes.ts`
- Create: `src/services/productAnnouncements/messaging.ts`
- Modify: `src/services/productAnnouncements/service.ts`
- Modify: `src/entrypoints/background/runtimeMessages.ts`
- Modify: `src/entrypoints/background/servicesInit.ts`
- Test: `tests/services/productAnnouncements/messaging.test.ts`

- [ ] **Step 1: Write failing messaging tests**

Create `tests/services/productAnnouncements/messaging.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

import {
  resolveProductAnnouncementDismissMessage,
  resolveProductAnnouncementGetStateMessage,
  resolveProductAnnouncementMarkSeenMessage,
  resolveProductAnnouncementRefreshMessage,
} from "~/services/productAnnouncements/service"

describe("product announcement runtime message resolvers", () => {
  it("returns current state response", async () => {
    const response = await resolveProductAnnouncementGetStateMessage({
      locale: "zh-CN",
      currentVersion: "3.44.0",
      now: Date.parse("2026-06-06T00:00:00Z"),
    })

    expect(response.success).toBe(true)
    expect(response.success ? response.data.view.notices : []).toEqual([])
  })

  it("handles refresh, seen, and dismiss messages", async () => {
    await expect(resolveProductAnnouncementRefreshMessage()).resolves.toMatchObject({
      success: true,
    })
    await expect(
      resolveProductAnnouncementMarkSeenMessage({ ids: ["notice-a"], now: 1 }),
    ).resolves.toEqual({ success: true, data: undefined })
    await expect(
      resolveProductAnnouncementDismissMessage({
        id: "notice-a",
        revision: 1,
      }),
    ).resolves.toEqual({ success: true, data: undefined })
  })
})
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm vitest --run tests/services/productAnnouncements/messaging.test.ts
```

Expected: FAIL because resolver functions do not exist.

- [ ] **Step 3: Add message types and messaging module**

Modify `src/services/runtimeMessaging/messageTypes.ts`:

```ts
export const ProductAnnouncementsMessageTypes = {
  GetState: "productAnnouncements:getState",
  Refresh: "productAnnouncements:refresh",
  MarkSeen: "productAnnouncements:markSeen",
  Dismiss: "productAnnouncements:dismiss",
} as const
```

Create `src/services/productAnnouncements/messaging.ts`:

```ts
import { defineExtensionMessaging } from "~/services/runtimeMessaging/extensionMessaging"
import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import { ProductAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"

import type { ProductAnnouncementRuntimeState } from "./service"

export interface ProductAnnouncementsGetStateRequest {
  locale: string
  currentVersion?: string
  now?: number
}

export interface ProductAnnouncementsMarkSeenRequest {
  ids: string[]
  now?: number
}

export interface ProductAnnouncementsDismissRequest {
  id: string
  revision: number
}

interface ProductAnnouncementsProtocolMap {
  [ProductAnnouncementsMessageTypes.GetState](
    data: ProductAnnouncementsGetStateRequest,
  ): RuntimeMessageResponse<ProductAnnouncementRuntimeState>
  [ProductAnnouncementsMessageTypes.Refresh](): RuntimeMessageResponse<boolean>
  [ProductAnnouncementsMessageTypes.MarkSeen](
    data: ProductAnnouncementsMarkSeenRequest,
  ): RuntimeMessageResponse<undefined>
  [ProductAnnouncementsMessageTypes.Dismiss](
    data: ProductAnnouncementsDismissRequest,
  ): RuntimeMessageResponse<undefined>
}

export const {
  sendMessage: sendProductAnnouncementsMessage,
  onMessage: onProductAnnouncementsMessage,
} = defineExtensionMessaging<ProductAnnouncementsProtocolMap>({
  logger: createRuntimeMessagingLogger("ProductAnnouncementsMessaging"),
})
```

- [ ] **Step 4: Add resolver functions and listener setup**

Append to `src/services/productAnnouncements/service.ts`:

```ts
import { ProductAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import {
  createRuntimeMessageFailure,
  type RuntimeMessageResponse,
} from "~/services/runtimeMessaging/result"
import { getErrorMessage } from "~/utils/core/errorUtils"

import {
  onProductAnnouncementsMessage,
  type ProductAnnouncementsDismissRequest,
  type ProductAnnouncementsGetStateRequest,
  type ProductAnnouncementsMarkSeenRequest,
} from "./messaging"

export async function resolveProductAnnouncementGetStateMessage(
  request: ProductAnnouncementsGetStateRequest,
): Promise<RuntimeMessageResponse<ProductAnnouncementRuntimeState>> {
  try {
    return {
      success: true,
      data: await productAnnouncementService.getCurrentState(request),
    }
  } catch (error) {
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

export async function resolveProductAnnouncementRefreshMessage(): Promise<
  RuntimeMessageResponse<boolean>
> {
  try {
    return {
      success: true,
      data: await productAnnouncementService.refreshRemoteFeed(),
    }
  } catch (error) {
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

export async function resolveProductAnnouncementMarkSeenMessage(
  request: ProductAnnouncementsMarkSeenRequest,
): Promise<RuntimeMessageResponse<undefined>> {
  try {
    await productAnnouncementService.markSeen(request.ids, request.now)
    return { success: true, data: undefined }
  } catch (error) {
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

export async function resolveProductAnnouncementDismissMessage(
  request: ProductAnnouncementsDismissRequest,
): Promise<RuntimeMessageResponse<undefined>> {
  try {
    await productAnnouncementService.dismiss(request.id, request.revision)
    return { success: true, data: undefined }
  } catch (error) {
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

export function setupProductAnnouncementMessagingListeners() {
  return [
    onProductAnnouncementsMessage(
      ProductAnnouncementsMessageTypes.GetState,
      ({ data }) => resolveProductAnnouncementGetStateMessage(data),
    ),
    onProductAnnouncementsMessage(
      ProductAnnouncementsMessageTypes.Refresh,
      () => resolveProductAnnouncementRefreshMessage(),
    ),
    onProductAnnouncementsMessage(
      ProductAnnouncementsMessageTypes.MarkSeen,
      ({ data }) => resolveProductAnnouncementMarkSeenMessage(data),
    ),
    onProductAnnouncementsMessage(
      ProductAnnouncementsMessageTypes.Dismiss,
      ({ data }) => resolveProductAnnouncementDismissMessage(data),
    ),
  ]
}
```

If adding these imports creates duplicated import blocks in `service.ts`, consolidate them at the top of the file.

- [ ] **Step 5: Wire background runtime and service init**

Modify `src/entrypoints/background/runtimeMessages.ts`:

```ts
import { setupProductAnnouncementMessagingListeners } from "~/services/productAnnouncements/service"

// inside setupRuntimeMessageListeners()
setupProductAnnouncementMessagingListeners()
```

Modify `src/entrypoints/background/servicesInit.ts`:

```ts
import { productAnnouncementService } from "~/services/productAnnouncements/service"

// in alarmSchedulersInit Promise.allSettled([...])
productAnnouncementService.initialize(),
```

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
pnpm vitest --run tests/services/productAnnouncements/messaging.test.ts tests/entrypoints/background/runtimeMessages.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/services/runtimeMessaging/messageTypes.ts src/services/productAnnouncements/messaging.ts src/services/productAnnouncements/service.ts src/entrypoints/background/runtimeMessages.ts src/entrypoints/background/servicesInit.ts tests/services/productAnnouncements/messaging.test.ts
git commit -m "feat(product-announcements): add runtime messaging"
```

## Task 5: Product Announcement Hook And Header Popover

**Files:**
- Create: `src/features/ProductAnnouncements/testIds.ts`
- Create: `src/features/ProductAnnouncements/hooks/useProductAnnouncements.ts`
- Create: `src/features/ProductAnnouncements/ProductAnnouncementList.tsx`
- Create: `src/features/ProductAnnouncements/ProductAnnouncementPopover.tsx`
- Create: `src/features/ProductAnnouncements/ProductAnnouncementButton.tsx`
- Add locales: `src/locales/*/productAnnouncements.json`
- Test: `tests/features/ProductAnnouncements/ProductAnnouncementButton.test.tsx`

- [ ] **Step 1: Write failing button/popover tests**

Create `tests/features/ProductAnnouncements/ProductAnnouncementButton.test.tsx`:

```tsx
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ProductAnnouncementButton } from "~/features/ProductAnnouncements/ProductAnnouncementButton"
import { ProductAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const sendMessageMock = vi.fn()

vi.mock("~/services/productAnnouncements/messaging", () => ({
  sendProductAnnouncementsMessage: (...args: unknown[]) =>
    sendMessageMock(...args),
}))

describe("ProductAnnouncementButton", () => {
  beforeEach(() => {
    sendMessageMock.mockReset()
    sendMessageMock.mockResolvedValue({
      success: true,
      data: {
        view: {
          notices: [
            {
              id: "risk",
              revision: 1,
              severity: "critical",
              priority: 100,
              startsAt: Date.parse("2026-06-06T00:00:00Z"),
              expiresAt: Date.parse("2026-06-20T00:00:00Z"),
              title: "Critical risk",
              message: "Update now.",
              seen: false,
              dismissed: false,
            },
          ],
          activeNotices: [],
          dismissedNotices: [],
          primaryRiskNotice: null,
          unseenActiveCount: 1,
        },
      },
    })
  })

  it("shows an unseen badge and marks notices seen when opened", async () => {
    const user = userEvent.setup()
    render(<ProductAnnouncementButton surface="options-header" />, {
      withReleaseUpdateStatusProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(
      await screen.findByRole("button", {
        name: "productAnnouncements:actions.open",
      }),
    ).toBeInTheDocument()
    expect(screen.getByText("1")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "productAnnouncements:actions.open",
      }),
    )

    expect(await screen.findByText("Critical risk")).toBeInTheDocument()
    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        ProductAnnouncementsMessageTypes.MarkSeen,
        { ids: ["risk"] },
      )
    })
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm vitest --run tests/features/ProductAnnouncements/ProductAnnouncementButton.test.tsx
```

Expected: FAIL because components do not exist.

- [ ] **Step 3: Add locale namespace files**

Create `src/locales/zh-CN/productAnnouncements.json`:

```json
{
  "actions": {
    "dismiss": "不再显示",
    "open": "产品公告",
    "viewAll": "查看全部"
  },
  "empty": {
    "active": "暂无产品公告",
    "dismissed": "暂无已关闭公告"
  },
  "filters": {
    "active": "当前公告",
    "dismissed": "已关闭"
  },
  "labels": {
    "critical": "严重",
    "info": "信息",
    "warning": "提醒"
  },
  "title": "产品公告"
}
```

Create equivalent key shapes in `en`, `ja`, `zh-TW`, and `vi`. Use concise direct translations; do not add extra keys.

- [ ] **Step 4: Implement hook and UI components**

Create `src/features/ProductAnnouncements/testIds.ts`:

```ts
export const PRODUCT_ANNOUNCEMENT_TEST_IDS = {
  button: "product-announcement-button",
  badge: "product-announcement-badge",
  popover: "product-announcement-popover",
  activeList: "product-announcement-active-list",
  dismissedList: "product-announcement-dismissed-list",
} as const
```

Create `src/features/ProductAnnouncements/hooks/useProductAnnouncements.ts`:

```ts
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { sendProductAnnouncementsMessage } from "~/services/productAnnouncements/messaging"
import type { ProductAnnouncementRuntimeState } from "~/services/productAnnouncements/service"
import { ProductAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"

const EMPTY_STATE: ProductAnnouncementRuntimeState = {
  view: {
    notices: [],
    activeNotices: [],
    dismissedNotices: [],
    primaryRiskNotice: null,
    unseenActiveCount: 0,
  },
}

export function useProductAnnouncements() {
  const { i18n } = useTranslation()
  const [state, setState] =
    useState<ProductAnnouncementRuntimeState>(EMPTY_STATE)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await sendProductAnnouncementsMessage(
        ProductAnnouncementsMessageTypes.GetState,
        { locale: i18n.language },
      )
      if (response.success) setState(response.data)
    } finally {
      setIsLoading(false)
    }
  }, [i18n.language])

  useEffect(() => {
    void load()
  }, [load])

  const markSeen = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return
      await sendProductAnnouncementsMessage(
        ProductAnnouncementsMessageTypes.MarkSeen,
        { ids },
      )
      await load()
    },
    [load],
  )

  const dismiss = useCallback(
    async (id: string, revision: number) => {
      await sendProductAnnouncementsMessage(
        ProductAnnouncementsMessageTypes.Dismiss,
        { id, revision },
      )
      await load()
    },
    [load],
  )

  return {
    state,
    isLoading,
    reload: load,
    markSeen,
    dismiss,
  }
}
```

Implement `ProductAnnouncementList.tsx`, `ProductAnnouncementPopover.tsx`, and `ProductAnnouncementButton.tsx` using:

- `Bell` or `Megaphone` from `lucide-react`.
- `IconButton`, `Badge`, `Button`, `Popover`, `PopoverTrigger`, `PopoverContent`.
- `PRODUCT_ANNOUNCEMENT_TEST_IDS`.
- `useTranslation("productAnnouncements")`.

Required behavior:

- Button always renders for Options.
- Badge renders only when `state.view.unseenActiveCount > 0`.
- Popover has Active and Dismissed filter buttons.
- Opening the popover calls `markSeen` for currently active unseen notice ids.
- Dismiss action calls `dismiss(id, revision)`.
- CTA opens sanitized URL in a new tab with `rel="noopener noreferrer"`.

- [ ] **Step 5: Run focused tests and i18n extraction check**

Run:

```bash
pnpm vitest --run tests/features/ProductAnnouncements/ProductAnnouncementButton.test.tsx
pnpm run i18n:extract:ci
```

Expected: PASS and no unexpected i18n changes.

Commit:

```bash
git add src/features/ProductAnnouncements src/locales/zh-CN/productAnnouncements.json src/locales/en/productAnnouncements.json src/locales/ja/productAnnouncements.json src/locales/zh-TW/productAnnouncements.json src/locales/vi/productAnnouncements.json tests/features/ProductAnnouncements/ProductAnnouncementButton.test.tsx
git commit -m "feat(product-announcements): add header popover"
```

## Task 6: Options Header, Overview Banner, And Popup Entry

**Files:**
- Modify: `src/entrypoints/options/components/Header.tsx`
- Modify: `src/features/OptionsOverview/OptionsOverview.tsx`
- Create: `src/features/ProductAnnouncements/ProductAnnouncementBanner.tsx`
- Modify: `src/entrypoints/popup/components/HeaderSection.tsx`
- Test: `tests/features/ProductAnnouncements/ProductAnnouncementBanner.test.tsx`
- Test: `tests/entrypoints/options/Header.productAnnouncements.test.tsx`
- Test: `tests/entrypoints/popup/HeaderSection.productAnnouncements.test.tsx`

- [ ] **Step 1: Write focused UI integration tests**

Create `tests/features/ProductAnnouncements/ProductAnnouncementBanner.test.tsx`:

```tsx
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ProductAnnouncementBanner } from "~/features/ProductAnnouncements/ProductAnnouncementBanner"
import { render, screen } from "~~/tests/test-utils/render"

describe("ProductAnnouncementBanner", () => {
  it("renders the primary risk notice and exposes view-all and dismiss actions", async () => {
    const user = userEvent.setup()
    const onViewAll = vi.fn()
    const onDismiss = vi.fn()

    render(
      <ProductAnnouncementBanner
        notice={{
          id: "risk",
          revision: 1,
          severity: "warning",
          priority: 10,
          startsAt: 1,
          expiresAt: 2,
          title: "Risk notice",
          message: "Please review.",
          seen: false,
          dismissed: false,
        }}
        additionalCount={2}
        onViewAll={onViewAll}
        onDismiss={onDismiss}
      />,
      { withReleaseUpdateStatusProvider: false },
    )

    expect(screen.getByText("Risk notice")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "productAnnouncements:actions.viewAll",
      }),
    )
    expect(onViewAll).toHaveBeenCalledTimes(1)

    await user.click(
      screen.getByRole("button", {
        name: "productAnnouncements:actions.dismiss",
      }),
    )
    expect(onDismiss).toHaveBeenCalledWith("risk", 1)
  })
})
```

Create header integration tests that mock `ProductAnnouncementButton` and assert it renders in Options header and conditionally in Popup header. Keep these tests narrow; do not exercise the popover again.

- [ ] **Step 2: Implement banner component**

Create `src/features/ProductAnnouncements/ProductAnnouncementBanner.tsx`:

```tsx
import { AlertTriangle } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge, Button } from "~/components/ui"
import type { ProductAnnouncement } from "~/services/productAnnouncements/types"

interface ProductAnnouncementBannerProps {
  notice: ProductAnnouncement
  additionalCount: number
  onViewAll: () => void
  onDismiss: (id: string, revision: number) => void
}

export function ProductAnnouncementBanner({
  notice,
  additionalCount,
  onViewAll,
  onDismiss,
}: ProductAnnouncementBannerProps) {
  const { t } = useTranslation("productAnnouncements")

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{notice.title}</h2>
            <Badge variant={notice.severity === "critical" ? "danger" : "warning"} size="sm">
              {t(`labels.${notice.severity}`)}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-sm">{notice.message}</p>
          {additionalCount > 0 ? (
            <p className="mt-1 text-xs">
              {t("summary.additional", { count: additionalCount })}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onViewAll}>
            {t("actions.viewAll")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDismiss(notice.id, notice.revision)}
          >
            {t("actions.dismiss")}
          </Button>
        </div>
      </div>
    </section>
  )
}
```

Add `summary.additional` to all `productAnnouncements.json` locales.

- [ ] **Step 3: Wire Options header and Overview**

Modify `src/entrypoints/options/components/Header.tsx`:

```tsx
import { ProductAnnouncementButton } from "~/features/ProductAnnouncements/ProductAnnouncementButton"

// in the right-side utility group, before HeaderThemeSwitcher:
<ProductAnnouncementButton surface="options-header" />
```

Modify `src/features/OptionsOverview/OptionsOverview.tsx` to load product announcements and render the banner above `<OptionsOverviewGrid />`. Use the fixed button's internal event/open state if possible; if not possible in first pass, `onViewAll` can dispatch a DOM custom event consumed by `ProductAnnouncementButton`. Prefer a shared context only if this direct wiring becomes awkward.

- [ ] **Step 4: Wire Popup compact entry**

Modify `src/entrypoints/popup/components/HeaderSection.tsx`:

```tsx
import { ProductAnnouncementButton } from "~/features/ProductAnnouncements/ProductAnnouncementButton"

// in the header action group, before CompactThemeToggle:
<ProductAnnouncementButton surface="popup-header" onlyWhenRisk />
```

`onlyWhenRisk` should hide the button unless `primaryRiskNotice` exists. Add this prop to `ProductAnnouncementButton`.

- [ ] **Step 5: Run focused UI tests and commit**

Run:

```bash
pnpm vitest --run tests/features/ProductAnnouncements/ProductAnnouncementBanner.test.tsx tests/features/ProductAnnouncements/ProductAnnouncementButton.test.tsx tests/entrypoints/options/Header.productAnnouncements.test.tsx tests/entrypoints/popup/HeaderSection.productAnnouncements.test.tsx
pnpm run i18n:extract:ci
```

Expected: PASS.

Commit:

```bash
git add src/features/ProductAnnouncements src/entrypoints/options/components/Header.tsx src/features/OptionsOverview/OptionsOverview.tsx src/entrypoints/popup/components/HeaderSection.tsx src/locales tests/features/ProductAnnouncements tests/entrypoints/options/Header.productAnnouncements.test.tsx tests/entrypoints/popup/HeaderSection.productAnnouncements.test.tsx
git commit -m "feat(product-announcements): surface risk notices"
```

## Task 7: Privacy-Safe Analytics

**Files:**
- Modify: `src/services/productAnalytics/events.ts`
- Modify: `src/services/productAnalytics/privacy.ts`
- Create: `src/features/ProductAnnouncements/analytics.ts`
- Modify: product announcement UI components from Tasks 5-6
- Test: `tests/services/productAnalytics/privacy.test.ts`

- [ ] **Step 1: Add failing privacy test**

Append to `tests/services/productAnalytics/privacy.test.ts`:

```ts
it("keeps safe product announcement fields and drops remote copy", () => {
  const sanitized = sanitizeProductAnalyticsEvent(
    PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
    {
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ProductAnnouncements,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenProductAnnouncements,
      surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsProductAnnouncementsHeader,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      product_announcement_id: "2026-06-risk",
      product_announcement_severity: "critical",
      product_announcement_action_kind: "open_list",
      product_announcement_active_count: 2,
      product_announcement_title: "Private remote title",
      product_announcement_message: "Remote body",
      product_announcement_url: "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.44.1",
    },
  )

  expect(sanitized).toEqual({
    feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ProductAnnouncements,
    action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenProductAnnouncements,
    surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsProductAnnouncementsHeader,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    result: PRODUCT_ANALYTICS_RESULTS.Success,
    product_announcement_id: "2026-06-risk",
    product_announcement_severity: "critical",
    product_announcement_action_kind: "open_list",
    product_announcement_active_count: 2,
  })
})
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm vitest --run tests/services/productAnalytics/privacy.test.ts
```

Expected: FAIL because enums/allow-list fields do not exist.

- [ ] **Step 3: Add analytics enums and sanitizer allow-list**

Modify `src/services/productAnalytics/events.ts`:

```ts
// PRODUCT_ANALYTICS_FEATURE_IDS
ProductAnnouncements: "product_announcements",

// PRODUCT_ANALYTICS_ACTION_IDS
OpenProductAnnouncements: "open_product_announcements",
DismissProductAnnouncement: "dismiss_product_announcement",
OpenProductAnnouncementCta: "open_product_announcement_cta",

// PRODUCT_ANALYTICS_SURFACE_IDS
OptionsProductAnnouncementsHeader: "options_product_announcements_header",
OptionsProductAnnouncementsBanner: "options_product_announcements_banner",
PopupProductAnnouncementsHeader: "popup_product_announcements_header",
```

Add controlled value constants for:

```ts
export const PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_ACTION_KINDS = {
  OpenList: "open_list",
  Dismiss: "dismiss",
  OpenCta: "open_cta",
  MarkSeen: "mark_seen",
} as const

export const PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_SEVERITIES = {
  Critical: "critical",
  Warning: "warning",
  Info: "info",
} as const
```

Modify `src/services/productAnalytics/privacy.ts` to allow:

- `product_announcement_id`
- `product_announcement_severity`
- `product_announcement_action_kind`
- `product_announcement_active_count`

Allow enum validation for severity/action kind and number validation for active count. Do not allow title/message/url.

- [ ] **Step 4: Add UI tracking helper**

Create `src/features/ProductAnnouncements/analytics.ts`:

```ts
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_ACTION_KINDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsSurfaceId,
} from "~/services/productAnalytics/events"
import { trackProductAnalyticsActionCompleted } from "~/services/productAnalytics/actions"
import type { ProductAnnouncement } from "~/services/productAnnouncements/types"

export function trackProductAnnouncementAction(params: {
  actionId: typeof PRODUCT_ANALYTICS_ACTION_IDS.OpenProductAnnouncements
  surfaceId: ProductAnalyticsSurfaceId
  entrypoint: typeof PRODUCT_ANALYTICS_ENTRYPOINTS.Options | typeof PRODUCT_ANALYTICS_ENTRYPOINTS.Popup
  actionKind: string
  notice?: ProductAnnouncement
  activeCount?: number
}) {
  trackProductAnalyticsActionCompleted({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ProductAnnouncements,
    actionId: params.actionId,
    surfaceId: params.surfaceId,
    entrypoint: params.entrypoint,
    result: PRODUCT_ANALYTICS_RESULTS.Success,
    properties: {
      product_announcement_id: params.notice?.id,
      product_announcement_severity: params.notice?.severity,
      product_announcement_action_kind: params.actionKind,
      product_announcement_active_count: params.activeCount,
    },
  })
}
```

Adjust the exact helper call shape to match the existing analytics action API if `trackProductAnalyticsActionCompleted` expects a different signature. Keep fields identical to the privacy test.

- [ ] **Step 5: Wire tracking to UI interactions**

Track:

- opening the fixed list.
- dismissing a notice.
- clicking a CTA.

Do not track title, message, or URL.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
pnpm vitest --run tests/services/productAnalytics/privacy.test.ts tests/features/ProductAnnouncements/ProductAnnouncementButton.test.tsx tests/features/ProductAnnouncements/ProductAnnouncementBanner.test.tsx
```

Expected: PASS.

Commit:

```bash
git add src/services/productAnalytics/events.ts src/services/productAnalytics/privacy.ts src/features/ProductAnnouncements/analytics.ts src/features/ProductAnnouncements tests/services/productAnalytics/privacy.test.ts
git commit -m "feat(product-announcements): track safe notice actions"
```

## Task 8: Final Validation And Handoff

**Files:**
- Review all task-scoped files.

- [ ] **Step 1: Inspect task-scoped diff**

Run:

```bash
git status --porcelain
git diff --stat HEAD~7..HEAD
git diff HEAD~7..HEAD -- public/product-announcements.json src/services/productAnnouncements src/features/ProductAnnouncements src/entrypoints/options/components/Header.tsx src/features/OptionsOverview/OptionsOverview.tsx src/entrypoints/popup/components/HeaderSection.tsx src/services/runtimeMessaging/messageTypes.ts src/entrypoints/background/runtimeMessages.ts src/entrypoints/background/servicesInit.ts src/services/core/storageKeys.ts src/services/productAnalytics src/locales tests
```

Expected: only product-announcement related changes plus intended locale files.

- [ ] **Step 2: Run focused product announcement tests**

Run:

```bash
pnpm vitest --run tests/services/productAnnouncements tests/features/ProductAnnouncements tests/entrypoints/options/Header.productAnnouncements.test.tsx tests/entrypoints/popup/HeaderSection.productAnnouncements.test.tsx tests/services/productAnalytics/privacy.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run type and i18n checks**

Run:

```bash
pnpm compile
pnpm run i18n:extract:ci
```

Expected: PASS and no unexpected locale extraction changes.

- [ ] **Step 4: Run pre-commit gate**

Stage task-scoped files only, then run:

```bash
pnpm run validate:staged
```

Expected: PASS.

- [ ] **Step 5: Push gate decision**

Because this feature adds new service modules, runtime messaging, background initialization, and product analytics enums, run:

```bash
pnpm run validate:push
```

Expected: PASS. If `knip` reports unused exports, either wire the export into the intended call site or remove it; do not suppress.

- [ ] **Step 6: Final commit if needed**

If validation caused formatting or generated locale changes:

```bash
git add <task-scoped files>
git commit -m "chore(product-announcements): validate notice channel"
```

Expected: no unrelated files staged. Leave pre-existing untracked files such as `notify.py` and `store-description/` untouched unless the user explicitly scopes them in.

## Self-Review Notes

- Spec coverage:
  - Remote static feed and bundled fallback: Tasks 1-3.
  - Locale fallback and multiple active notices: Task 2.
  - Seen vs dismissed state: Tasks 2-5.
  - Fixed Options icon and complete current list: Tasks 5-6.
  - Overview risk banner and compact Popup entry: Task 6.
  - Privacy-safe telemetry: Task 7.
  - Validation and E2E decision: Task 8 keeps coverage at Vitest/component level because the first implementation risk is parsing, storage, messaging, and header UI state.
- No placeholders remain; if implementation discovers a missing existing helper signature, adjust the local step to match the actual helper rather than adding a parallel abstraction.
