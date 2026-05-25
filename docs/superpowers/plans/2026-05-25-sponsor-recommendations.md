# Sponsor Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-controlled sponsor and partner recommendations to account onboarding without adding third-party ad SDKs, personalization, or account data leakage.

**Architecture:** Add a small sponsor catalog feature under Account Management with bundled catalog data, optional validated remote refresh, and a cache isolated from site announcements. Surface normalized sponsor view models in the no-account card and the Add Account entry phase, and route supported sponsor continuation through a narrow `siteUrl` + `siteType` dialog prefill contract.

**Tech Stack:** TypeScript, React, WXT, `@plasmohq/storage`, Vitest, Testing Library, MSW, existing i18next locale extraction.

---

## File Structure

- Create `src/features/AccountManagement/sponsors/types.ts`
  - Own raw sponsor catalog types, normalized UI types, support status constants, and `AddAccountPrefill`.
- Create `src/features/AccountManagement/sponsors/constants.ts`
  - Own schema version, remote URL, locale fallback order, and per-surface item limits.
- Create `src/features/AccountManagement/sponsors/bundledCatalog.ts`
  - Ship the local fallback catalog. Start with AIHubMix as the single bundled supported sponsor because the repo has first-class `SITE_TYPES.AIHUBMIX` account support.
- Create `src/features/AccountManagement/sponsors/catalog.ts`
  - Validate and normalize raw catalog payloads, apply locale fallback, filter disabled/date-invalid/unsafe entries, sort by rank and id, and produce UI-ready sponsor items.
- Modify `src/services/core/storageKeys.ts`
  - Add a dedicated sponsor catalog storage key and lock. Do not reuse site-announcement state.
- Create `src/features/AccountManagement/sponsors/storage.ts`
  - Persist only the last valid remote catalog snapshot.
- Create `src/features/AccountManagement/sponsors/loader.ts`
  - Merge bundled, cached, and remote catalog sources with best-effort remote refresh.
- Create `src/features/AccountManagement/sponsors/useSponsorRecommendations.ts`
  - Provide a React hook for UI surfaces and hide recommendations when no valid items exist.
- Create `src/features/AccountManagement/sponsors/SponsorRecommendationCard.tsx`
  - Render one compact sponsor recommendation card with primary, continuation, and fallback actions.
- Create `src/features/AccountManagement/sponsors/SponsorRecommendationsSection.tsx`
  - Render a limited list of sponsor cards for a named surface.
- Modify `src/features/AccountManagement/testIds.ts`
  - Add stable test IDs for sponsor surfaces and actions.
- Modify `src/features/AccountManagement/components/NewcomerSupportCard.tsx`
  - Replace the current generic support-only card body with recommendation-aware content while preserving docs/about/repo fallback actions.
- Modify `src/features/AccountManagement/components/AccountDialog/models.ts`
  - Add the `SPONSOR` form source and export `AddAccountPrefill` from the sponsor types.
- Modify `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
  - Consume add-mode sponsor prefill once during dialog open, initialize URL and `siteType`, and keep manual edits authoritative.
- Modify `src/features/AccountManagement/components/AccountDialog/index.tsx`
  - Accept optional `prefill`, widen the modal only in add entry phase, and render sponsor recommendations only in `SITE_INPUT`.
- Modify `src/features/AccountManagement/hooks/DialogStateContext.tsx`
  - Thread optional add-account prefill through `openAccountDialog` and `openAddAccount`.
- Modify `src/hooks/useAddAccountHandler.ts`
  - Allow callers to pass sponsor prefill while preserving the Firefox warning branch.
- Modify `src/locales/zh-CN/account.json`
  - Add fixed UI labels for recommendation surfaces and fallback actions.
- Modify `src/locales/zh-CN/accountDialog.json`
  - Add fixed Add Account recommendation entry labels.
- Let `pnpm run i18n:extract` generate matching locale key shape for `en`, `ja`, `zh-TW`, and `vi` if the extractor updates them.
- Create or modify these tests:
  - `tests/features/AccountManagement/sponsors/catalog.test.ts`
  - `tests/features/AccountManagement/sponsors/loader.test.ts`
  - `tests/features/AccountManagement/sponsors/SponsorRecommendationsSection.test.tsx`
  - `tests/features/AccountManagement/components/NewcomerSupportCard.test.tsx`
  - `tests/features/AccountManagement/components/AccountDialog.test.tsx`
  - `tests/features/AccountManagement/hooks/useAccountDialog.sponsorPrefill.test.tsx`
  - `tests/features/AccountManagement/hooks/DialogStateContext.sponsorPrefill.test.tsx`

## Task 1: Sponsor Catalog Contracts and Normalization

**Files:**
- Create: `src/features/AccountManagement/sponsors/types.ts`
- Create: `src/features/AccountManagement/sponsors/constants.ts`
- Create: `src/features/AccountManagement/sponsors/bundledCatalog.ts`
- Create: `src/features/AccountManagement/sponsors/catalog.ts`
- Test: `tests/features/AccountManagement/sponsors/catalog.test.ts`

- [ ] **Step 1: Write the failing catalog normalization tests**

Create `tests/features/AccountManagement/sponsors/catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  SPONSOR_CATALOG_SCHEMA_VERSION,
  SPONSOR_RECOMMENDATION_SURFACES,
} from "~/features/AccountManagement/sponsors/constants"
import {
  normalizeSponsorCatalog,
  selectSponsorRecommendations,
} from "~/features/AccountManagement/sponsors/catalog"
import { SPONSOR_SUPPORT_STATUS } from "~/features/AccountManagement/sponsors/types"

describe("sponsor catalog normalization", () => {
  it("keeps enabled HTTP sponsors with fallback locale content and stable ordering", () => {
    const now = Date.parse("2026-05-25T12:00:00.000Z")

    const result = normalizeSponsorCatalog(
      {
        schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
        generatedAt: "2026-05-25T00:00:00.000Z",
        items: [
          {
            id: "later",
            enabled: true,
            rank: 20,
            supportStatus: "unsupported",
            locales: {
              en: {
                name: "Later Provider",
                tagline: "Manual setup provider.",
              },
            },
            urls: {
              primaryAffiliate: "https://later.example.com/register",
            },
          },
          {
            id: "aihubmix",
            enabled: true,
            rank: 10,
            supportStatus: "supported",
            locales: {
              "zh-CN": {
                name: "AIHubMix",
                tagline: "聚合模型服务。",
                disclosure: "合作伙伴",
                ctaLabel: "注册 AIHubMix",
              },
              en: {
                name: "AIHubMix",
                tagline: "Aggregated model service.",
              },
            },
            urls: {
              primaryAffiliate: "https://aihubmix.com?utm_source=all-api-hub",
              website: "https://aihubmix.com",
            },
            supportedAccount: {
              siteType: SITE_TYPES.AIHUBMIX,
              siteUrl: "https://aihubmix.com",
            },
          },
        ],
      },
      {
        locale: "zh-CN",
        now,
        source: "bundled",
      },
    )

    expect(result.ok).toBe(true)
    expect(result.items.map((item) => item.id)).toEqual(["aihubmix", "later"])
    expect(result.items[0]).toMatchObject({
      id: "aihubmix",
      name: "AIHubMix",
      tagline: "聚合模型服务。",
      disclosure: "合作伙伴",
      supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
      source: "bundled",
      supportedAccount: {
        siteType: SITE_TYPES.AIHUBMIX,
        siteUrl: "https://aihubmix.com",
      },
    })
    expect(result.items[1]).toMatchObject({
      id: "later",
      name: "Later Provider",
      tagline: "Manual setup provider.",
    })
  })

  it("rejects unsafe, disabled, expired, malformed, and unsupported-schema items", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
        generatedAt: "2026-05-25T00:00:00.000Z",
        items: [
          {
            id: "disabled",
            enabled: false,
            supportStatus: "supported",
            locales: { en: { name: "Disabled", tagline: "Hidden" } },
            urls: { primaryAffiliate: "https://disabled.example.com" },
          },
          {
            id: "ftp-url",
            enabled: true,
            supportStatus: "supported",
            locales: { en: { name: "FTP", tagline: "Unsafe" } },
            urls: { primaryAffiliate: "ftp://unsafe.example.com" },
          },
          {
            id: "expired",
            enabled: true,
            supportStatus: "supported",
            locales: { en: { name: "Expired", tagline: "Hidden" } },
            urls: { primaryAffiliate: "https://expired.example.com" },
            endsAt: "2026-05-24T00:00:00.000Z",
          },
          {
            id: "missing-copy",
            enabled: true,
            supportStatus: "supported",
            locales: { ja: { name: "名前", tagline: "" } },
            urls: { primaryAffiliate: "https://missing-copy.example.com" },
          },
        ],
      },
      {
        locale: "zh-CN",
        now: Date.parse("2026-05-25T12:00:00.000Z"),
        source: "remote",
      },
    )

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "item disabled is disabled",
        "item ftp-url has invalid primaryAffiliate URL",
        "item expired is outside its active date range",
        "item missing-copy has no localized name and tagline",
      ]),
    )

    expect(
      normalizeSponsorCatalog(
        { schemaVersion: 999, generatedAt: "2026-05-25T00:00:00.000Z", items: [] },
        {
          locale: "zh-CN",
          now: Date.parse("2026-05-25T12:00:00.000Z"),
          source: "remote",
        },
      ),
    ).toMatchObject({
      ok: false,
      items: [],
      errors: ["unsupported schemaVersion 999"],
    })
  })

  it("selects the configured number of recommendations for each surface", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
        generatedAt: "2026-05-25T00:00:00.000Z",
        items: [
          {
            id: "a",
            enabled: true,
            rank: 1,
            supportStatus: "supported",
            locales: { en: { name: "A", tagline: "Provider A" } },
            urls: { primaryAffiliate: "https://a.example.com" },
          },
          {
            id: "b",
            enabled: true,
            rank: 2,
            supportStatus: "unsupported",
            locales: { en: { name: "B", tagline: "Provider B" } },
            urls: { primaryAffiliate: "https://b.example.com" },
          },
          {
            id: "c",
            enabled: true,
            rank: 3,
            supportStatus: "generic-compatible",
            locales: { en: { name: "C", tagline: "Provider C" } },
            urls: { primaryAffiliate: "https://c.example.com" },
          },
        ],
      },
      {
        locale: "en",
        now: Date.parse("2026-05-25T12:00:00.000Z"),
        source: "bundled",
      },
    )

    expect(
      selectSponsorRecommendations(
        result.items,
        SPONSOR_RECOMMENDATION_SURFACES.Newcomer,
      ).map((item) => item.id),
    ).toEqual(["a", "b"])
    expect(
      selectSponsorRecommendations(
        result.items,
        SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog,
      ).map((item) => item.id),
    ).toEqual(["a", "b", "c"])
  })
})
```

- [ ] **Step 2: Run the catalog test and confirm it fails**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/sponsors/catalog.test.ts
```

Expected: fail because `sponsors/catalog.ts`, `sponsors/types.ts`, and `sponsors/constants.ts` do not exist.

- [ ] **Step 3: Add sponsor type contracts**

Create `src/features/AccountManagement/sponsors/types.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"

export const SPONSOR_SUPPORT_STATUS = {
  Supported: "supported",
  Unsupported: "unsupported",
  GenericCompatible: "generic-compatible",
} as const

export type SponsorSupportStatus =
  (typeof SPONSOR_SUPPORT_STATUS)[keyof typeof SPONSOR_SUPPORT_STATUS]

export const SPONSOR_CATALOG_SOURCES = {
  Bundled: "bundled",
  Cached: "cached",
  Remote: "remote",
} as const

export type SponsorCatalogSource =
  (typeof SPONSOR_CATALOG_SOURCES)[keyof typeof SPONSOR_CATALOG_SOURCES]

export interface SponsorLocalizedContent {
  name: string
  tagline: string
  disclosure?: string
  ctaLabel?: string
}

export interface RawSponsorItem {
  id: string
  enabled: boolean
  rank?: number
  weight?: number
  supportStatus: SponsorSupportStatus
  locales: Record<string, SponsorLocalizedContent>
  urls: {
    primaryAffiliate: string
    website?: string
    docs?: string
  }
  supportedAccount?: {
    siteType: string
    siteUrl: string
  }
  fallbackHints?: {
    siteSupportRequest?: boolean
    bookmarkManager?: boolean
    apiCredentialProfiles?: boolean
  }
  startsAt?: string
  endsAt?: string
}

export interface RawSponsorCatalog {
  schemaVersion: number
  generatedAt: string
  items: RawSponsorItem[]
}

export interface SponsorRecommendation {
  id: string
  name: string
  tagline: string
  disclosure?: string
  ctaLabel?: string
  supportStatus: SponsorSupportStatus
  primaryAffiliateUrl: string
  websiteUrl?: string
  docsUrl?: string
  supportedAccount?: {
    siteType: AccountSiteType
    siteUrl: string
  }
  fallbackHints: {
    siteSupportRequest: boolean
    bookmarkManager: boolean
    apiCredentialProfiles: boolean
  }
  source: SponsorCatalogSource
  rank: number
}

export interface SponsorCatalogNormalizationResult {
  ok: boolean
  items: SponsorRecommendation[]
  errors: string[]
}

export interface AddAccountPrefill {
  siteUrl: string
  siteType: AccountSiteType
  source: "sponsor"
  sponsorId: string
}
```

- [ ] **Step 4: Add sponsor constants**

Create `src/features/AccountManagement/sponsors/constants.ts`:

```ts
export const SPONSOR_CATALOG_SCHEMA_VERSION = 1 as const

export const SPONSOR_REMOTE_CATALOG_URL =
  "https://raw.githubusercontent.com/qixing-jk/all-api-hub/main/public/sponsor-catalog.json"

export const SPONSOR_LOCALE_FALLBACKS = ["zh-CN", "en"] as const

export const SPONSOR_RECOMMENDATION_SURFACES = {
  Newcomer: "newcomer",
  AddAccountDialog: "add-account-dialog",
} as const

export type SponsorRecommendationSurface =
  (typeof SPONSOR_RECOMMENDATION_SURFACES)[keyof typeof SPONSOR_RECOMMENDATION_SURFACES]

export const SPONSOR_RECOMMENDATION_LIMITS: Record<
  SponsorRecommendationSurface,
  number
> = {
  [SPONSOR_RECOMMENDATION_SURFACES.Newcomer]: 2,
  [SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog]: 3,
}
```

- [ ] **Step 5: Add the bundled fallback catalog**

Create `src/features/AccountManagement/sponsors/bundledCatalog.ts`:

```ts
import { AIHUBMIX_API_ORIGIN, SITE_TYPES } from "~/constants/siteType"

import { SPONSOR_CATALOG_SCHEMA_VERSION } from "./constants"
import { SPONSOR_SUPPORT_STATUS, type RawSponsorCatalog } from "./types"

export const bundledSponsorCatalog: RawSponsorCatalog = {
  schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
  generatedAt: "2026-05-25T00:00:00.000Z",
  items: [
    {
      id: "aihubmix",
      enabled: true,
      rank: 10,
      supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
      locales: {
        "zh-CN": {
          name: "AIHubMix",
          tagline: "可在 All API Hub 中直接添加和管理的模型聚合服务。",
          disclosure: "合作伙伴推荐",
          ctaLabel: "注册 AIHubMix",
        },
        en: {
          name: "AIHubMix",
          tagline:
            "A model aggregation provider that All API Hub can add and manage directly.",
          disclosure: "Partner recommendation",
          ctaLabel: "Register AIHubMix",
        },
      },
      urls: {
        primaryAffiliate: `${AIHUBMIX_API_ORIGIN}?utm_source=all-api-hub`,
        website: AIHUBMIX_API_ORIGIN,
        docs: "https://docs.aihubmix.com/en/api/Cli",
      },
      supportedAccount: {
        siteType: SITE_TYPES.AIHUBMIX,
        siteUrl: AIHUBMIX_API_ORIGIN,
      },
    },
  ],
}
```

- [ ] **Step 6: Implement catalog validation and selection**

Create `src/features/AccountManagement/sponsors/catalog.ts`:

```ts
import { isAccountSiteType } from "~/constants/siteType"

import {
  SPONSOR_CATALOG_SCHEMA_VERSION,
  SPONSOR_LOCALE_FALLBACKS,
  SPONSOR_RECOMMENDATION_LIMITS,
  type SponsorRecommendationSurface,
} from "./constants"
import {
  SPONSOR_SUPPORT_STATUS,
  type RawSponsorCatalog,
  type RawSponsorItem,
  type SponsorCatalogNormalizationResult,
  type SponsorCatalogSource,
  type SponsorLocalizedContent,
  type SponsorRecommendation,
  type SponsorSupportStatus,
} from "./types"

interface NormalizeSponsorCatalogOptions {
  locale: string
  now?: number
  source: SponsorCatalogSource
}

const SUPPORT_STATUSES = new Set<string>(
  Object.values(SPONSOR_SUPPORT_STATUS),
)

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false

  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

function isActiveInDateRange(item: RawSponsorItem, now: number) {
  const startsAt = item.startsAt ? Date.parse(item.startsAt) : null
  const endsAt = item.endsAt ? Date.parse(item.endsAt) : null

  if (startsAt !== null && (!Number.isFinite(startsAt) || startsAt > now)) {
    return false
  }
  if (endsAt !== null && (!Number.isFinite(endsAt) || endsAt < now)) {
    return false
  }

  return true
}

function resolveLocalizedContent(
  locales: RawSponsorItem["locales"],
  locale: string,
): SponsorLocalizedContent | null {
  const candidates = [
    locale,
    locale.split("-")[0],
    ...SPONSOR_LOCALE_FALLBACKS,
  ]

  for (const candidate of candidates) {
    const content = locales[candidate]
    if (content?.name?.trim() && content?.tagline?.trim()) {
      return {
        name: content.name.trim(),
        tagline: content.tagline.trim(),
        disclosure: content.disclosure?.trim() || undefined,
        ctaLabel: content.ctaLabel?.trim() || undefined,
      }
    }
  }

  return null
}

function normalizeSponsorItem(params: {
  item: RawSponsorItem
  locale: string
  now: number
  source: SponsorCatalogSource
  errors: string[]
}): SponsorRecommendation | null {
  const { item, locale, now, source, errors } = params
  const itemId = typeof item.id === "string" ? item.id.trim() : ""

  if (!itemId || !/^[a-z0-9][a-z0-9-]*$/.test(itemId)) {
    errors.push("item has invalid id")
    return null
  }
  if (!item.enabled) {
    errors.push(`item ${itemId} is disabled`)
    return null
  }
  if (!SUPPORT_STATUSES.has(item.supportStatus)) {
    errors.push(`item ${itemId} has invalid supportStatus`)
    return null
  }
  if (!isActiveInDateRange(item, now)) {
    errors.push(`item ${itemId} is outside its active date range`)
    return null
  }
  if (!isHttpUrl(item.urls?.primaryAffiliate)) {
    errors.push(`item ${itemId} has invalid primaryAffiliate URL`)
    return null
  }
  if (item.urls.website && !isHttpUrl(item.urls.website)) {
    errors.push(`item ${itemId} has invalid website URL`)
    return null
  }
  if (item.urls.docs && !isHttpUrl(item.urls.docs)) {
    errors.push(`item ${itemId} has invalid docs URL`)
    return null
  }

  const localized = resolveLocalizedContent(item.locales ?? {}, locale)
  if (!localized) {
    errors.push(`item ${itemId} has no localized name and tagline`)
    return null
  }

  const supportedAccount =
    item.supportedAccount &&
    isAccountSiteType(item.supportedAccount.siteType) &&
    isHttpUrl(item.supportedAccount.siteUrl)
      ? {
          siteType: item.supportedAccount.siteType,
          siteUrl: item.supportedAccount.siteUrl,
        }
      : undefined

  if (item.supportedAccount && !supportedAccount) {
    errors.push(`item ${itemId} has invalid supportedAccount`)
    return null
  }

  return {
    id: itemId,
    name: localized.name,
    tagline: localized.tagline,
    disclosure: localized.disclosure,
    ctaLabel: localized.ctaLabel,
    supportStatus: item.supportStatus as SponsorSupportStatus,
    primaryAffiliateUrl: item.urls.primaryAffiliate,
    websiteUrl: item.urls.website,
    docsUrl: item.urls.docs,
    supportedAccount,
    fallbackHints: {
      siteSupportRequest: item.fallbackHints?.siteSupportRequest === true,
      bookmarkManager: item.fallbackHints?.bookmarkManager === true,
      apiCredentialProfiles: item.fallbackHints?.apiCredentialProfiles === true,
    },
    source,
    rank: Number.isFinite(item.rank) ? Number(item.rank) : Number.MAX_SAFE_INTEGER,
  }
}

export function normalizeSponsorCatalog(
  catalog: RawSponsorCatalog,
  options: NormalizeSponsorCatalogOptions,
): SponsorCatalogNormalizationResult {
  const errors: string[] = []
  const now = options.now ?? Date.now()

  if (catalog.schemaVersion !== SPONSOR_CATALOG_SCHEMA_VERSION) {
    return {
      ok: false,
      items: [],
      errors: [`unsupported schemaVersion ${catalog.schemaVersion}`],
    }
  }

  if (!Array.isArray(catalog.items)) {
    return {
      ok: false,
      items: [],
      errors: ["catalog items must be an array"],
    }
  }

  const items = catalog.items
    .map((item) =>
      normalizeSponsorItem({
        item,
        locale: options.locale,
        now,
        source: options.source,
        errors,
      }),
    )
    .filter((item): item is SponsorRecommendation => Boolean(item))
    .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id))

  return {
    ok: items.length > 0,
    items,
    errors,
  }
}

export function selectSponsorRecommendations(
  items: SponsorRecommendation[],
  surface: SponsorRecommendationSurface,
): SponsorRecommendation[] {
  return items.slice(0, SPONSOR_RECOMMENDATION_LIMITS[surface])
}
```

- [ ] **Step 7: Run the catalog test**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/sponsors/catalog.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit the catalog normalization slice**

```bash
git add src/features/AccountManagement/sponsors/types.ts src/features/AccountManagement/sponsors/constants.ts src/features/AccountManagement/sponsors/bundledCatalog.ts src/features/AccountManagement/sponsors/catalog.ts tests/features/AccountManagement/sponsors/catalog.test.ts
git commit -m "feat(account): add sponsor catalog normalization"
```

## Task 2: Sponsor Catalog Cache and Remote Loader

**Files:**
- Modify: `src/services/core/storageKeys.ts`
- Create: `src/features/AccountManagement/sponsors/storage.ts`
- Create: `src/features/AccountManagement/sponsors/loader.ts`
- Create: `src/features/AccountManagement/sponsors/useSponsorRecommendations.ts`
- Test: `tests/features/AccountManagement/sponsors/loader.test.ts`

- [ ] **Step 1: Write failing loader tests**

Create `tests/features/AccountManagement/sponsors/loader.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { SPONSOR_CATALOG_SCHEMA_VERSION } from "~/features/AccountManagement/sponsors/constants"
import {
  loadSponsorRecommendations,
  refreshSponsorRecommendations,
} from "~/features/AccountManagement/sponsors/loader"
import { sponsorCatalogStorage } from "~/features/AccountManagement/sponsors/storage"

const validRemoteCatalog = {
  schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
  generatedAt: "2026-05-25T00:00:00.000Z",
  items: [
    {
      id: "remote-provider",
      enabled: true,
      rank: 1,
      supportStatus: "supported",
      locales: {
        en: {
          name: "Remote Provider",
          tagline: "Remote catalog entry.",
        },
      },
      urls: {
        primaryAffiliate: "https://remote.example.com/register",
      },
      supportedAccount: {
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://remote.example.com",
      },
    },
  ],
}

vi.mock("~/features/AccountManagement/sponsors/storage", () => ({
  sponsorCatalogStorage: {
    getCachedRemoteCatalog: vi.fn(),
    setCachedRemoteCatalog: vi.fn(),
  },
}))

describe("sponsor catalog loader", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => validRemoteCatalog,
      })),
    )
  })

  it("returns cached valid recommendations without waiting for remote refresh", async () => {
    vi.mocked(sponsorCatalogStorage.getCachedRemoteCatalog).mockResolvedValueOnce(
      validRemoteCatalog,
    )

    const result = await loadSponsorRecommendations({
      locale: "en",
      now: Date.parse("2026-05-25T12:00:00.000Z"),
    })

    expect(result.items.map((item) => item.id)).toEqual(["remote-provider"])
    expect(result.source).toBe("cached")
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("refreshes and caches valid remote recommendations separately", async () => {
    const result = await refreshSponsorRecommendations({
      locale: "en",
      now: Date.parse("2026-05-25T12:00:00.000Z"),
    })

    expect(result?.items.map((item) => item.id)).toEqual(["remote-provider"])
    expect(result?.source).toBe("remote")
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(sponsorCatalogStorage.setCachedRemoteCatalog).toHaveBeenCalledWith(
      validRemoteCatalog,
    )
  })

  it("falls back to bundled recommendations when cache is invalid", async () => {
    vi.mocked(sponsorCatalogStorage.getCachedRemoteCatalog).mockResolvedValueOnce({
      schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
      generatedAt: "2026-05-25T00:00:00.000Z",
      items: [],
    })
    vi.mocked(globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        schemaVersion: 999,
        generatedAt: "2026-05-25T00:00:00.000Z",
        items: [],
      }),
    })

    const result = await loadSponsorRecommendations({
      locale: "zh-CN",
      now: Date.parse("2026-05-25T12:00:00.000Z"),
    })

    expect(result.source).toBe("bundled")
    expect(result.items.map((item) => item.id)).toEqual(["aihubmix"])
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("rejects invalid remote refresh payloads without replacing cache", async () => {
    vi.mocked(globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        schemaVersion: 999,
        generatedAt: "2026-05-25T00:00:00.000Z",
        items: [],
      }),
    })

    const result = await refreshSponsorRecommendations({
      locale: "zh-CN",
      now: Date.parse("2026-05-25T12:00:00.000Z"),
    })

    expect(result).toBeNull()
    expect(sponsorCatalogStorage.setCachedRemoteCatalog).not.toHaveBeenCalled()
  })

  it("does not let missing cache block bundled recommendations", async () => {
    vi.mocked(sponsorCatalogStorage.getCachedRemoteCatalog).mockResolvedValueOnce(
      null,
    )

    const result = await loadSponsorRecommendations({
      locale: "en",
      now: Date.parse("2026-05-25T12:00:00.000Z"),
    })

    expect(result.source).toBe("bundled")
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "aihubmix",
        name: "AIHubMix",
      }),
    ])
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("returns null when remote refresh fails", async () => {
    vi.mocked(globalThis.fetch as any).mockRejectedValueOnce(new Error("offline"))

    await expect(
      refreshSponsorRecommendations({
        locale: "en",
        now: Date.parse("2026-05-25T12:00:00.000Z"),
      }),
    ).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: Run the loader test and confirm it fails**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/sponsors/loader.test.ts
```

Expected: fail because the storage and loader modules do not exist.

- [ ] **Step 3: Add dedicated sponsor storage keys**

In `src/services/core/storageKeys.ts`, add this lock inside `STORAGE_LOCKS` after `SITE_ANNOUNCEMENTS`:

```ts
  /**
   * Exclusive lock used for read-modify-write sequences touching the sponsor
   * recommendation catalog cache.
   */
  SPONSOR_CATALOG: "all-api-hub:sponsor-catalog",
```

Add a storage key constant near `SITE_ANNOUNCEMENTS_STORAGE_KEYS`:

```ts
const SPONSOR_CATALOG_STORAGE_KEYS = {
  CACHE: "sponsorCatalog_cache_v1",
} as const
```

Then include it in `STORAGE_KEYS`:

```ts
  SPONSOR_CATALOG_CACHE: SPONSOR_CATALOG_STORAGE_KEYS.CACHE,
```

- [ ] **Step 4: Implement sponsor catalog storage**

Create `src/features/AccountManagement/sponsors/storage.ts`:

```ts
import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { createLogger } from "~/utils/core/logger"

import type { RawSponsorCatalog } from "./types"

const logger = createLogger("SponsorCatalogStorage")

class SponsorCatalogStorage {
  private storage = new Storage({ area: "local" })

  async getCachedRemoteCatalog(): Promise<RawSponsorCatalog | null> {
    try {
      const value = await this.storage.get(STORAGE_KEYS.SPONSOR_CATALOG_CACHE)
      return value && typeof value === "object"
        ? (value as RawSponsorCatalog)
        : null
    } catch (error) {
      logger.warn("Failed to read cached sponsor catalog", error)
      return null
    }
  }

  async setCachedRemoteCatalog(catalog: RawSponsorCatalog): Promise<void> {
    await withExtensionStorageWriteLock(STORAGE_LOCKS.SPONSOR_CATALOG, async () => {
      await this.storage.set(STORAGE_KEYS.SPONSOR_CATALOG_CACHE, catalog)
    })
  }
}

export const sponsorCatalogStorage = new SponsorCatalogStorage()
```

- [ ] **Step 5: Implement best-effort loader**

Create `src/features/AccountManagement/sponsors/loader.ts`:

```ts
import { createLogger } from "~/utils/core/logger"

import { bundledSponsorCatalog } from "./bundledCatalog"
import { normalizeSponsorCatalog } from "./catalog"
import { SPONSOR_REMOTE_CATALOG_URL } from "./constants"
import { sponsorCatalogStorage } from "./storage"
import {
  SPONSOR_CATALOG_SOURCES,
  type RawSponsorCatalog,
  type SponsorCatalogSource,
  type SponsorRecommendation,
} from "./types"

const logger = createLogger("SponsorCatalogLoader")

export interface LoadSponsorRecommendationsOptions {
  locale: string
  now?: number
}

export interface LoadSponsorRecommendationsResult {
  items: SponsorRecommendation[]
  source: SponsorCatalogSource
}

async function fetchRemoteSponsorCatalog(): Promise<RawSponsorCatalog | null> {
  try {
    const response = await fetch(SPONSOR_REMOTE_CATALOG_URL, {
      cache: "no-store",
    })
    if (!response.ok) {
      logger.warn("Sponsor catalog remote fetch failed", {
        status: response.status,
      })
      return null
    }
    return (await response.json()) as RawSponsorCatalog
  } catch (error) {
    logger.warn("Sponsor catalog remote fetch failed", error)
    return null
  }
}

async function loadValidCachedCatalog(options: LoadSponsorRecommendationsOptions) {
  const cachedCatalog = await sponsorCatalogStorage.getCachedRemoteCatalog()
  if (!cachedCatalog) return null

  const normalized = normalizeSponsorCatalog(cachedCatalog, {
    locale: options.locale,
    now: options.now,
    source: SPONSOR_CATALOG_SOURCES.Cached,
  })

  return normalized.ok ? normalized.items : null
}

export async function refreshSponsorRecommendations(
  options: LoadSponsorRecommendationsOptions,
): Promise<LoadSponsorRecommendationsResult | null> {
  const remoteCatalog = await fetchRemoteSponsorCatalog()
  if (!remoteCatalog) return null

  const normalized = normalizeSponsorCatalog(remoteCatalog, {
    locale: options.locale,
    now: options.now,
    source: SPONSOR_CATALOG_SOURCES.Remote,
  })

  if (!normalized.ok) {
    logger.warn("Sponsor catalog remote payload rejected", {
      errors: normalized.errors,
    })
    return null
  }

  await sponsorCatalogStorage.setCachedRemoteCatalog(remoteCatalog)
  return {
    items: normalized.items,
    source: SPONSOR_CATALOG_SOURCES.Remote,
  }
}

export async function loadSponsorRecommendations(
  options: LoadSponsorRecommendationsOptions,
): Promise<LoadSponsorRecommendationsResult> {
  const bundled = normalizeSponsorCatalog(bundledSponsorCatalog, {
    locale: options.locale,
    now: options.now,
    source: SPONSOR_CATALOG_SOURCES.Bundled,
  })

  const cachedItems = await loadValidCachedCatalog(options)

  if (cachedItems) {
    return {
      items: cachedItems,
      source: SPONSOR_CATALOG_SOURCES.Cached,
    }
  }

  return {
    items: bundled.items,
    source: SPONSOR_CATALOG_SOURCES.Bundled,
  }
}
```

- [ ] **Step 6: Add the UI hook**

Create `src/features/AccountManagement/sponsors/useSponsorRecommendations.ts`:

```ts
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  selectSponsorRecommendations,
} from "./catalog"
import {
  SPONSOR_RECOMMENDATION_SURFACES,
  type SponsorRecommendationSurface,
} from "./constants"
import {
  loadSponsorRecommendations,
  refreshSponsorRecommendations,
  type LoadSponsorRecommendationsResult,
} from "./loader"
import type { SponsorRecommendation } from "./types"

interface UseSponsorRecommendationsOptions {
  surface: SponsorRecommendationSurface
}

interface UseSponsorRecommendationsResult {
  items: SponsorRecommendation[]
  isLoading: boolean
}

export function useSponsorRecommendations({
  surface,
}: UseSponsorRecommendationsOptions): UseSponsorRecommendationsResult {
  const { i18n } = useTranslation()
  const [result, setResult] = useState<LoadSponsorRecommendationsResult | null>(
    null,
  )
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    void loadSponsorRecommendations({ locale: i18n.language }).then((next) => {
      if (cancelled) return
      setResult(next)
      setIsLoading(false)
    })

    void refreshSponsorRecommendations({ locale: i18n.language }).then((next) => {
      if (cancelled || !next) return
      setResult(next)
    })

    return () => {
      cancelled = true
    }
  }, [i18n.language])

  const items = useMemo(
    () =>
      selectSponsorRecommendations(
        result?.items ?? [],
        surface ?? SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog,
      ),
    [result?.items, surface],
  )

  return { items, isLoading }
}
```

- [ ] **Step 7: Run the loader test**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/sponsors/loader.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit the loader slice**

```bash
git add src/services/core/storageKeys.ts src/features/AccountManagement/sponsors/storage.ts src/features/AccountManagement/sponsors/loader.ts src/features/AccountManagement/sponsors/useSponsorRecommendations.ts tests/features/AccountManagement/sponsors/loader.test.ts
git commit -m "feat(account): load sponsor recommendations"
```

## Task 3: Sponsor Recommendation UI Components and Actions

**Files:**
- Modify: `src/features/AccountManagement/testIds.ts`
- Create: `src/features/AccountManagement/sponsors/SponsorRecommendationCard.tsx`
- Create: `src/features/AccountManagement/sponsors/SponsorRecommendationsSection.tsx`
- Test: `tests/features/AccountManagement/sponsors/SponsorRecommendationsSection.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `tests/features/AccountManagement/sponsors/SponsorRecommendationsSection.test.tsx`:

```tsx
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { SponsorRecommendationsSection } from "~/features/AccountManagement/sponsors/SponsorRecommendationsSection"
import { SPONSOR_RECOMMENDATION_SURFACES } from "~/features/AccountManagement/sponsors/constants"
import { SPONSOR_SUPPORT_STATUS } from "~/features/AccountManagement/sponsors/types"
import { render, screen } from "~~/tests/test-utils/render"

describe("SponsorRecommendationsSection", () => {
  const openSpy = vi.fn()
  const onContinueAddAccount = vi.fn()
  const onOpenSiteSupportRequest = vi.fn()
  const onOpenBookmarkManager = vi.fn()
  const onOpenApiCredentialProfiles = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("open", openSpy)
  })

  it("renders supported sponsor primary and continuation actions", async () => {
    const user = userEvent.setup()

    render(
      <SponsorRecommendationsSection
        surface={SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog}
        items={[
          {
            id: "aihubmix",
            name: "AIHubMix",
            tagline: "Supported provider.",
            disclosure: "Partner",
            ctaLabel: "Register AIHubMix",
            supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
            primaryAffiliateUrl: "https://aihubmix.com/register",
            supportedAccount: {
              siteType: SITE_TYPES.AIHUBMIX,
              siteUrl: "https://aihubmix.com",
            },
            fallbackHints: {
              siteSupportRequest: false,
              bookmarkManager: false,
              apiCredentialProfiles: false,
            },
            source: "bundled",
            rank: 1,
          },
        ]}
        onContinueAddAccount={onContinueAddAccount}
        onOpenSiteSupportRequest={onOpenSiteSupportRequest}
        onOpenBookmarkManager={onOpenBookmarkManager}
        onOpenApiCredentialProfiles={onOpenApiCredentialProfiles}
      />,
    )

    expect(await screen.findByText("AIHubMix")).toBeInTheDocument()
    expect(screen.getByText("Supported provider.")).toBeInTheDocument()
    expect(screen.getByText("Partner")).toBeInTheDocument()
    expect(screen.getByText("account:sponsor.supportStatus.supported")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Register AIHubMix" }))
    expect(openSpy).toHaveBeenCalledWith(
      "https://aihubmix.com/register",
      "_blank",
      "noopener,noreferrer",
    )

    await user.click(
      screen.getByRole("button", {
        name: "account:sponsor.actions.continueAddAccount",
      }),
    )
    expect(onContinueAddAccount).toHaveBeenCalledWith({
      siteUrl: "https://aihubmix.com",
      siteType: SITE_TYPES.AIHUBMIX,
      source: "sponsor",
      sponsorId: "aihubmix",
    })
  })

  it("renders unsupported sponsor fallback actions as secondary guidance", async () => {
    const user = userEvent.setup()

    render(
      <SponsorRecommendationsSection
        surface={SPONSOR_RECOMMENDATION_SURFACES.Newcomer}
        items={[
          {
            id: "manual-provider",
            name: "Manual Provider",
            tagline: "Manual setup may be needed.",
            supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
            primaryAffiliateUrl: "https://manual.example.com",
            fallbackHints: {
              siteSupportRequest: true,
              bookmarkManager: true,
              apiCredentialProfiles: true,
            },
            source: "remote",
            rank: 2,
          },
        ]}
        onContinueAddAccount={onContinueAddAccount}
        onOpenSiteSupportRequest={onOpenSiteSupportRequest}
        onOpenBookmarkManager={onOpenBookmarkManager}
        onOpenApiCredentialProfiles={onOpenApiCredentialProfiles}
      />,
    )

    expect(await screen.findByText("Manual Provider")).toBeInTheDocument()
    expect(
      screen.getByText("account:sponsor.supportStatus.unsupported"),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "account:sponsor.actions.continueAddAccount",
      }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "account:sponsor.actions.requestSiteSupport",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "account:sponsor.actions.openBookmarkManager",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "account:sponsor.actions.openApiCredentialProfiles",
      }),
    )

    expect(onOpenSiteSupportRequest).toHaveBeenCalledWith("https://manual.example.com")
    expect(onOpenBookmarkManager).toHaveBeenCalledTimes(1)
    expect(onOpenApiCredentialProfiles).toHaveBeenCalledTimes(1)
  })

  it("renders nothing when no recommendations are available", () => {
    render(
      <SponsorRecommendationsSection
        surface={SPONSOR_RECOMMENDATION_SURFACES.Newcomer}
        items={[]}
        onContinueAddAccount={onContinueAddAccount}
        onOpenSiteSupportRequest={onOpenSiteSupportRequest}
        onOpenBookmarkManager={onOpenBookmarkManager}
        onOpenApiCredentialProfiles={onOpenApiCredentialProfiles}
      />,
    )

    expect(
      screen.queryByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations),
    ).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the component test and confirm it fails**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/sponsors/SponsorRecommendationsSection.test.tsx
```

Expected: fail because the sponsor UI components and test IDs do not exist.

- [ ] **Step 3: Add sponsor test IDs**

In `src/features/AccountManagement/testIds.ts`, add:

```ts
  sponsorRecommendations: "account-management-sponsor-recommendations",
  sponsorRecommendationCard: "account-management-sponsor-recommendation-card",
  sponsorPrimaryAction: "account-management-sponsor-primary-action",
  sponsorContinueAddAccountAction:
    "account-management-sponsor-continue-add-account-action",
  sponsorFallbackSiteSupportAction:
    "account-management-sponsor-fallback-site-support-action",
  sponsorFallbackBookmarkAction:
    "account-management-sponsor-fallback-bookmark-action",
  sponsorFallbackApiCredentialProfilesAction:
    "account-management-sponsor-fallback-api-credential-profiles-action",
```

- [ ] **Step 4: Implement `SponsorRecommendationCard`**

Create `src/features/AccountManagement/sponsors/SponsorRecommendationCard.tsx`:

```tsx
import { ExternalLink, LifeBuoy, Plus, Star } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "~/components/ui"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"

import {
  SPONSOR_SUPPORT_STATUS,
  type AddAccountPrefill,
  type SponsorRecommendation,
} from "./types"

interface SponsorRecommendationCardProps {
  item: SponsorRecommendation
  onContinueAddAccount: (prefill: AddAccountPrefill) => void
  onOpenSiteSupportRequest: (siteUrl?: string) => void
  onOpenBookmarkManager: () => void
  onOpenApiCredentialProfiles: () => void
}

function getSupportLabelKey(status: SponsorRecommendation["supportStatus"]) {
  switch (status) {
    case SPONSOR_SUPPORT_STATUS.Supported:
      return "sponsor.supportStatus.supported"
    case SPONSOR_SUPPORT_STATUS.GenericCompatible:
      return "sponsor.supportStatus.genericCompatible"
    case SPONSOR_SUPPORT_STATUS.Unsupported:
    default:
      return "sponsor.supportStatus.unsupported"
  }
}

export function SponsorRecommendationCard({
  item,
  onContinueAddAccount,
  onOpenSiteSupportRequest,
  onOpenBookmarkManager,
  onOpenApiCredentialProfiles,
}: SponsorRecommendationCardProps) {
  const { t } = useTranslation("account")

  const handlePrimaryClick = () => {
    window.open(item.primaryAffiliateUrl, "_blank", "noopener,noreferrer")
  }

  const handleContinueAddAccount = () => {
    if (!item.supportedAccount) return

    onContinueAddAccount({
      siteUrl: item.supportedAccount.siteUrl,
      siteType: item.supportedAccount.siteType,
      source: "sponsor",
      sponsorId: item.id,
    })
  }

  return (
    <Card
      padding="sm"
      className="border-gray-200 shadow-none dark:border-dark-border"
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendationCard}
    >
      <CardHeader bordered={false} padding="sm" className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm">{item.name}</CardTitle>
          <Badge variant="secondary">{t(getSupportLabelKey(item.supportStatus))}</Badge>
        </div>
        <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
          {item.tagline}
        </p>
        {item.disclosure ? (
          <p className="text-xs text-gray-500 dark:text-dark-text-tertiary">
            {item.disclosure}
          </p>
        ) : null}
      </CardHeader>
      <CardContent padding="sm" spacing="sm">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={handlePrimaryClick}
            leftIcon={<ExternalLink className="h-4 w-4" />}
            data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.sponsorPrimaryAction}
          >
            {item.ctaLabel ?? t("sponsor.actions.visitProvider")}
          </Button>
          {item.supportedAccount ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleContinueAddAccount}
              leftIcon={<Plus className="h-4 w-4" />}
              data-testid={
                ACCOUNT_MANAGEMENT_TEST_IDS.sponsorContinueAddAccountAction
              }
            >
              {t("sponsor.actions.continueAddAccount")}
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {item.fallbackHints.siteSupportRequest ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onOpenSiteSupportRequest(item.websiteUrl ?? item.primaryAffiliateUrl)}
              leftIcon={<LifeBuoy className="h-4 w-4" />}
              data-testid={
                ACCOUNT_MANAGEMENT_TEST_IDS.sponsorFallbackSiteSupportAction
              }
            >
              {t("sponsor.actions.requestSiteSupport")}
            </Button>
          ) : null}
          {item.fallbackHints.bookmarkManager ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onOpenBookmarkManager}
              leftIcon={<Star className="h-4 w-4" />}
              data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.sponsorFallbackBookmarkAction}
            >
              {t("sponsor.actions.openBookmarkManager")}
            </Button>
          ) : null}
          {item.fallbackHints.apiCredentialProfiles ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onOpenApiCredentialProfiles}
              data-testid={
                ACCOUNT_MANAGEMENT_TEST_IDS.sponsorFallbackApiCredentialProfilesAction
              }
            >
              {t("sponsor.actions.openApiCredentialProfiles")}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: Implement `SponsorRecommendationsSection`**

Create `src/features/AccountManagement/sponsors/SponsorRecommendationsSection.tsx`:

```tsx
import { useTranslation } from "react-i18next"

import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"

import { SponsorRecommendationCard } from "./SponsorRecommendationCard"
import type { SponsorRecommendationSurface } from "./constants"
import type { AddAccountPrefill, SponsorRecommendation } from "./types"

interface SponsorRecommendationsSectionProps {
  surface: SponsorRecommendationSurface
  items: SponsorRecommendation[]
  onContinueAddAccount: (prefill: AddAccountPrefill) => void
  onOpenSiteSupportRequest: (siteUrl?: string) => void
  onOpenBookmarkManager: () => void
  onOpenApiCredentialProfiles: () => void
}

export function SponsorRecommendationsSection({
  items,
  onContinueAddAccount,
  onOpenSiteSupportRequest,
  onOpenBookmarkManager,
  onOpenApiCredentialProfiles,
}: SponsorRecommendationsSectionProps) {
  const { t } = useTranslation("account")

  if (items.length === 0) {
    return null
  }

  return (
    <section
      className="space-y-3"
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
          {t("sponsor.recommendedProviders")}
        </h3>
      </div>
      <div className="grid gap-2">
        {items.map((item) => (
          <SponsorRecommendationCard
            key={item.id}
            item={item}
            onContinueAddAccount={onContinueAddAccount}
            onOpenSiteSupportRequest={onOpenSiteSupportRequest}
            onOpenBookmarkManager={onOpenBookmarkManager}
            onOpenApiCredentialProfiles={onOpenApiCredentialProfiles}
          />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 6: Run the component test**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/sponsors/SponsorRecommendationsSection.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit the reusable UI slice**

```bash
git add src/features/AccountManagement/testIds.ts src/features/AccountManagement/sponsors/SponsorRecommendationCard.tsx src/features/AccountManagement/sponsors/SponsorRecommendationsSection.tsx tests/features/AccountManagement/sponsors/SponsorRecommendationsSection.test.tsx
git commit -m "feat(account): add sponsor recommendation cards"
```

## Task 4: Add Account Sponsor Prefill Contract

**Files:**
- Modify: `src/features/AccountManagement/components/AccountDialog/models.ts`
- Modify: `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
- Modify: `src/features/AccountManagement/hooks/DialogStateContext.tsx`
- Modify: `src/hooks/useAddAccountHandler.ts`
- Test: `tests/features/AccountManagement/hooks/useAccountDialog.sponsorPrefill.test.tsx`
- Test: `tests/features/AccountManagement/hooks/DialogStateContext.sponsorPrefill.test.tsx`

- [ ] **Step 1: Write failing hook prefill tests**

Create `tests/features/AccountManagement/hooks/useAccountDialog.sponsorPrefill.test.tsx`:

```tsx
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { ACCOUNT_DIALOG_FORM_SOURCES } from "~/features/AccountManagement/components/AccountDialog/models"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const { mockUserPreferencesContext } = vi.hoisted(() => ({
  mockUserPreferencesContext: {
    current: {
      warnOnDuplicateAccountAdd: true,
      managedSiteType: "new-api",
      autoFillCurrentSiteUrlOnAccountAdd: true,
      autoProvisionKeyOnAccountAdd: false,
    },
  },
}))

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({
    openWithAccount: vi.fn(),
    openSub2ApiTokenCreationDialog: vi.fn(),
  }),
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()
  return {
    ...actual,
    useUserPreferencesContext: () => mockUserPreferencesContext.current,
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getActiveTabs: vi.fn(async () => []),
    onTabActivated: vi.fn(() => () => {}),
    onTabUpdated: vi.fn(() => () => {}),
    sendRuntimeMessage: vi.fn(),
  }
})

describe("useAccountDialog sponsor prefill", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).browser = {
      tabs: {
        query: vi.fn(async () => [
          {
            id: 1,
            url: "https://current-tab.example.com/path",
          },
        ]),
      },
    }
  })

  it("initializes add mode from sponsor prefill without waiting for current-tab detection", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        prefill: {
          siteUrl: "https://aihubmix.com",
          siteType: SITE_TYPES.AIHUBMIX,
          source: "sponsor",
          sponsorId: "aihubmix",
        },
      }),
    )

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://aihubmix.com")
      expect(result.current.state.siteType).toBe(SITE_TYPES.AIHUBMIX)
      expect(result.current.state.formSource).toBe(
        ACCOUNT_DIALOG_FORM_SOURCES.SPONSOR,
      )
    })
  })

  it("ignores invalid sponsor prefill and keeps the normal add flow", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        prefill: {
          siteUrl: "javascript:alert(1)",
          siteType: SITE_TYPES.AIHUBMIX,
          source: "sponsor",
          sponsorId: "aihubmix",
        },
      }),
    )

    await waitFor(() => {
      expect(result.current.state.url).toBe("")
      expect(result.current.state.formSource).toBe(
        ACCOUNT_DIALOG_FORM_SOURCES.MANUAL,
      )
    })
  })

  it("preserves manual edits after sponsor prefill is applied", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        prefill: {
          siteUrl: "https://aihubmix.com",
          siteType: SITE_TYPES.AIHUBMIX,
          source: "sponsor",
          sponsorId: "aihubmix",
        },
      }),
    )

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://aihubmix.com")
    })

    await act(async () => {
      result.current.handlers.handleUrlChange("https://manual.example.com/path")
    })

    expect(result.current.state.url).toBe("https://manual.example.com")
    expect(result.current.state.formSource).toBe(
      ACCOUNT_DIALOG_FORM_SOURCES.SPONSOR,
    )
  })
})
```

- [ ] **Step 2: Write failing dialog-state threading test**

Create `tests/features/AccountManagement/hooks/DialogStateContext.sponsorPrefill.test.tsx`:

```tsx
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import {
  DialogStateProvider,
  useDialogStateContext,
} from "~/features/AccountManagement/hooks/DialogStateContext"
import { render, screen } from "~~/tests/test-utils/render"

const accountDialogProps = vi.hoisted(() => ({
  current: null as any,
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    loadAccountData: vi.fn(),
  }),
}))

vi.mock("~/features/AccountManagement/components/AccountDialog", () => ({
  default: (props: any) => {
    accountDialogProps.current = props
    return <div data-testid="account-dialog">{JSON.stringify(props.prefill)}</div>
  },
}))

function Harness() {
  const { openAccountDialog } = useDialogStateContext()

  return (
    <button
      type="button"
      onClick={() =>
        void openAccountDialog({
          mode: DIALOG_MODES.ADD,
          prefill: {
            siteUrl: "https://aihubmix.com",
            siteType: SITE_TYPES.AIHUBMIX,
            source: "sponsor",
            sponsorId: "aihubmix",
          },
        })
      }
    >
      open
    </button>
  )
}

describe("DialogStateContext sponsor prefill", () => {
  it("threads add-account prefill into AccountDialog", async () => {
    const user = userEvent.setup()

    render(
      <DialogStateProvider>
        <Harness />
      </DialogStateProvider>,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await user.click(screen.getByRole("button", { name: "open" }))

    expect(await screen.findByTestId("account-dialog")).toHaveTextContent(
      "aihubmix",
    )
    expect(accountDialogProps.current.prefill).toEqual({
      siteUrl: "https://aihubmix.com",
      siteType: SITE_TYPES.AIHUBMIX,
      source: "sponsor",
      sponsorId: "aihubmix",
    })
  })
})
```

- [ ] **Step 3: Run prefill tests and confirm they fail**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/hooks/useAccountDialog.sponsorPrefill.test.tsx tests/features/AccountManagement/hooks/DialogStateContext.sponsorPrefill.test.tsx
```

Expected: fail because `prefill` and `ACCOUNT_DIALOG_FORM_SOURCES.SPONSOR` do not exist.

- [ ] **Step 4: Add sponsor form source and prop types**

In `src/features/AccountManagement/components/AccountDialog/models.ts`, add:

```ts
import type { AddAccountPrefill } from "~/features/AccountManagement/sponsors/types"
```

Add `SPONSOR` to `ACCOUNT_DIALOG_FORM_SOURCES`:

```ts
  SPONSOR: "sponsor",
```

Re-export the prefill type:

```ts
export type { AddAccountPrefill }
```

- [ ] **Step 5: Consume prefill in the dialog hook**

In `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`, add `prefill?: AddAccountPrefill | null` to `UseAccountDialogProps` and destructuring:

```ts
  prefill,
}: UseAccountDialogProps) {
```

Import `type AddAccountPrefill` from `../models`.

Add this helper near `normalizeSiteUrlForDuplicateCheck`:

```ts
function normalizeSponsorPrefill(
  prefill: AddAccountPrefill | null | undefined,
): AddAccountPrefill | null {
  if (!prefill || prefill.source !== "sponsor") return null
  if (!isAccountSiteType(prefill.siteType)) return null

  try {
    const url = new URL(prefill.siteUrl)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null

    return {
      ...prefill,
      siteUrl: `${url.protocol}//${url.host}`,
      siteType: prefill.siteType,
    }
  } catch {
    return null
  }
}
```

Update `resetForm` to accept the normalized prefill:

```ts
  const resetForm = useCallback(
    (nextPrefill?: AddAccountPrefill | null) => {
      newAccountRef.current = null
      detectedCookieStoreIdRef.current = null
      duplicateAccountWarningAcknowledgedSiteUrlRef.current = null
      hasConsumedAutoFillCurrentSiteUrlRef.current = Boolean(nextPrefill)
      setUrl(nextPrefill?.siteUrl ?? "")
      setDraft({
        ...createEmptyAccountDialogDraft(),
        siteType: nextPrefill?.siteType ?? SITE_TYPES.UNKNOWN,
      })
      const nextFlowState = getInitialFlowState(mode)
      setPhase(nextFlowState.phase)
      setFormSource(
        nextPrefill
          ? ACCOUNT_DIALOG_FORM_SOURCES.SPONSOR
          : nextFlowState.formSource,
      )
      setShowAccessToken(false)
      setDetectionError(null)
      setCurrentTabUrl(null)
      setIsAutoConfiguring(false)
      setIsImportingCookies(false)
      setShowCookiePermissionWarning(false)
      setIsImportingSub2apiSession(false)
      clearPostSaveWorkflowState()
      targetAccountRef.current = null
    },
    [clearPostSaveWorkflowState, mode],
  )
```

Update the open effect:

```ts
    if (isOpen) {
      const normalizedPrefill =
        mode === DIALOG_MODES.ADD ? normalizeSponsorPrefill(prefill) : null
      resetForm(normalizedPrefill)
      if (mode === DIALOG_MODES.EDIT && account) {
        loadAccountData(account.id)
      } else {
        checkCurrentTab()
      }
    }
  }, [isOpen, mode, account, prefill, resetForm, loadAccountData, checkCurrentTab])
```

- [ ] **Step 6: Thread prefill through dialog state**

In `src/features/AccountManagement/hooks/DialogStateContext.tsx`, import:

```ts
import type { AddAccountPrefill } from "~/features/AccountManagement/sponsors/types"
```

Update `DialogOptions` and `DialogState`:

```ts
interface DialogOptions {
  mode: DialogMode
  account?: DisplaySiteData | null
  prefill?: AddAccountPrefill | null
}

interface DialogState {
  isOpen: boolean
  mode: DialogMode
  account: DisplaySiteData | null
  prefill: AddAccountPrefill | null
}
```

Initialize and set prefill:

```ts
  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
    mode: DIALOG_MODES.ADD,
    account: null,
    prefill: null,
  })
```

```ts
      setDialogState({
        isOpen: true,
        mode: options.mode,
        account: options.account || null,
        prefill: options.prefill ?? null,
      })
```

Update `openAddAccount`:

```ts
  const openAddAccount = useCallback(
    (prefill?: AddAccountPrefill | null) =>
      openAccountDialog({ mode: DIALOG_MODES.ADD, prefill }),
    [openAccountDialog],
  )
```

Update the context type:

```ts
  openAddAccount: (prefill?: AddAccountPrefill | null) => void
```

Pass `prefill` into `AccountDialog`:

```tsx
          prefill={dialogState.prefill}
```

- [ ] **Step 7: Allow add-account handler prefill**

In `src/hooks/useAddAccountHandler.ts`, import `type AddAccountPrefill` and update the handler:

```ts
  const handleAddAccountClick = (prefill?: AddAccountPrefill | null) => {
    if (isFirefox() && isDesktopDevice() && !isExtensionSidePanel()) {
      showFirefoxWarningDialog()
    } else {
      openAddAccount(prefill)
    }
  }
```

- [ ] **Step 8: Run prefill tests**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/hooks/useAccountDialog.sponsorPrefill.test.tsx tests/features/AccountManagement/hooks/DialogStateContext.sponsorPrefill.test.tsx
```

Expected: pass.

- [ ] **Step 9: Commit the prefill contract**

```bash
git add src/features/AccountManagement/components/AccountDialog/models.ts src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts src/features/AccountManagement/hooks/DialogStateContext.tsx src/hooks/useAddAccountHandler.ts tests/features/AccountManagement/hooks/useAccountDialog.sponsorPrefill.test.tsx tests/features/AccountManagement/hooks/DialogStateContext.sponsorPrefill.test.tsx
git commit -m "feat(account): add sponsor prefill for add dialog"
```

## Task 5: Add Sponsor Recommendations to the Add Account Entry Phase

**Files:**
- Modify: `src/features/AccountManagement/components/AccountDialog/index.tsx`
- Modify: `src/locales/zh-CN/accountDialog.json`
- Test: `tests/features/AccountManagement/components/AccountDialog.test.tsx`

- [ ] **Step 1: Add failing AccountDialog rendering tests**

Append to `tests/features/AccountManagement/components/AccountDialog.test.tsx`:

```tsx
it("renders sponsor recommendations only in the add-account entry phase", async () => {
  mockState.phase = ACCOUNT_DIALOG_PHASES.SITE_INPUT
  mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.MANUAL

  render(
    <AccountDialog
      isOpen={true}
      onClose={vi.fn()}
      mode={DIALOG_MODES.ADD}
      onSuccess={vi.fn()}
      onError={vi.fn()}
    />,
  )

  expect(
    await screen.findByTestId("account-management-sponsor-recommendations"),
  ).toBeInTheDocument()

  mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
  render(
    <AccountDialog
      isOpen={true}
      onClose={vi.fn()}
      mode={DIALOG_MODES.ADD}
      onSuccess={vi.fn()}
      onError={vi.fn()}
    />,
  )

  expect(
    screen.queryByTestId("account-management-sponsor-recommendations"),
  ).not.toBeInTheDocument()
})
```

Add these mocks near the existing mocks in that test file:

```tsx
vi.mock("~/features/AccountManagement/sponsors/useSponsorRecommendations", () => ({
  useSponsorRecommendations: () => ({
    isLoading: false,
    items: [
      {
        id: "aihubmix",
        name: "AIHubMix",
        tagline: "Supported provider.",
        supportStatus: "supported",
        primaryAffiliateUrl: "https://aihubmix.com",
        supportedAccount: {
          siteType: "AIHubMix",
          siteUrl: "https://aihubmix.com",
        },
        fallbackHints: {
          siteSupportRequest: false,
          bookmarkManager: false,
          apiCredentialProfiles: false,
        },
        source: "bundled",
        rank: 1,
      },
    ],
  }),
}))
```

- [ ] **Step 2: Run the AccountDialog test and confirm it fails**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/components/AccountDialog.test.tsx
```

Expected: fail because `AccountDialog` does not render sponsor recommendations.

- [ ] **Step 3: Render recommendations in entry phase**

In `src/features/AccountManagement/components/AccountDialog/index.tsx`, import:

```ts
import { SPONSOR_RECOMMENDATION_SURFACES } from "~/features/AccountManagement/sponsors/constants"
import { SponsorRecommendationsSection } from "~/features/AccountManagement/sponsors/SponsorRecommendationsSection"
import { useSponsorRecommendations } from "~/features/AccountManagement/sponsors/useSponsorRecommendations"
import { openFullBookmarkManagerPage, openApiCredentialProfilesPage, openSiteSupportRequestPage } from "~/utils/navigation"
import type { AddAccountPrefill } from "~/features/AccountManagement/sponsors/types"
```

Add `prefill?: AddAccountPrefill | null` to `AccountDialogProps`, destructure it, and pass it to `useAccountDialog`.

Add inside the component:

```ts
  const sponsorRecommendations = useSponsorRecommendations({
    surface: SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog,
  })
  const showSponsorRecommendations =
    mode === DIALOG_MODES.ADD &&
    state.phase === ACCOUNT_DIALOG_PHASES.SITE_INPUT &&
    sponsorRecommendations.items.length > 0
```

Update the `Modal` class or props if the local `Modal` supports panel class names. If it does not, keep the existing modal width and use only responsive inner grid classes.

Inside the form, wrap `SiteInfoInput` and sponsor section:

```tsx
            <div
              className={
                showSponsorRecommendations
                  ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]"
                  : "grid gap-4"
              }
            >
              <div className="min-w-0">
                <SiteInfoInput {...siteInfoInputProps} />
              </div>
              {showSponsorRecommendations ? (
                <SponsorRecommendationsSection
                  surface={SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog}
                  items={sponsorRecommendations.items}
                  onContinueAddAccount={(nextPrefill) => {
                    handlers.handleUrlChange(nextPrefill.siteUrl)
                    setters.setSiteType(nextPrefill.siteType)
                  }}
                  onOpenSiteSupportRequest={(siteUrl) => {
                    void openSiteSupportRequestPage({ siteUrl })
                  }}
                  onOpenBookmarkManager={() => {
                    void openFullBookmarkManagerPage()
                  }}
                  onOpenApiCredentialProfiles={() => {
                    void openApiCredentialProfilesPage()
                  }}
                />
              ) : null}
            </div>
```

Keep `<AccountForm />` unchanged and only render it in `ACCOUNT_FORM`.

- [ ] **Step 4: Add Add Account dialog locale keys**

In `src/locales/zh-CN/accountDialog.json`, add no sponsor content keys unless the component needs dialog-specific labels. Fixed recommendation labels belong in `account.json` in Task 6. If this file is unchanged after implementation, do not stage it.

- [ ] **Step 5: Run the AccountDialog test**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/components/AccountDialog.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit Add Account dialog UI**

```bash
git add src/features/AccountManagement/components/AccountDialog/index.tsx tests/features/AccountManagement/components/AccountDialog.test.tsx
git commit -m "feat(account): show sponsors in add dialog entry"
```

If `src/locales/zh-CN/accountDialog.json` changed, include it only after verifying the diff contains real fixed UI labels.

## Task 6: Upgrade Newcomer Support Card

**Files:**
- Modify: `src/features/AccountManagement/components/NewcomerSupportCard.tsx`
- Modify: `src/locales/zh-CN/account.json`
- Test: `tests/features/AccountManagement/components/NewcomerSupportCard.test.tsx`

- [ ] **Step 1: Write failing newcomer-card tests**

Create `tests/features/AccountManagement/components/NewcomerSupportCard.test.tsx`:

```tsx
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { NewcomerSupportCard } from "~/features/AccountManagement/components/NewcomerSupportCard"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { render, screen } from "~~/tests/test-utils/render"

const openAddAccount = vi.fn()

vi.mock("~/features/AccountManagement/hooks/DialogStateContext", () => ({
  useDialogStateContext: () => ({
    openAddAccount,
  }),
}))

vi.mock("~/features/AccountManagement/sponsors/useSponsorRecommendations", () => ({
  useSponsorRecommendations: () => ({
    isLoading: false,
    items: [
      {
        id: "aihubmix",
        name: "AIHubMix",
        tagline: "Supported provider.",
        disclosure: "Partner",
        ctaLabel: "Register",
        supportStatus: "supported",
        primaryAffiliateUrl: "https://aihubmix.com",
        supportedAccount: {
          siteType: SITE_TYPES.AIHUBMIX,
          siteUrl: "https://aihubmix.com",
        },
        fallbackHints: {
          siteSupportRequest: false,
          bookmarkManager: false,
          apiCredentialProfiles: false,
        },
        source: "bundled",
        rank: 1,
      },
    ],
  }),
}))

describe("NewcomerSupportCard", () => {
  it("shows sponsor recommendations and keeps the manual add path", async () => {
    const user = userEvent.setup()

    render(<NewcomerSupportCard />)

    expect(await screen.findByText("AIHubMix")).toBeInTheDocument()
    expect(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "account:addFirstAccount" }),
    )

    expect(openAddAccount).toHaveBeenCalledWith()
  })
})
```

- [ ] **Step 2: Run the newcomer test and confirm it fails**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/components/NewcomerSupportCard.test.tsx
```

Expected: fail because `NewcomerSupportCard` does not use sponsors or `openAddAccount`.

- [ ] **Step 3: Upgrade `NewcomerSupportCard`**

In `src/features/AccountManagement/components/NewcomerSupportCard.tsx`, keep the docs/repo/about helpers, then import:

```ts
import { Plus } from "lucide-react"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import { SPONSOR_RECOMMENDATION_SURFACES } from "~/features/AccountManagement/sponsors/constants"
import { SponsorRecommendationsSection } from "~/features/AccountManagement/sponsors/SponsorRecommendationsSection"
import { useSponsorRecommendations } from "~/features/AccountManagement/sponsors/useSponsorRecommendations"
import {
  openApiCredentialProfilesPage,
  openFullBookmarkManagerPage,
  openSiteSupportRequestPage,
} from "~/utils/navigation"
```

Inside the component:

```ts
  const { openAddAccount } = useDialogStateContext()
  const sponsorRecommendations = useSponsorRecommendations({
    surface: SPONSOR_RECOMMENDATION_SURFACES.Newcomer,
  })
```

In the content section, render:

```tsx
        <SponsorRecommendationsSection
          surface={SPONSOR_RECOMMENDATION_SURFACES.Newcomer}
          items={sponsorRecommendations.items}
          onContinueAddAccount={openAddAccount}
          onOpenSiteSupportRequest={(siteUrl) => {
            void openSiteSupportRequestPage({ siteUrl })
          }}
          onOpenBookmarkManager={() => {
            void openFullBookmarkManagerPage()
          }}
          onOpenApiCredentialProfiles={() => {
            void openApiCredentialProfilesPage()
          }}
        />
```

Add a manual path button next to existing support actions:

```tsx
          <Button
            size="sm"
            variant="secondary"
            onClick={() => openAddAccount()}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            {t("addFirstAccount")}
          </Button>
```

If `sponsorRecommendations.items.length === 0`, keep the current star/docs/about layout and description behavior so normal empty account adding remains unchanged.

- [ ] **Step 4: Add account locale keys**

In `src/locales/zh-CN/account.json`, add under an existing top-level object or a new top-level `sponsor` object:

```json
"sponsor": {
  "actions": {
    "continueAddAccount": "继续添加此账号",
    "openApiCredentialProfiles": "使用 API 凭证配置",
    "openBookmarkManager": "保存到书签",
    "requestSiteSupport": "请求适配支持",
    "visitProvider": "访问服务商"
  },
  "recommendedProviders": "推荐服务商",
  "supportStatus": {
    "genericCompatible": "兼容路径",
    "supported": "可直接添加",
    "unsupported": "可能需要手动设置"
  }
}
```

- [ ] **Step 5: Run newcomer-card test**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/components/NewcomerSupportCard.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit newcomer placement**

```bash
git add src/features/AccountManagement/components/NewcomerSupportCard.tsx src/locales/zh-CN/account.json tests/features/AccountManagement/components/NewcomerSupportCard.test.tsx
git commit -m "feat(account): show sponsors in empty account onboarding"
```

## Task 7: i18n, Validation, and Integration

**Files:**
- Verify all task-scoped source, test, and generated locale files.

- [ ] **Step 1: Run focused sponsor and account tests**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/sponsors/catalog.test.ts tests/features/AccountManagement/sponsors/loader.test.ts tests/features/AccountManagement/sponsors/SponsorRecommendationsSection.test.tsx tests/features/AccountManagement/components/NewcomerSupportCard.test.tsx tests/features/AccountManagement/components/AccountDialog.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.sponsorPrefill.test.tsx tests/features/AccountManagement/hooks/DialogStateContext.sponsorPrefill.test.tsx
```

Expected: pass.

- [ ] **Step 2: Run i18n extraction CI**

Run:

```bash
pnpm run i18n:extract:ci
```

Expected: pass. If it reports locale updates, run:

```bash
pnpm run i18n:extract
```

Then inspect generated locale diffs and include only intended generated key-shape changes.

- [ ] **Step 3: Run type check**

Run:

```bash
pnpm compile
```

Expected: pass.

- [ ] **Step 4: Stage task-scoped files and run staged validation**

Stage only files created or modified by this plan. Do not stage unrelated `notify.py` or `store-description/`.

Run:

```bash
pnpm run validate:staged
```

Expected: pass.

- [ ] **Step 5: Commit final generated locale or validation fixes**

If Task 7 produced only generated locale files or small validation fixes, commit them:

```bash
git add src/locales/zh-CN/account.json src/locales/en/account.json src/locales/ja/account.json src/locales/zh-TW/account.json src/locales/vi/account.json
git commit -m "chore(i18n): sync sponsor recommendation copy"
```

Skip this commit if no files changed.

- [ ] **Step 6: Make the explicit E2E decision**

Do not add Playwright E2E for this first implementation if all behavior stays in:

- catalog validation and fallback semantics,
- component rendering,
- Add Account prefill state,
- options-page navigation callbacks.

Add one E2E only if execution introduces popup-specific continuation behavior or browser tab state that the Vitest tests cannot observe.

- [ ] **Step 7: Inspect final diff and status**

Run:

```bash
git status --porcelain
git log --oneline -8
```

Expected: recent commits correspond to the task slices above. Unrelated pre-existing untracked files such as `notify.py` and `store-description/` may remain and must be reported as untouched.

- [ ] **Step 8: Final handoff**

Report:

- commit hashes created,
- validation commands and results,
- generated locale files, if any,
- E2E decision,
- remote sponsor catalog URL used,
- unrelated local files left untouched.
