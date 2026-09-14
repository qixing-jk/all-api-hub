import { describe, expect, it } from "vitest"

import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type {
  CalculatedModelItem,
  ModelListItem,
} from "~/features/ModelList/modelListItems"
import {
  createAccountSource,
  createProfileSource,
} from "~/features/ModelList/modelManagementSources"
import {
  calculateModelListPrices,
  rankModelListPrices,
} from "~/features/ModelList/priceEvaluation"
import { MODEL_LIST_SORT_MODES } from "~/features/ModelList/sortModes"
import { prepareModelListSource } from "~/features/ModelList/sourcePreparation"
import { CALCULATED_PRICE_KINDS } from "~/services/modelPricing/pricingConstants"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const createAccountFixture = (siteType: AccountSiteType): DisplaySiteData => ({
  id: `account-${siteType}`,
  name: "Example Account",
  username: "example-user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  todayStatsAvailability: buildCompleteTodayStatsAvailability(),
  health: { status: SiteHealthStatus.Healthy },
  siteType,
  baseUrl: "https://account.example.invalid",
  token: "example-token",
  userId: "example-user-id",
  authType: AuthTypeEnum.AccessToken,
  checkIn: buildCheckInConfig(),
})

function row(
  id: string,
  ratios: Record<string, number>,
  usableGroups = ["a", "b"],
): ModelListItem {
  const account = { ...createAccountFixture(SITE_TYPES.NEW_API), id }
  const prepared = prepareModelListSource({
    source: createAccountSource(account),
    pricing: {
      success: true,
      data: [
        {
          model_name: "model",
          model_ratio: 1,
          model_price: 0,
          completion_ratio: 1,
          quota_type: 0,
          enable_groups: ["a", "b"],
          supported_endpoint_types: [],
        },
      ],
      usable_group: Object.fromEntries(usableGroups.map((g) => [g, true])),
      group_ratio: ratios,
    },
  })
  return {
    ...prepared.items[0],
    comparableModelIdentity: { key: "exact:model", displayName: "model" },
    resolvedVendor: { state: "unknown" },
  }
}
const options = {
  showRealPrice: false,
  priceComparisonWeights: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0 },
}
function calculate(rawItems: ModelListItem[], groups?: string[]) {
  return calculateModelListPrices({
    ...options,
    rawItems,
    getGroupCandidates: () => groups,
  })
}

describe("model list price evaluation", () => {
  it.each([false, true])(
    "sorts finite secondary prices before missing ones in either input order (reverse: %s)",
    (reverse) => {
      const items = calculate([
        row("missing-secondary", { a: 1 }),
        row("finite-secondary", { a: 1 }),
      ])
      for (const [index, item] of items.entries()) {
        item.model = { ...item.model, quota_type: 1 }
        item.calculatedPrice = {
          kind: CALCULATED_PRICE_KINDS.PER_CALL,
          usdPerCall: { input: 1, output: index === 0 ? Number.NaN : 2 },
        }
      }
      const result = rankModelListPrices({
        ...options,
        items: reverse ? items.toReversed() : items,
        sortMode: MODEL_LIST_SORT_MODES.PRICE_DESC,
        compareAcrossSources: true,
      })
      expect(result.map((item) => item.source)).toEqual([
        items[1].source,
        items[0].source,
      ])
      expect(result.map((item) => item.isLowestPrice)).toEqual([true, false])
    },
  )
  it("uses profile names to order equal legacy prices without account currency conversion", () => {
    const items = calculate([row("zulu", { a: 1 }), row("alpha", { a: 1 })])
    for (const [index, item] of items.entries()) {
      item.source = createProfileSource({
        id: `profile-${index}`,
        name: index === 0 ? "Zulu" : "Alpha",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://profile.example.invalid/v1",
        apiKey: "example-key",
        tagIds: [],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      })
      item.calculatedPrice = {
        kind: CALCULATED_PRICE_KINDS.TOKEN,
        usdPerMillionTokens: { input: 1, output: 1 },
      }
    }
    const result = rankModelListPrices({
      ...options,
      items,
      showRealPrice: true,
      sortMode: MODEL_LIST_SORT_MODES.PRICE_ASC,
      compareAcrossSources: true,
    })
    expect(result.map((item) => item.source)).toEqual([
      items[1].source,
      items[0].source,
    ])
    expect(result.every((item) => item.isLowestPrice)).toBe(true)
  })
  it("ranks legacy token prices using output and cache weights in the account currency", () => {
    const items = calculate([
      row("cached", { a: 1 }),
      row("uncached", { a: 1 }),
    ])
    items[0].calculatedPrice = {
      kind: CALCULATED_PRICE_KINDS.TOKEN,
      usdPerMillionTokens: {
        input: 10,
        output: 2,
        cacheRead: 1,
        cacheWrite: 1,
      },
    }
    items[1].calculatedPrice = {
      kind: CALCULATED_PRICE_KINDS.TOKEN,
      usdPerMillionTokens: {
        input: 1,
        output: 10,
        cacheRead: 4,
        cacheWrite: 4,
      },
    }
    const result = rankModelListPrices({
      ...options,
      items,
      showRealPrice: true,
      priceComparisonWeights: {
        input: 1,
        output: 1,
        cacheRead: 2,
        cacheWrite: 2,
      },
      sortMode: MODEL_LIST_SORT_MODES.PRICE_ASC,
      compareAcrossSources: true,
    })
    expect(result.map((item) => item.source)).toEqual(
      items.map((item) => item.source),
    )
    expect(result.map((item) => item.isLowestPrice)).toEqual([true, false])
  })
  it("orders legacy per-call prices by input then output and keeps missing prices last", () => {
    const items = calculate([
      row("high-output", { a: 1 }),
      row("low-output", { a: 1 }),
      row("missing", { a: 1 }),
    ])
    for (const item of items) item.model = { ...item.model, quota_type: 1 }
    items[0].calculatedPrice = {
      kind: CALCULATED_PRICE_KINDS.PER_CALL,
      usdPerCall: { input: 1, output: 3 },
    }
    items[1].calculatedPrice = {
      kind: CALCULATED_PRICE_KINDS.PER_CALL,
      usdPerCall: { input: 1, output: 2 },
    }
    items[2].calculatedPrice = {
      kind: CALCULATED_PRICE_KINDS.PER_CALL,
      usdPerCall: { input: Number.NaN, output: Number.NaN },
    }
    const result = rankModelListPrices({
      ...options,
      items,
      showRealPrice: true,
      sortMode: MODEL_LIST_SORT_MODES.PRICE_ASC,
      compareAcrossSources: true,
    })
    expect(result.map((item) => item.source)).toEqual([
      items[1].source,
      items[0].source,
      items[2].source,
    ])
    expect(result.map((item) => item.isLowestPrice)).toEqual([
      true,
      false,
      false,
    ])
    expect(result.map((item) => item.isPriceComparable)).toEqual([
      true,
      true,
      false,
    ])
  })
  it("compares finite legacy secondary prices even when the primary price is missing", () => {
    const items = calculate([
      row("missing-output", { a: 1 }),
      row("finite-output", { a: 1 }),
    ])
    for (const [index, item] of items.entries()) {
      item.model = { ...item.model, quota_type: 1 }
      item.calculatedPrice = {
        kind: CALCULATED_PRICE_KINDS.PER_CALL,
        usdPerCall: { input: Number.NaN, output: index === 0 ? Number.NaN : 2 },
      }
    }
    const result = rankModelListPrices({
      ...options,
      items,
      sortMode: MODEL_LIST_SORT_MODES.PRICE_DESC,
      compareAcrossSources: true,
    })
    expect(result.map((item) => item.isPriceComparable)).toEqual([true, false])
    expect(result[0].source).toEqual(items[1].source)
  })
  it("breaks equal prices by source labels and preserves order for identical row keys", () => {
    const first = calculate([row("first", { a: 1 })])[0]
    const second = calculate([row("second", { a: 1 })])[0]
    if (first.source.kind === "account") first.source.account.name = "Zulu"
    if (second.source.kind === "account") second.source.account.name = "Alpha"
    const duplicate: CalculatedModelItem = {
      ...second,
      hasUniquelyOptimalGroup: true,
    }
    const result = rankModelListPrices({
      ...options,
      items: [first, second, duplicate],
      sortMode: MODEL_LIST_SORT_MODES.PRICE_ASC,
      compareAcrossSources: true,
    })
    expect(result.map((item) => item.source)).toEqual([
      second.source,
      duplicate.source,
      first.source,
    ])
    expect(result.map((item) => item.hasUniquelyOptimalGroup)).toEqual([
      undefined,
      true,
      undefined,
    ])
  })
  it("distinguishes unrestricted candidates from an explicitly empty action scope", () => {
    const item = row("a", { a: 1, b: 2 })
    expect(calculate([item])).toHaveLength(1)
    expect(calculate([item], [])).toEqual([])
  })
  it("selects a valid zero multiplier and limits action scope to the selected best group", () => {
    const item = calculate([row("a", { a: 1, b: 0 })])[0]
    expect(item.effectiveGroup).toBe("b")
    expect(item.activeGroupContext.actionGroups).toEqual(["b"])
    expect(item.hasUniquelyOptimalGroup).toBe(true)
  })
  it("breaks tied group prices deterministically without claiming a unique optimum", () => {
    const item = calculate([row("a", { a: 1, b: 1 })], ["b", "a"])[0]
    expect(item.effectiveGroup).toBe("a")
    expect(item.hasUniquelyOptimalGroup).toBe(false)
  })
  it("keeps a usable unpriced group visible without inventing a multiplier", () => {
    const item = calculate([row("a", {})], ["b"])[0]
    expect(item.calculatedPrice.kind).toBe(CALCULATED_PRICE_KINDS.UNAVAILABLE)
    expect(item.activeGroupContext.actionGroups).toEqual(["b"])
  })
  it("marks tied complete minima and keeps unpriced rows last without mutating the input", () => {
    const items = calculate([
      row("missing", {}),
      row("costly", { a: 2 }),
      row("first", { a: 1 }),
      row("second", { a: 1 }),
    ])
    const before = structuredClone(items)
    const result = rankModelListPrices({
      ...options,
      items,
      sortMode: MODEL_LIST_SORT_MODES.PRICE_ASC,
      compareAcrossSources: true,
    })
    expect(
      result.map((i) =>
        i.source.kind === "account" ? i.source.account.id : "",
      ),
    ).toEqual(["first", "second", "costly", "missing"])
    expect(result.map((i) => i.isLowestPrice)).toEqual([
      true,
      true,
      false,
      false,
    ])
    expect(result.map((i) => i.isPriceComparable)).toEqual([
      true,
      true,
      true,
      false,
    ])
    expect(items).toEqual(before)
  })
})
