import { describe, expect, it } from "vitest"

import {
  MODEL_GROUP_ACCESS_STATES,
  normalizeGroupRatios,
  resolveActiveModelGroupContext,
  resolveModelGroupContext,
} from "~/features/ModelList/groupContext"
import { MODEL_LIST_GROUP_SEMANTICS } from "~/features/ModelList/modelManagementSources"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
} from "~/services/modelList/pricingModel"

const BASE_MODEL = {
  enable_groups: ["default", "vip"],
}

describe("normalizeGroupRatios", () => {
  it("trims keys, keeps the first normalized key, and preserves finite zero", () => {
    expect(
      normalizeGroupRatios({
        " vip ": 0,
        vip: 2,
        " ": 3,
        infinite: Number.POSITIVE_INFINITY,
        invalid: Number.NaN,
      }),
    ).toEqual({ vip: 0 })
  })

  it("preserves prototype-like group names as own data keys", () => {
    const ratios = Object.fromEntries([
      ["constructor", 1],
      ["toString", 2],
      ["__proto__", 3],
    ])

    const normalized = normalizeGroupRatios(ratios)

    expect(normalized).toEqual(ratios)
    expect(Object.keys(normalized)).toEqual([
      "constructor",
      "toString",
      "__proto__",
    ])
    expect(Object.hasOwn(normalized, "__proto__")).toBe(true)
  })
})

describe("resolveModelGroupContext", () => {
  it("separates supported, usable, and priceable groups", () => {
    expect(
      resolveModelGroupContext({
        groupSemantics: MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
        model: BASE_MODEL,
        usableGroup: { default: { description: "Default" } },
        groupRatios: { default: 1 },
      }),
    ).toEqual({
      accessState: MODEL_GROUP_ACCESS_STATES.KNOWN,
      supportedGroups: ["default", "vip"],
      usableGroups: ["default"],
      priceableGroups: ["default"],
    })
  })

  it("normalizes group names without sorting and leaves usable unpriced groups usable", () => {
    expect(
      resolveModelGroupContext({
        groupSemantics: MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
        model: { enable_groups: [" vip ", "", "default", "vip"] },
        usableGroup: { " vip ": true, default: true },
        groupRatios: { default: 1 },
      }),
    ).toEqual({
      accessState: MODEL_GROUP_ACCESS_STATES.KNOWN,
      supportedGroups: ["vip", "default"],
      usableGroups: ["vip", "default"],
      priceableGroups: ["default"],
    })
  })

  it("uses finite priced groups as a compatible fallback when usable access is empty", () => {
    expect(
      resolveModelGroupContext({
        groupSemantics: MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
        model: BASE_MODEL,
        usableGroup: {},
        groupRatios: { default: 0, vip: Number.NaN },
      }),
    ).toEqual({
      accessState: MODEL_GROUP_ACCESS_STATES.COMPATIBLE_PRICED_FALLBACK,
      supportedGroups: ["default", "vip"],
      usableGroups: ["default"],
      priceableGroups: ["default"],
    })
  })

  it("keeps a nonempty usable map authoritative when it does not support the model", () => {
    expect(
      resolveModelGroupContext({
        groupSemantics: MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
        model: { enable_groups: ["vip"] },
        usableGroup: { default: true },
        groupRatios: { vip: 1 },
      }),
    ).toEqual({
      accessState: MODEL_GROUP_ACCESS_STATES.KNOWN,
      supportedGroups: ["vip"],
      usableGroups: [],
      priceableGroups: [],
    })
  })

  it("distinguishes unavailable price precision from known empty direct access", () => {
    const unknown = resolveModelGroupContext({
      groupSemantics: MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
      model: {
        ...BASE_MODEL,
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
        },
      },
      usableGroup: {},
      groupRatios: {},
    })
    const knownEmpty = resolveModelGroupContext({
      groupSemantics: MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
      model: BASE_MODEL,
      usableGroup: {},
      groupRatios: {},
    })

    expect(unknown.accessState).toBe(MODEL_GROUP_ACCESS_STATES.UNKNOWN)
    expect(knownEmpty).toMatchObject({
      accessState: MODEL_GROUP_ACCESS_STATES.KNOWN,
      usableGroups: [],
      priceableGroups: [],
    })
  })

  it("treats a catalog source without pricing as unknown group access", () => {
    const context = resolveModelGroupContext({
      groupSemantics: MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
      model: BASE_MODEL,
      usableGroup: {},
      groupRatios: {},
      modelListSource: {
        kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
        supportsPricing: false,
      },
    })

    expect(context.accessState).toBe(MODEL_GROUP_ACCESS_STATES.UNKNOWN)
  })

  it("preserves supported metadata when group semantics are not applicable", () => {
    expect(
      resolveModelGroupContext({
        groupSemantics: MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE,
        model: BASE_MODEL,
        usableGroup: { default: true },
        groupRatios: { default: 1 },
      }),
    ).toEqual({
      accessState: MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE,
      supportedGroups: ["default", "vip"],
      usableGroups: [],
      priceableGroups: [],
    })
  })
})

describe("resolveActiveModelGroupContext", () => {
  const context = {
    accessState: MODEL_GROUP_ACCESS_STATES.KNOWN,
    supportedGroups: ["default", "vip"],
    usableGroups: ["default", "vip"],
    priceableGroups: ["default"],
  }

  it("keeps a selected usable unpriced group actionable", () => {
    expect(
      resolveActiveModelGroupContext({
        context,
        candidateGroups: ["vip"],
      }),
    ).toEqual({
      activeUsableGroups: ["vip"],
      activePriceableGroups: [],
      actionGroups: ["vip"],
    })
  })

  it("distinguishes omitted candidates from an explicit empty selection", () => {
    expect(resolveActiveModelGroupContext({ context })).toMatchObject({
      activeUsableGroups: ["default", "vip"],
    })
    expect(
      resolveActiveModelGroupContext({ context, candidateGroups: [] }),
    ).toEqual({
      activeUsableGroups: [],
      activePriceableGroups: [],
      actionGroups: [],
    })
  })

  it("narrows actions to the effective priced group", () => {
    expect(
      resolveActiveModelGroupContext({
        context: { ...context, priceableGroups: ["default", "vip"] },
        effectiveGroup: " vip ",
      }).actionGroups,
    ).toEqual(["vip"])
  })
})
