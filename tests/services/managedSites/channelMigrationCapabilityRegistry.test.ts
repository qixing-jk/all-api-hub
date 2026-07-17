import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { resolveManagedSiteMigrationCapability } from "~/services/managedSites/channelMigrationCapabilityRegistry"

const { resolveManagedUpstreamResourceFeatureCapabilitiesMock } = vi.hoisted(
  () => ({
    resolveManagedUpstreamResourceFeatureCapabilitiesMock: vi.fn(),
  }),
)

vi.mock("~/services/managedSites/managedUpstreamResourceService", () => ({
  resolveManagedUpstreamResourceFeatureCapabilities: (...args: unknown[]) =>
    resolveManagedUpstreamResourceFeatureCapabilitiesMock(...args),
}))

describe("managed site migration capability registry", () => {
  beforeEach(() => {
    resolveManagedUpstreamResourceFeatureCapabilitiesMock.mockReset()
  })

  it("returns null when New API has no migration capability registration", () => {
    expect(resolveManagedSiteMigrationCapability(SITE_TYPES.NEW_API)).toBeNull()
  })

  it("returns null for AxonHub without falling back to the legacy feature gate", () => {
    expect(
      resolveManagedSiteMigrationCapability(SITE_TYPES.AXON_HUB),
    ).toBeNull()
    expect(
      resolveManagedUpstreamResourceFeatureCapabilitiesMock,
    ).not.toHaveBeenCalled()
  })
})
