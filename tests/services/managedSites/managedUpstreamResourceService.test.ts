import { beforeEach, describe, expect, it, vi } from "vitest"

import { MANAGED_SITE_TYPES, SITE_TYPES } from "~/constants/siteType"
import type { ManagedUpstreamResourcesCapability } from "~/services/apiAdapters/contracts/managedUpstreamResources"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import {
  createManagedUpstreamResourceMigrationGates,
  isManagedSiteCoreResourceSliceEnabled,
  isManagedSiteFeatureResourceSliceEnabled,
  MANAGED_UPSTREAM_RESOURCE_FEATURES,
} from "~/services/managedSites/managedUpstreamResourceMigration"
import {
  resolveManagedUpstreamResourceCapabilities,
  resolveManagedUpstreamResourceFeatureCapabilities,
} from "~/services/managedSites/managedUpstreamResourceService"

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: vi.fn(),
}))

const getSiteTypeCapabilitiesMock = vi.mocked(getSiteTypeCapabilities)

describe("managed upstream resource service", () => {
  beforeEach(() => {
    getSiteTypeCapabilitiesMock.mockReset()
    getSiteTypeCapabilitiesMock.mockImplementation((siteType) => ({
      siteType,
      managedSites: {
        channels: {} as NonNullable<
          NonNullable<SiteTypeCapabilities["managedSites"]>["channels"]
        >,
      },
    }))
  })

  it("enables only New API-family migrated core resource paths by default", () => {
    expect(
      MANAGED_SITE_TYPES.map((siteType) => ({
        siteType,
        enabled: isManagedSiteCoreResourceSliceEnabled(siteType),
      })),
    ).toEqual(
      MANAGED_SITE_TYPES.map((siteType) => ({
        siteType,
        enabled:
          siteType === SITE_TYPES.NEW_API || siteType === SITE_TYPES.VELOERA,
      })),
    )
  })

  it("does not enable resource mode from capability presence alone for unmigrated sites", () => {
    const resources = buildResourcesCapability()
    getSiteTypeCapabilitiesMock.mockReturnValue({
      siteType: SITE_TYPES.DONE_HUB,
      managedSites: {
        channels: {} as NonNullable<
          NonNullable<SiteTypeCapabilities["managedSites"]>["channels"]
        >,
        resources,
      },
    })

    expect(
      resolveManagedUpstreamResourceCapabilities(SITE_TYPES.DONE_HUB),
    ).toEqual({
      supported: false,
      siteType: SITE_TYPES.DONE_HUB,
      reason: "core-slice-disabled",
    })
  })

  it("returns a typed unsupported result when an enabled core path lacks the optional capability", () => {
    const gates = createManagedUpstreamResourceMigrationGates({
      coreSiteTypes: [SITE_TYPES.NEW_API],
    })

    expect(
      resolveManagedUpstreamResourceCapabilities(SITE_TYPES.NEW_API, {
        gates,
      }),
    ).toEqual({
      supported: false,
      siteType: SITE_TYPES.NEW_API,
      reason: "capability-missing",
    })
  })

  it("resolves resources only for explicitly enabled site slices with capabilities", () => {
    const resources = buildResourcesCapability()
    const gates = createManagedUpstreamResourceMigrationGates({
      coreSiteTypes: [SITE_TYPES.NEW_API],
    })
    getSiteTypeCapabilitiesMock.mockImplementation((siteType) => ({
      siteType,
      managedSites: {
        channels: {} as NonNullable<
          NonNullable<SiteTypeCapabilities["managedSites"]>["channels"]
        >,
        resources: siteType === SITE_TYPES.NEW_API ? resources : undefined,
      },
    }))

    expect(
      resolveManagedUpstreamResourceCapabilities(SITE_TYPES.NEW_API, {
        gates,
      }),
    ).toEqual({
      supported: true,
      siteType: SITE_TYPES.NEW_API,
      capabilities: resources,
    })
    expect(
      resolveManagedUpstreamResourceCapabilities(SITE_TYPES.VELOERA, {
        gates,
      }),
    ).toEqual({
      supported: false,
      siteType: SITE_TYPES.VELOERA,
      reason: "core-slice-disabled",
    })
  })

  it("keeps every feature resource slice unsupported by default", () => {
    expect(
      isManagedSiteFeatureResourceSliceEnabled(
        SITE_TYPES.NEW_API,
        MANAGED_UPSTREAM_RESOURCE_FEATURES.ModelSync,
      ),
    ).toBe(false)

    expect(
      resolveManagedUpstreamResourceFeatureCapabilities(
        SITE_TYPES.NEW_API,
        MANAGED_UPSTREAM_RESOURCE_FEATURES.ModelSync,
      ),
    ).toEqual({
      supported: false,
      siteType: SITE_TYPES.NEW_API,
      feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.ModelSync,
      reason: "feature-slice-disabled",
    })
  })

  it("requires both core and feature gates before resolving feature resources", () => {
    const resources = buildResourcesCapability()
    getSiteTypeCapabilitiesMock.mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      managedSites: {
        channels: {} as NonNullable<
          NonNullable<SiteTypeCapabilities["managedSites"]>["channels"]
        >,
        resources,
      },
    })

    const coreOnlyGates = createManagedUpstreamResourceMigrationGates({
      coreSiteTypes: [SITE_TYPES.NEW_API],
    })
    expect(
      resolveManagedUpstreamResourceFeatureCapabilities(
        SITE_TYPES.NEW_API,
        MANAGED_UPSTREAM_RESOURCE_FEATURES.ModelSync,
        { gates: coreOnlyGates },
      ),
    ).toEqual({
      supported: false,
      siteType: SITE_TYPES.NEW_API,
      feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.ModelSync,
      reason: "feature-slice-disabled",
    })

    const featureGates = createManagedUpstreamResourceMigrationGates({
      coreSiteTypes: [SITE_TYPES.NEW_API],
      featureSlices: [
        {
          siteType: SITE_TYPES.NEW_API,
          feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.ModelSync,
        },
      ],
    })
    expect(
      resolveManagedUpstreamResourceFeatureCapabilities(
        SITE_TYPES.NEW_API,
        MANAGED_UPSTREAM_RESOURCE_FEATURES.ModelSync,
        { gates: featureGates },
      ),
    ).toEqual({
      supported: true,
      siteType: SITE_TYPES.NEW_API,
      feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.ModelSync,
      capabilities: resources,
    })
  })
})

function buildResourcesCapability(): ManagedUpstreamResourcesCapability {
  return {
    items: {
      list: vi.fn(),
      search: vi.fn(),
      getDetail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    drafts: {
      prepareImportDraft: vi.fn(),
      prepareEditDraft: vi.fn(),
      describeFields: vi.fn(),
      validateDraft: vi.fn(),
    },
  }
}
