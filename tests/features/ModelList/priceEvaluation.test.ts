import { describe, expect, it } from "vitest"

import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { ModelListItem } from "~/features/ModelList/modelListItems"
import { createAccountSource } from "~/features/ModelList/modelManagementSources"
import {
  calculateModelListPrices,
  rankModelListPrices,
} from "~/features/ModelList/priceEvaluation"
import { MODEL_LIST_SORT_MODES } from "~/features/ModelList/sortModes"
import { prepareModelListSource } from "~/features/ModelList/sourcePreparation"
import { CALCULATED_PRICE_KINDS } from "~/services/modelPricing/pricingConstants"
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
