import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { planManagedSiteTokenBatchImport } from "~/services/managedSites/batchImport/tokenBatchImportPlan"
import type { ExecutableManagedSiteTokenBatchExportPreviewItem } from "~/types/managedSiteTokenBatchExport"

const item = (
  id: string,
  models: string[],
  url = "https://relay.test/v1",
): ExecutableManagedSiteTokenBatchExportPreviewItem => ({
  id,
  accountId: "account",
  accountName: "Relay",
  runtimeKeyId: id,
  runtimeKeyName: id,
  status: "ready",
  warningCodes: [],
  draft: {
    name: `Relay ${id}`,
    type: "chat",
    key: `key-${id}`,
    base_url: url,
    models,
    groups: [],
    enabled: true,
  },
})

describe("public batch import plan", () => {
  it("keeps distinct invalid endpoints apart while normalizing surrounding whitespace", () => {
    const plan = planManagedSiteTokenBatchImport(
      SITE_TYPES.MAGPIE,
      [
        item("a", [], " invalid-one "),
        item("b", [], "invalid-one"),
        item("c", [], "invalid-two"),
      ],
      "grouped",
    )
    expect(plan.map((group) => group.itemIds)).toEqual([["a", "b"], ["c"]])
  })
  it("requires a choice for multiple existing channels and accepts an explicit new channel", () => {
    const first = {
      ref: {
        siteType: "magpie",
        kind: "channel",
        scopeKey: "http://magpie.test",
        resourceId: "first",
      },
      name: "First",
    } as const
    const second = {
      ...first,
      ref: { ...first.ref, resourceId: "second" },
      name: "Second",
    }
    const input = item("a", ["m1"])
    input.existingImportTargets = [first, second]
    expect(
      planManagedSiteTokenBatchImport(SITE_TYPES.MAGPIE, [input], "reuse")[0],
    ).toMatchObject({ requiresTargetSelection: true, target: undefined })
    expect(
      planManagedSiteTokenBatchImport(SITE_TYPES.MAGPIE, [input], "reuse", {
        a: second.ref,
      })[0],
    ).toMatchObject({ requiresTargetSelection: false, target: second })
    expect(
      planManagedSiteTokenBatchImport(SITE_TYPES.MAGPIE, [input], "reuse", {
        a: null,
      })[0],
    ).toMatchObject({ requiresTargetSelection: false, target: undefined })
    expect(
      planManagedSiteTokenBatchImport(SITE_TYPES.MAGPIE, [input], "reuse", {
        a: { ...first.ref, scopeKey: "http://different.test" },
      })[0],
    ).toMatchObject({ requiresTargetSelection: true, target: undefined })
  })
  it("targets an existing same-endpoint channel while preserving the new-key group", () => {
    const target = {
      ref: {
        siteType: "magpie",
        kind: "channel",
        scopeKey: "http://magpie.test",
        resourceId: "existing",
      },
      name: "Coding group",
    } as const
    const inputs = [item("a", ["m1"]), item("b", ["m2"])]
    for (const input of inputs) input.existingImportTargets = [target]
    expect(
      planManagedSiteTokenBatchImport(SITE_TYPES.MAGPIE, inputs, "reuse"),
    ).toMatchObject([
      {
        itemIds: ["a", "b"],
        target,
        requiresTargetSelection: false,
        draft: { credentials: ["key-a", "key-b"] },
      },
    ])
  })

  it("deduplicates grouped key aliases without losing distinct model hints", () => {
    const first = item("a", ["m1"])
    const second = item("b", ["m2"])
    second.draft.key = first.draft.key
    expect(
      planManagedSiteTokenBatchImport(
        SITE_TYPES.MAGPIE,
        [first, second],
        "grouped",
      )[0],
    ).toMatchObject({
      itemIds: ["a", "b"],
      draft: { credentials: ["key-a"], models: ["m1", "m2"] },
    })
  })

  it("keeps incompatible native types and unsupported resources separate", () => {
    const first = item("a", ["m1"])
    const second = item("b", ["m1"])
    second.draft.type = "anthropic"
    expect(
      planManagedSiteTokenBatchImport(
        SITE_TYPES.MAGPIE,
        [first, second],
        "grouped",
      ),
    ).toHaveLength(2)
    expect(
      planManagedSiteTokenBatchImport(
        SITE_TYPES.SUB2API,
        [first, item("c", ["m1"])],
        "grouped",
      ),
    ).toMatchObject([
      { itemIds: ["a"], supportsMultipleCredentials: false },
      { itemIds: ["c"], supportsMultipleCredentials: false },
    ])
  })
  it("groups same-endpoint keys despite model differences and preserves distinct endpoint paths", () => {
    const groups = planManagedSiteTokenBatchImport(
      SITE_TYPES.MAGPIE,
      [
        item("a", ["m1"]),
        item("b", ["m2", "m1"]),
        item("c", ["m3"], "https://relay.test/tenant/v1"),
      ],
      "grouped",
    )
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      itemIds: ["a", "b"],
      modelSetsDiffer: true,
      draft: {
        name: "Relay",
        credentials: ["key-a", "key-b"],
        models: ["m1", "m2"],
      },
    })
    expect(
      planManagedSiteTokenBatchImport(
        SITE_TYPES.MAGPIE,
        [item("a", ["m1"]), item("b", ["m2"])],
        "independent",
      ),
    ).toHaveLength(2)
  })
})
