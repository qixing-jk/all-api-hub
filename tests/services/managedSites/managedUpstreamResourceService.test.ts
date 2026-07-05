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

  it("enables only migrated core resource paths by default", () => {
    expect(
      MANAGED_SITE_TYPES.map((siteType) => ({
        siteType,
        enabled: isManagedSiteCoreResourceSliceEnabled(siteType),
      })),
    ).toEqual(
      MANAGED_SITE_TYPES.map((siteType) => ({
        siteType,
        enabled:
          siteType === SITE_TYPES.NEW_API ||
          siteType === SITE_TYPES.VELOERA ||
          siteType === SITE_TYPES.DONE_HUB ||
          siteType === SITE_TYPES.OCTOPUS ||
          siteType === SITE_TYPES.AXON_HUB ||
          siteType === SITE_TYPES.CLAUDE_CODE_HUB,
      })),
    )
  })

  it("resolves AxonHub core resources after its migration gate is enabled", () => {
    const resources = buildResourcesCapability()
    getSiteTypeCapabilitiesMock.mockReturnValue({
      siteType: SITE_TYPES.AXON_HUB,
      managedSites: {
        channels: {} as NonNullable<
          NonNullable<SiteTypeCapabilities["managedSites"]>["channels"]
        >,
        resources,
      },
    })

    expect(
      resolveManagedUpstreamResourceCapabilities(SITE_TYPES.AXON_HUB),
    ).toEqual({
      supported: true,
      siteType: SITE_TYPES.AXON_HUB,
      capabilities: resources,
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

  it("keeps unrelated feature resource slices unsupported by default", () => {
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

  it("enables duplicate matching resource slices for channel-shaped migrated sites by default", () => {
    const resources = buildResourcesCapability()
    getSiteTypeCapabilitiesMock.mockImplementation((siteType) => ({
      siteType,
      managedSites: {
        channels: {} as NonNullable<
          NonNullable<SiteTypeCapabilities["managedSites"]>["channels"]
        >,
        resources,
      },
    }))

    expect(
      [SITE_TYPES.NEW_API, SITE_TYPES.VELOERA, SITE_TYPES.DONE_HUB].map(
        (siteType) =>
          resolveManagedUpstreamResourceFeatureCapabilities(
            siteType,
            MANAGED_UPSTREAM_RESOURCE_FEATURES.DuplicateMatching,
          ),
      ),
    ).toEqual(
      [SITE_TYPES.NEW_API, SITE_TYPES.VELOERA, SITE_TYPES.DONE_HUB].map(
        (siteType) => ({
          supported: true,
          siteType,
          feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.DuplicateMatching,
          capabilities: resources,
        }),
      ),
    )
  })

  it("enables token batch export resource target matching only for channel-shaped migrated sites by default", () => {
    const resources = buildResourcesCapability()
    getSiteTypeCapabilitiesMock.mockImplementation((siteType) => ({
      siteType,
      managedSites: {
        channels: {} as NonNullable<
          NonNullable<SiteTypeCapabilities["managedSites"]>["channels"]
        >,
        resources,
      },
    }))
    const migratedChannelShapedSiteTypes = [
      SITE_TYPES.NEW_API,
      SITE_TYPES.VELOERA,
      SITE_TYPES.DONE_HUB,
    ]

    expect(
      migratedChannelShapedSiteTypes.map((siteType) =>
        resolveManagedUpstreamResourceFeatureCapabilities(
          siteType,
          MANAGED_UPSTREAM_RESOURCE_FEATURES.TokenBatchExport,
        ),
      ),
    ).toEqual(
      migratedChannelShapedSiteTypes.map((siteType) => ({
        supported: true,
        siteType,
        feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.TokenBatchExport,
        capabilities: resources,
      })),
    )
    expect(
      [SITE_TYPES.OCTOPUS, SITE_TYPES.AXON_HUB, SITE_TYPES.CLAUDE_CODE_HUB].map(
        (siteType) =>
          resolveManagedUpstreamResourceFeatureCapabilities(
            siteType,
            MANAGED_UPSTREAM_RESOURCE_FEATURES.TokenBatchExport,
          ),
      ),
    ).toEqual(
      [SITE_TYPES.OCTOPUS, SITE_TYPES.AXON_HUB, SITE_TYPES.CLAUDE_CODE_HUB].map(
        (siteType) => ({
          supported: false,
          siteType,
          feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.TokenBatchExport,
          reason: "feature-slice-disabled",
        }),
      ),
    )
  })

  it("enables channel migration resource slices for migrated managed sites by default", () => {
    const resources = buildResourcesCapability()
    getSiteTypeCapabilitiesMock.mockImplementation((siteType) => ({
      siteType,
      managedSites: {
        channels: {} as NonNullable<
          NonNullable<SiteTypeCapabilities["managedSites"]>["channels"]
        >,
        resources,
      },
    }))
    const migratedSiteTypes = [
      SITE_TYPES.NEW_API,
      SITE_TYPES.VELOERA,
      SITE_TYPES.DONE_HUB,
      SITE_TYPES.OCTOPUS,
      SITE_TYPES.AXON_HUB,
      SITE_TYPES.CLAUDE_CODE_HUB,
    ]

    expect(
      migratedSiteTypes.map((siteType) =>
        resolveManagedUpstreamResourceFeatureCapabilities(
          siteType,
          MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelMigration,
        ),
      ),
    ).toEqual(
      migratedSiteTypes.map((siteType) => ({
        supported: true,
        siteType,
        feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelMigration,
        capabilities: resources,
      })),
    )
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
