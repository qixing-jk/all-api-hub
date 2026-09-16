import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { summarizeModelListGroupAccess } from "~/features/ModelList/groupAccessSummary"
import { createAccountSource } from "~/features/ModelList/modelManagementSources"
import type { PreparedModelListSource } from "~/features/ModelList/sourcePreparation"
import { buildModelListAccountFixture } from "~~/tests/test-utils/modelListSource"

function evidence(
  id: string,
  canRepairGroupSelection: boolean,
  groupRatios: Record<string, number>,
) {
  return {
    source: createAccountSource({
      ...buildModelListAccountFixture(SITE_TYPES.NEW_API),
      id,
    }),
    groupRatios,
    canRepairGroupSelection,
  } satisfies Pick<
    PreparedModelListSource,
    "source" | "groupRatios" | "canRepairGroupSelection"
  >
}
describe("model list group access summary", () => {
  it("requires every context for the selected account to allow selection repair, including empty ones", () => {
    const result = summarizeModelListGroupAccess({
      usesAccountContexts: true,
      selectedAccountId: "selected",
      sources: [
        evidence("other", true, { other: 2 }),
        evidence("selected", true, { vip: 1 }),
        evidence("selected", false, {}),
      ],
    })
    expect(result.canRepairGroupSelection).toBe(false)
    expect(result.singleSourceGroupRatios).toEqual({})
    expect(result.canRepairGroupSelectionByAccountId).toEqual({
      other: true,
      selected: false,
    })
  })
  it("does not let later agreement restore conflicting ratios", () => {
    const result = summarizeModelListGroupAccess({
      usesAccountContexts: true,
      selectedAccountId: "selected",
      sources: [
        evidence("selected", true, { vip: 0 }),
        evidence("selected", true, { vip: 1 }),
        evidence("selected", true, { vip: 0 }),
      ],
    })
    expect(result.canRepairGroupSelection).toBe(true)
    expect(result.singleSourceGroupRatios).toEqual({})
  })
  it("compares normalized ratios by value rather than key insertion order", () => {
    const result = summarizeModelListGroupAccess({
      usesAccountContexts: true,
      selectedAccountId: "selected",
      sources: [
        evidence("selected", true, { a: 0, b: 1 }),
        evidence("selected", true, { b: 1, a: 0 }),
      ],
    })
    expect(result.singleSourceGroupRatios).toEqual({ a: 0, b: 1 })
  })
  it("does not borrow another account's authority when the selected account is missing", () => {
    const result = summarizeModelListGroupAccess({
      usesAccountContexts: true,
      selectedAccountId: "absent",
      sources: [evidence("other", true, { a: 1 })],
    })
    expect(result.canRepairGroupSelection).toBe(false)
    expect(result.singleSourceGroupRatios).toEqual({})
  })
  it("uses a single source without creating aggregate-account repair state", () => {
    const result = summarizeModelListGroupAccess({
      usesAccountContexts: false,
      sources: [evidence("single", true, { a: 0 })],
    })
    expect(result.canRepairGroupSelection).toBe(true)
    expect(result.singleSourceGroupRatios).toEqual({ a: 0 })
    expect(result.canRepairGroupSelectionByAccountId).toEqual({})
  })
})
