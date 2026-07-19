import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { shouldEditModelsInManagedSiteCrudScenario } from "~~/e2e/scenarios/managedSiteChannels"

describe("shouldEditModelsInManagedSiteCrudScenario", () => {
  it("skips generic model edits for the AxonHub resource editor", () => {
    expect(shouldEditModelsInManagedSiteCrudScenario(SITE_TYPES.AXON_HUB)).toBe(
      false,
    )
  })

  it("keeps model edits for managed-site editors that expose the field", () => {
    expect(shouldEditModelsInManagedSiteCrudScenario(SITE_TYPES.NEW_API)).toBe(
      true,
    )
  })
})
