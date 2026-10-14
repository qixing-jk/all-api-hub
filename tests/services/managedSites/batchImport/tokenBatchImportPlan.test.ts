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
