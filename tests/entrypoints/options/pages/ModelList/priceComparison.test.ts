import { describe, expect, it } from "vitest"

import {
  calculateWeightedTokenPrice,
  MODEL_PRICE_COMPARISON_PRESETS,
} from "~/features/ModelList/priceComparison"

describe("model price comparison", () => {
  it("defines the confirmed first-release workload presets and leaves unsupported meters unmodeled", () => {
    expect(MODEL_PRICE_COMPARISON_PRESETS).toMatchObject({
      "azure-conversation": {
        weights: {
          input: 84.54,
          output: 15.46,
          cacheRead: null,
          cacheWrite: null,
        },
      },
      "mooncake-tool-agent": {
        weights: {
          input: 97.93,
          output: 2.07,
          cacheRead: null,
          cacheWrite: null,
        },
      },
      "azure-code": {
        weights: {
          input: 98.66,
          output: 1.34,
          cacheRead: null,
          cacheWrite: null,
        },
      },
      "tracelab-coding-agent": {
        weights: {
          input: 4.25,
          output: 0.34,
          cacheRead: 95.41,
          cacheWrite: null,
        },
      },
    })
  })

  it("combines modeled token price buckets and skips unmodeled weights", () => {
    expect(
      calculateWeightedTokenPrice(
        {
          input: 2,
          output: 4,
          cacheRead: 0.2,
          cacheWrite: 2,
        },
        MODEL_PRICE_COMPARISON_PRESETS["azure-conversation"].weights,
      ),
    ).toBeCloseTo(230.92)
  })

  it("requires every positively weighted price bucket but ignores zero-weight buckets", () => {
    const pricesWithoutCache = {
      input: 2,
      output: 4,
    }

    expect(
      calculateWeightedTokenPrice(pricesWithoutCache, {
        input: 1,
        output: 1,
        cacheRead: 1,
        cacheWrite: null,
      }),
    ).toBeNull()
    expect(
      calculateWeightedTokenPrice(pricesWithoutCache, {
        input: 1,
        output: 1,
        cacheRead: null,
        cacheWrite: null,
      }),
    ).toBe(6)
  })

  it.each([
    ["negative", -1],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
  ])("rejects %s weights", (_label, inputWeight) => {
    expect(
      calculateWeightedTokenPrice(
        { input: 2, output: 4 },
        {
          input: inputWeight,
          output: 1,
          cacheRead: null,
          cacheWrite: null,
        },
      ),
    ).toBeNull()
  })

  it.each([
    ["negative", -1],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
  ])("rejects %s prices for positively weighted buckets", (_label, input) => {
    expect(
      calculateWeightedTokenPrice(
        { input, output: 4 },
        { input: 1, output: 1, cacheRead: null, cacheWrite: null },
      ),
    ).toBeNull()
  })

  it("requires at least one positively weighted bucket", () => {
    expect(
      calculateWeightedTokenPrice(
        { input: 2, output: 4 },
        { input: 0, output: 0, cacheRead: null, cacheWrite: null },
      ),
    ).toBeNull()
  })
})
