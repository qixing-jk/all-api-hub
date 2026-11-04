import path from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, it, vi } from "vitest"

import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { hasValidCatalogFacts } from "~/services/modelCatalog/admission"
import {
  createModelPricingCacheKey,
  createProviderModelCatalogCacheKey,
} from "~/services/modelCatalog/loader"
import { isValidProviderModelCatalogPricing } from "~/services/modelList/providerCatalogAdmission"
import { type DisplaySiteData } from "~/types"

const fixtures = {
  ...(await import(
    pathToFileURL(path.resolve("scripts/doc-screenshot-data.mjs")).href
  )),
  ...(await import(
    pathToFileURL(path.resolve("scripts/doc-screenshot-routes.mjs")).href
  )),
}

it("keeps the displayed check-in run time stable across regeneration dates", () => {
  vi.useFakeTimers()
  try {
    vi.setSystemTime(new Date("2026-11-04T12:00:00Z"))
    const before = fixtures.getMockAutoCheckinStatus(
      fixtures.createTranslator("en"),
    )
    vi.setSystemTime(new Date("2027-01-15T12:00:00Z"))
    const after = fixtures.getMockAutoCheckinStatus(
      fixtures.createTranslator("en"),
    )
    expect(after.lastRunAt).toBe(before.lastRunAt)
  } finally {
    vi.useRealTimers()
  }
})

it("provides a complete hourly breakdown that preserves each demo day's totals", () => {
  const history = fixtures.getMockUsageHistory()
  for (const account of Object.values(history.accounts) as Array<{
    daily: Record<string, Record<string, number>>
    hourly: Record<string, Record<string, Record<string, number>>>
  }>) {
    for (const [day, totals] of Object.entries(account.daily)) {
      expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const hours = account.hourly[day] ?? {}
      expect(Object.keys(hours).sort()).toEqual(
        Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")),
      )
      for (const metric of Object.keys(totals)) {
        expect(
          Object.values(hours).reduce((sum, value) => sum + value[metric]!, 0),
        ).toBe(totals[metric])
      }
      for (const hour of Object.values(hours)) {
        expect(hour.totalTokens).toBe(
          hour.promptTokens! + hour.completionTokens!,
        )
      }
    }
  }
})

it("preserves daily totals when all demo token filters are selected", () => {
  const history = fixtures.getMockUsageHistory()
  for (const account of Object.values(history.accounts) as Array<{
    daily: Record<string, Record<string, number>>
    dailyByToken: Record<string, Record<string, Record<string, number>>>
  }>) {
    for (const [day, totals] of Object.entries(account.daily)) {
      const shares = Object.values(account.dailyByToken).map(
        (token) => token[day]!,
      )
      for (const metric of Object.keys(totals))
        expect(shares.reduce((sum, value) => sum + value[metric]!, 0)).toBe(
          totals[metric],
        )
      for (const share of shares)
        expect(share.totalTokens).toBe(
          share.promptTokens! + share.completionTokens!,
        )
    }
  }
})

it("keeps token latency samples and all additive latency facts consistent with daily totals", () => {
  const history = fixtures.getMockUsageHistory()
  for (const account of Object.values(history.accounts) as Array<{
    dailyByToken: Record<string, Record<string, { requests: number }>>
    latencyDaily: Record<
      string,
      {
        count: number
        sum: number
        slowCount: number
        unknownCount: number
        buckets: number[]
      }
    >
    latencyDailyByToken: Record<
      string,
      Record<
        string,
        {
          count: number
          sum: number
          slowCount: number
          unknownCount: number
          buckets: number[]
        }
      >
    >
  }>) {
    for (const [day, totals] of Object.entries(account.latencyDaily)) {
      const shares = Object.entries(account.latencyDailyByToken).map(
        ([id, token]) => {
          expect(token[day]!.count + token[day]!.unknownCount).toBe(
            account.dailyByToken[id]![day]!.requests,
          )
          return token[day]!
        },
      )
      for (const metric of [
        "count",
        "sum",
        "slowCount",
        "unknownCount",
      ] as const)
        expect(
          shares.reduce((sum, value) => sum + value[metric], 0),
        ).toBeCloseTo(totals[metric], 8)
      expect(totals.buckets.length).toBeGreaterThan(0)
      expect(totals.buckets.some((count) => count > 0)).toBe(true)
      for (let bucket = 0; bucket < totals.buckets.length; bucket++)
        expect(
          shares.reduce((sum, value) => sum + value.buckets[bucket]!, 0),
        ).toBe(totals.buckets[bucket])
    }
  }
})

it.each([
  ["zh", "开发主密钥 Default"],
  ["ja", "開発用メインキー Default"],
  ["en", "Default Dev API Key"],
])(
  "uses the token fixture's localized name in analytics (%s)",
  (locale, name) => {
    const history = fixtures.getMockUsageHistory(
      fixtures.createTranslator(locale),
    )
    const account = history.accounts["acc-my-newapi"]
    expect(account.tokenNamesById).toEqual({
      101: name,
      102: "Cursor IDE Key",
      103: "Claude Code CLI",
    })
  },
)

describe("documentation screenshot data", () => {
  for (const locale of ["zh", "en", "ja"]) {
    it(`shows supported platforms before the custom gateway (${locale})`, () => {
      const t = fixtures.createTranslator(locale)
      const accounts = fixtures.getMockAccounts()
      expect(
        JSON.stringify([accounts, fixtures.getMockApiCredentialProfiles(t)]),
      ).not.toMatch(/packy|CRS2/i)
      expect(
        accounts.map((account: { site_type: string }) => account.site_type),
      ).toEqual([
        "openrouter",
        "vercel-ai-gateway",
        "requesty",
        "novita",
        "aimlapi",
        "kimi",
        "AIHubMix",
        "laozhang",
        "anyrouter",
        "sub2api",
        "new-api",
      ])
      expect(
        accounts
          .slice(0, -1)
          .map((account: { site_name: string }) => account.site_name),
      ).toEqual([
        "OpenRouter",
        "Vercel AI Gateway",
        "Requesty",
        "Novita AI",
        "AI/ML API",
        "Kimi",
        "AIHubMix",
        "老张 API",
        "AnyRouter",
        "Sub2API",
      ])
      expect(accounts.at(-1).site_name).toBe("New API")
      for (const account of accounts) {
        for (const metric of Object.values(
          account.account_info.todayStatsAvailability,
        ) as { status: string }[]) {
          expect(metric.status).toBe("complete")
        }
        expect(account.configVersion).toBe(8)
        if (account.checkIn.automaticExecutionEnabled) {
          const knowledge =
            account.checkIn.methodKnowledge.methods[
              account.checkIn.selection.methodId
            ]
          expect(knowledge.status.today).toBe("checked")
        }
      }
    })
    it(`shows Coding Plan usage with healthy remaining capacity (${locale})`, () => {
      const profiles = fixtures.getMockApiCredentialProfiles(
        fixtures.createTranslator(locale),
      )
      const plans = profiles.filter((profile: { name: string }) =>
        profile.name.includes("Coding Plan"),
      )
      expect(plans).toHaveLength(2)
      for (const plan of plans) {
        expect(plan.telemetrySnapshot.health.status).toBe("healthy")
        expect(
          plan.telemetrySnapshot.facts.quota.windows.length,
        ).toBeGreaterThanOrEqual(2)
        for (const window of plan.telemetrySnapshot.facts.quota.windows) {
          expect(window.remainingPercent).toBeGreaterThan(0)
          expect(window.remainingPercent).toBeLessThanOrEqual(100)
          expect(window.resetTime).toBeGreaterThan(
            plan.telemetrySnapshot.lastSyncTime,
          )
        }
      }
    })
    it(`keeps the latest balance history aligned with the accounts (${locale})`, () => {
      const accounts = fixtures.getMockAccounts()
      const history = fixtures.getMockBalanceHistory().snapshotsByAccountId
      for (const account of accounts) {
        const latestDay = Object.keys(history[account.id]).sort().at(-1)!
        expect(history[account.id][latestDay].quota).toBe(
          account.account_info.quota,
        )
        expect(history[account.id][latestDay].today_quota_consumption).toBe(
          account.account_info.today_quota_consumption,
        )
        expect(history[account.id][latestDay].today_income).toBe(
          account.account_info.today_income,
        )
        const days = Object.keys(history[account.id]).sort()
        expect(days).toHaveLength(7)
        const netChange = days.reduce((total, day) => {
          const snapshot = history[account.id][day]
          return (
            total + snapshot.today_income - snapshot.today_quota_consumption
          )
        }, 0)
        expect(
          history[account.id][latestDay].quota -
            history[account.id][days[0]!].quota,
        ).toBe(netChange)
        for (let index = 1; index < days.length; index++) {
          const current = history[account.id][days[index]!]
          const previous = history[account.id][days[index - 1]!]
          expect(current.quota - previous.quota).toBe(
            current.today_income - current.today_quota_consumption,
          )
        }
      }
    })
    it(`supplies messages for successful check-ins (${locale})`, () => {
      const status = fixtures.getMockAutoCheckinStatus(
        fixtures.createTranslator(locale),
      )
      expect(status.summary.successCount).toBe(
        Object.values(status.perAccount).length,
      )
      for (const result of Object.values(status.perAccount) as {
        status: string
        messageKey?: string
        message?: string
      }[]) {
        expect(
          result.status === "success" ? result.messageKey : result.message,
        ).toBe(
          result.status === "success"
            ? "autoCheckin:providerFallback.checkinSuccessful"
            : fixtures.createTranslator(locale)("Already checked in today"),
        )
      }
    })
  }
})

it("supplies valid cached catalogs with distinct prices for cross-site comparison", () => {
  const cache = fixtures.getMockModelPricingCache()
  const prices: number[] = []
  for (const account of fixtures.getMockAccounts()) {
    const capabilities = getSiteTypeCapabilities(account.site_type).account!
    const catalog = capabilities.providerModelCatalog
    const displayAccount = {
      id: account.id,
      baseUrl: account.site_url,
      userId: account.account_info.id,
      siteType: account.site_type,
      authType: account.authType,
    } as DisplaySiteData
    if (!catalog && !capabilities.modelPricing) continue
    const key = catalog
      ? createProviderModelCatalogCacheKey(catalog.source.id)
      : createModelPricingCacheKey(displayAccount)
    const entry = cache[key]
    expect(entry, account.site_name).toBeDefined()
    expect(hasValidCatalogFacts(entry.pricing), account.site_name).toBe(true)
    if (catalog) {
      expect(
        isValidProviderModelCatalogPricing(entry.pricing, account.site_type),
        account.site_name,
      ).toBe(true)
    }
    const model = entry.pricing.data.find(
      (model: { model_name: string }) => model.model_name === "deepseek-chat",
    )
    if (model) prices.push(model.token_price_usd_per_million.input)
  }
  expect(prices.length).toBeGreaterThanOrEqual(5)
  expect(new Set(prices).size).toBe(prices.length)
  expect(prices.every((price) => price > 0)).toBe(true)
})

it("seeds imported keys as matching managed-site channels", async () => {
  const routes = new Map<string, (route: unknown) => Promise<void>>()
  await fixtures.setupRoutes(
    {
      route: async (
        pattern: string,
        handler: (route: unknown) => Promise<void>,
      ) => routes.set(pattern, handler),
    },
    fixtures.createTranslator("en"),
  )
  let response = { body: "" }
  await routes.get("https://managed.example.invalid/**")!({
    request: () => ({
      url: () => "https://managed.example.invalid/api/channel/search",
    }),
    fulfill: async (payload: { body: string }) => {
      response = payload
    },
  })
  const channels = JSON.parse(response.body).data.items
  expect(channels).toContainEqual(
    expect.objectContaining({
      base_url: "https://newapi.example.com",
      key: "sk-ah-9a8b7c6d5e4f3a2b1c0d",
    }),
  )
  expect(channels).toContainEqual(
    expect.objectContaining({
      base_url: "https://sub2api.example.com",
      key: "sk-ah-88a91c0e3d2b5f4a6c7e",
    }),
  )
  let tokenResponse: { data?: { key: string } } = {}
  await routes.get("https://newapi.example.com/**")!({
    request: () => ({ url: () => "https://newapi.example.com/api/token/101" }),
    fulfill: async (payload: { json: { data: { key: string } } }) => {
      tokenResponse = payload.json
    },
  })
  expect(tokenResponse.data?.key).toBe("sk-ah-9a8b7c6d5e4f3a2b1c0d")
})

it.each(["/api/v1/models", "/api/v1/models/user"])(
  "serves OpenRouter model prices from the seeded catalog (%s)",
  async (endpoint) => {
    const routes = new Map<string, (route: unknown) => Promise<void>>()
    await fixtures.setupRoutes(
      {
        route: async (
          pattern: string,
          handler: (route: unknown) => Promise<void>,
        ) => routes.set(pattern, handler),
      },
      fixtures.createTranslator("en"),
    )
    let response: {
      data: Array<{
        id: string
        pricing: { prompt: string; completion: string }
      }>
    } = { data: [] }
    await routes.get("https://openrouter.ai/**")!({
      request: () => ({ url: () => `https://openrouter.ai${endpoint}` }),
      fulfill: async (payload: { json: typeof response }) => {
        response = payload.json
      },
    })
    expect(response.data).toContainEqual(
      expect.objectContaining({
        id: "deepseek-chat",
        pricing: expect.objectContaining({
          prompt: "3e-7",
          completion: "0.0000012",
        }),
      }),
    )
    expect(response.data).toHaveLength(5)
  },
)
