import { describe, expect, it } from "vitest"

import type {
  CalculatedModelItem,
  ModelListItem,
} from "~/features/ModelList/modelListItems"
import { createProfileSource } from "~/features/ModelList/modelManagementSources"
import {
  calculateModelListPrices,
  rankModelListPrices,
} from "~/features/ModelList/priceEvaluation"
import { MODEL_LIST_SORT_MODES } from "~/features/ModelList/sortModes"
import { MODEL_UNAVAILABLE_PRICE_REASONS } from "~/services/modelList/pricingModel"
import { CALCULATED_PRICE_KINDS } from "~/services/modelPricing/pricingConstants"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { atIndex } from "~~/tests/test-utils/indexedAccess"
import { buildModelListItemFixture } from "~~/tests/test-utils/modelListSource"

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
        buildModelListItemFixture("missing-secondary", { a: 1 }),
        buildModelListItemFixture("finite-secondary", { a: 1 }),
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
        items: reverse ? [...items].reverse() : items,
        sortMode: MODEL_LIST_SORT_MODES.PRICE_DESC,
        compareAcrossSources: true,
      })
      expect(result.map((item) => item.source)).toEqual([
        atIndex(items, 1).source,
        atIndex(items, 0).source,
      ])
      expect(result.map((item) => item.isLowestPrice)).toEqual([true, false])
    },
  )
  it("uses profile names to order equal legacy prices without account currency conversion", () => {
    const items = calculate([
      buildModelListItemFixture("zulu", { a: 1 }),
      buildModelListItemFixture("alpha", { a: 1 }),
    ])
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
      atIndex(items, 1).source,
      atIndex(items, 0).source,
    ])
    expect(result.every((item) => item.isLowestPrice)).toBe(true)
  })
  it("ranks legacy token prices using output and cache weights in the account currency", () => {
    const items = calculate([
      buildModelListItemFixture("cached", { a: 1 }),
      buildModelListItemFixture("uncached", { a: 1 }),
    ])
    atIndex(items, 0).calculatedPrice = {
      kind: CALCULATED_PRICE_KINDS.TOKEN,
      usdPerMillionTokens: {
        input: 10,
        output: 2,
        cacheRead: 1,
        cacheWrite: 1,
      },
    }
    atIndex(items, 1).calculatedPrice = {
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
      buildModelListItemFixture("high-output", { a: 1 }),
      buildModelListItemFixture("low-output", { a: 1 }),
      buildModelListItemFixture("missing", { a: 1 }),
    ])
    for (const item of items) item.model = { ...item.model, quota_type: 1 }
    atIndex(items, 0).calculatedPrice = {
      kind: CALCULATED_PRICE_KINDS.PER_CALL,
      usdPerCall: { input: 1, output: 3 },
    }
    atIndex(items, 1).calculatedPrice = {
      kind: CALCULATED_PRICE_KINDS.PER_CALL,
      usdPerCall: { input: 1, output: 2 },
    }
    atIndex(items, 2).calculatedPrice = {
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
      atIndex(items, 1).source,
      atIndex(items, 0).source,
      atIndex(items, 2).source,
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
      buildModelListItemFixture("missing-output", { a: 1 }),
      buildModelListItemFixture("finite-output", { a: 1 }),
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
    expect(atIndex(result, 0).source).toEqual(atIndex(items, 1).source)
  })
  it("breaks equal prices by source labels and preserves order for identical row keys", () => {
    const first = atIndex(
      calculate([buildModelListItemFixture("first", { a: 1 })]),
      0,
    )
    const second = atIndex(
      calculate([buildModelListItemFixture("second", { a: 1 })]),
      0,
    )
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
  it("retains revealed unavailable rows without fabricating prices or actions", () => {
    const denied = buildModelListItemFixture("a", {}, [])
    const destructuredSource0 = calculate([denied], [])
    const [item] = [atIndex(destructuredSource0, 0)]
    expect(item.calculatedPrice.kind).toBe(CALCULATED_PRICE_KINDS.UNAVAILABLE)
    expect(item.activeGroupContext.actionGroups).toEqual([])
    expect(item.effectiveGroup).toBeUndefined()
  })
  it("selects a valid zero multiplier and limits action scope to the selected best group", () => {
    const item = atIndex(
      calculate([buildModelListItemFixture("a", { a: 1, b: 0 })]),
      0,
    )
    expect(item.effectiveGroup).toBe("b")
    expect(item.activeGroupContext.actionGroups).toEqual(["b"])
    expect(item.hasUniquelyOptimalGroup).toBe(true)
  })
  it("breaks tied group prices deterministically without claiming a unique optimum", () => {
    const item = atIndex(
      calculate([buildModelListItemFixture("a", { a: 1, b: 1 })], ["b", "a"]),
      0,
    )
    expect(item.effectiveGroup).toBe("a")
    expect(item.hasUniquelyOptimalGroup).toBe(false)
  })
  it("returns unavailable when active groups have no ratios", () => {
    const item = buildModelListItemFixture("a", { a: 1, b: 2 })
    const result = atIndex(calculate([{ ...item, groupRatios: {} }]), 0)
    expect(result.calculatedPrice).toMatchObject({
      kind: CALCULATED_PRICE_KINDS.UNAVAILABLE,
      reason: MODEL_UNAVAILABLE_PRICE_REASONS.GROUP_RATIO_UNAVAILABLE,
    })
    expect(result.effectiveGroup).toBeUndefined()
  })

  it("reports per-call billing when a per-call model has no usable group ratio", () => {
    const item = buildModelListItemFixture("a", { a: 1, b: 2 })
    const result = atIndex(
      calculate([
        {
          ...item,
          model: { ...item.model, quota_type: 1 },
          groupRatios: {},
        },
      ]),
      0,
    )
    expect(result.calculatedPrice).toMatchObject({
      kind: CALCULATED_PRICE_KINDS.UNAVAILABLE,
      billingMode: "per-call",
      reason: MODEL_UNAVAILABLE_PRICE_REASONS.GROUP_RATIO_UNAVAILABLE,
    })
    expect(result.effectiveGroup).toBeUndefined()
  })

  it("keeps a usable unpriced group visible without inventing a multiplier", () => {
    const item = atIndex(
      calculate([buildModelListItemFixture("a", {})], ["b"]),
      0,
    )
    expect(item.calculatedPrice.kind).toBe(CALCULATED_PRICE_KINDS.UNAVAILABLE)
    expect(item.activeGroupContext.actionGroups).toEqual(["b"])
  })
  it("marks tied complete minima and keeps unpriced rows last without mutating the input", () => {
    const items = calculate([
      buildModelListItemFixture("missing", {}),
      buildModelListItemFixture("costly", { a: 2 }),
      buildModelListItemFixture("first", { a: 1 }),
      buildModelListItemFixture("second", { a: 1 }),
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
