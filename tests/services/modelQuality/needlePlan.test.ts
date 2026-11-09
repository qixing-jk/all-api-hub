import { describe, expect, it } from "vitest"

import { CONTEXT_TOKEN_ENCODINGS } from "~/services/verification/modelQuality/contextTokenConstants"
import { NEEDLE_PLAN_SOURCES } from "~/services/verification/modelQuality/needleConstants"
import {
  createNeedlePlan,
  getNeedleInputPresets,
  selectNeedleCells,
} from "~/services/verification/modelQuality/needlePlan"

it("keeps row, column and cell selections distinct when deciding whether a run is a retest", () => {
  const plan = createNeedlePlan({
    counter: { encoding: CONTEXT_TOKEN_ENCODINGS.O200k, estimated: true },
    maxInputTokens: 16384,
  })
  const previous = [{ targetTokens: 8192, depth: 50 }]
  expect(selectNeedleCells(plan, { targetTokens: 16384 }, previous)).toEqual({
    cells: [
      { targetTokens: 16384, depth: 10 },
      { targetTokens: 16384, depth: 50 },
      { targetTokens: 16384, depth: 90 },
    ],
    retest: false,
  })
  expect(selectNeedleCells(plan, { depth: 50 }, previous)).toEqual({
    cells: [
      { targetTokens: 8192, depth: 50 },
      { targetTokens: 16384, depth: 50 },
    ],
    retest: true,
  })
  expect(
    selectNeedleCells(plan, { targetTokens: 8192, depth: 10 }, previous),
  ).toEqual({ cells: [{ targetTokens: 8192, depth: 10 }], retest: false })
  expect(selectNeedleCells(plan, previous[0], previous)).toEqual({
    cells: previous,
    retest: true,
  })
  expect(() => selectNeedleCells(plan, { targetTokens: 32768 })).toThrow(
    "Invalid needle selection",
  )
})

it.each([
  {
    limits: {},
    expected: [16384, 32768, 65536, 131072, 262144, 524288, 1048576],
  },
  {
    limits: { declaredContext: 131072 },
    expected: [16384, 32768, 65536, 130048],
  },
  {
    limits: { declaredContext: 1048576 },
    expected: [16384, 32768, 65536, 131072, 262144, 524288, 1047552],
  },
  {
    limits: { declaredContext: 32768, declaredInput: 30000 },
    expected: [16384, 30000],
  },
  {
    limits: { declaredContext: 32768, declaredInput: 50000 },
    expected: [16384, 31744],
  },
  { limits: { declaredInput: 32768 }, expected: [16384, 32768] },
  { limits: { declaredContext: 8192 }, expected: [7168] },
  { limits: { declaredContext: 1024 }, expected: [] },
  {
    limits: { declaredContext: 2097152 },
    expected: [16384, 32768, 65536, 131072, 262144, 524288, 1048576],
  },
])("generates input presets within $limits", ({ limits, expected }) => {
  expect(
    getNeedleInputPresets({
      encoding: CONTEXT_TOKEN_ENCODINGS.O200k,
      estimated: true,
      ...limits,
    }),
  ).toEqual(expected)
})

describe("automatic needle test planning", () => {
  it("does not fall back to a larger sweep when the declared window cannot fit reserved output", () => {
    expect(() =>
      createNeedlePlan({
        counter: {
          encoding: CONTEXT_TOKEN_ENCODINGS.O200k,
          estimated: true,
          declaredContext: 1024,
        },
      }),
    ).toThrow()
  })
  it("uses matching measured input to plan lengths without another capacity request", () => {
    const plan = createNeedlePlan({
      counter: {
        encoding: CONTEXT_TOKEN_ENCODINGS.O200k,
        estimated: true,
        declaredContext: 131072,
      },
      capacity: {
        lowerBoundTokens: 98304,
        counter: { encoding: CONTEXT_TOKEN_ENCODINGS.O200k, estimated: true },
      },
    })
    expect(plan.source).toBe("measured")
    expect(plan.lengths).toEqual([8192, 16384, 32768, 65536, 98304])
    expect(plan.depths).toEqual([10, 50, 90])
    expect(plan.requests).toBe(15)
    expect(plan.totalInputTokens).toBe(663552)
  })
  it("keeps unknown capacity runnable and invites a capacity test", () => {
    expect(
      createNeedlePlan({
        counter: { encoding: CONTEXT_TOKEN_ENCODINGS.O200k, estimated: true },
      }),
    ).toMatchObject({
      source: NEEDLE_PLAN_SOURCES.Fallback,
      lengths: [8192, 16384],
      requests: 6,
      totalInputTokens: 73728,
    })
  })
  it("reserves output space within a declared total window", () => {
    expect(
      createNeedlePlan({
        counter: {
          encoding: CONTEXT_TOKEN_ENCODINGS.Cl100k,
          estimated: false,
          declaredContext: 32768,
          declaredInput: 30000,
        },
      }),
    ).toMatchObject({
      source: NEEDLE_PLAN_SOURCES.Declared,
      lengths: [8192, 16384, 30000],
    })
    expect(
      createNeedlePlan({
        counter: {
          encoding: CONTEXT_TOKEN_ENCODINGS.Cl100k,
          estimated: false,
          declaredContext: 32768,
        },
      }).lengths,
    ).toEqual([8192, 16384, 31744])
  })
  it("ignores measurements from a different tokenizer or an unverified credential", () => {
    const counter = {
      encoding: CONTEXT_TOKEN_ENCODINGS.Cl100k,
      estimated: false,
    }
    expect(
      createNeedlePlan({
        counter,
        capacity: {
          lowerBoundTokens: 100000,
          counter: { encoding: CONTEXT_TOKEN_ENCODINGS.O200k, estimated: true },
        },
      }).source,
    ).toBe("fallback")
    expect(
      createNeedlePlan({
        counter,
        capacity: {
          lowerBoundTokens: 100000,
          counter,
          requiresCredentialVerification: true,
        },
      }).source,
    ).toBe("fallback")
  })
})
