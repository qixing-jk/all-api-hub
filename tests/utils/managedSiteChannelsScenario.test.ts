import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  shouldEditModelsInManagedSiteCrudScenario,
  shouldSeedModelsInManagedSiteCrudScenario,
} from "~~/e2e/scenarios/managedSiteChannels"

describe("shouldEditModelsInManagedSiteCrudScenario", () => {
  it("skips generic model edits for the AxonHub resource editor", () => {
    expect(shouldEditModelsInManagedSiteCrudScenario(SITE_TYPES.AXON_HUB)).toBe(
      false,
    )
  })

  it("skips generic model edits for the Sub2API native account editor", () => {
    expect(shouldEditModelsInManagedSiteCrudScenario(SITE_TYPES.SUB2API)).toBe(
      false,
    )
  })

  it("keeps model edits for managed-site editors that expose the field", () => {
    expect(shouldEditModelsInManagedSiteCrudScenario(SITE_TYPES.NEW_API)).toBe(
      true,
    )
  })

  it("seeds the required AxonHub create model without editing it later", () => {
    expect(shouldSeedModelsInManagedSiteCrudScenario(SITE_TYPES.AXON_HUB)).toBe(
      true,
    )
  })

  it("leaves the optional Sub2API create model whitelist empty", () => {
    expect(shouldSeedModelsInManagedSiteCrudScenario(SITE_TYPES.SUB2API)).toBe(
      false,
    )
  })

  it("skips generic model edits for the OmniRoute connection editor", () => {
    expect(
      shouldEditModelsInManagedSiteCrudScenario(SITE_TYPES.OMNIROUTE),
    ).toBe(false)
  })

  it("does not seed a create model for OmniRoute connections", () => {
    // A connection stores one `defaultModel`; it has no per-channel model list.
    expect(
      shouldSeedModelsInManagedSiteCrudScenario(SITE_TYPES.OMNIROUTE),
    ).toBe(false)
  })
})
