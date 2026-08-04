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

const expectLegacyAdaptedResources = (
  resources: ManagedUpstreamResourcesCapability,
) =>
  expect.objectContaining({
    items: expect.objectContaining({
      list: resources.items.list,
      search: resources.items.search,
      getDetail: resources.items.getDetail,
      create: expect.any(Function),
      update: expect.any(Function),
      delete: expect.any(Function),
    }),
    drafts: resources.drafts,
  })

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
      capabilities: expectLegacyAdaptedResources(resources),
    })
  })

  it("adapts resource mutation outcomes for legacy callers without raw diagnostics or replay", async () => {
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
    const resolution = resolveManagedUpstreamResourceCapabilities(
      SITE_TYPES.NEW_API,
    )
    if (!resolution.supported) throw new Error("Expected resource support")
    const createMock = vi.mocked(resources.items.create)
    const secret = "sk-example-secret-value"

    createMock.mockResolvedValueOnce({
      outcome: "succeeded",
      data: null,
      confirmedEffects: [{ kind: "resource-created", resourceKind: "channel" }],
      message: "created",
    } as never)
    await expect(
      resolution.capabilities.items.create({} as never, {} as never),
    ).resolves.toEqual({ success: true, message: "created", data: null })

    createMock.mockResolvedValueOnce({
      outcome: "rejected",
      diagnostic: {
        message: `provider rejected token ${secret}`,
        raw: { secret },
      },
    } as never)
    await expect(
      resolution.capabilities.items.create({} as never, {} as never),
    ).resolves.toEqual({
      success: false,
      message: "provider rejected token [REDACTED]",
      data: null,
    })

    createMock.mockResolvedValueOnce({
      outcome: "partial",
      confirmedEffects: [{ kind: "resource-created", resourceKind: "channel" }],
      completion: "uncertain",
      diagnostic: { message: "status unknown", raw: { secret } },
    } as never)
    await expect(
      resolution.capabilities.items.create({} as never, {} as never),
    ).resolves.toEqual({
      success: true,
      message: "status unknown",
      data: null,
    })

    createMock.mockResolvedValueOnce({
      outcome: "uncertain",
      diagnostic: { message: "response lost", raw: { secret } },
    } as never)
    const uncertain = await resolution.capabilities.items.create(
      {} as never,
      {} as never,
    )
    expect(uncertain).toEqual({
      success: true,
      message: "response lost",
      data: null,
    })
    expect(JSON.stringify(uncertain)).not.toContain(secret)
    expect(uncertain).not.toHaveProperty("raw")
    expect(uncertain).not.toHaveProperty("outcome")
  })

  it("redacts config credentials from legacy create diagnostics", async () => {
    const resources = buildResourcesCapability()
    const capabilities = resolveSupportedResources(
      SITE_TYPES.NEW_API,
      resources,
    )
    const configSecret = "opaque-reserved-config-value"
    vi.mocked(resources.items.create).mockResolvedValueOnce(
      rejectedMutationWithSecrets(configSecret) as never,
    )

    await expect(
      capabilities.items.create(
        { adminToken: configSecret } as never,
        { key: "" } as never,
      ),
    ).resolves.toEqual(redactedLegacyRejection())
  })

  it("redacts draft keys from legacy create diagnostics", async () => {
    const resources = buildResourcesCapability()
    const capabilities = resolveSupportedResources(
      SITE_TYPES.NEW_API,
      resources,
    )
    const draftSecret = "opaque-reserved-create-draft-value"
    vi.mocked(resources.items.create).mockResolvedValueOnce(
      rejectedMutationWithSecrets(draftSecret) as never,
    )

    await expect(
      capabilities.items.create({} as never, { key: draftSecret } as never),
    ).resolves.toEqual(redactedLegacyRejection())
  })

  it("redacts draft keys from legacy update diagnostics", async () => {
    const resources = buildResourcesCapability()
    const capabilities = resolveSupportedResources(
      SITE_TYPES.NEW_API,
      resources,
    )
    const draftSecret = "opaque-reserved-update-draft-value"
    vi.mocked(resources.items.update).mockResolvedValueOnce(
      rejectedMutationWithSecrets(draftSecret) as never,
    )

    await expect(
      capabilities.items.update(
        {} as never,
        { native: {} } as never,
        { key: draftSecret } as never,
      ),
    ).resolves.toEqual(redactedLegacyRejection())
  })

  it("redacts config-only credentials from legacy delete diagnostics", async () => {
    const resources = buildResourcesCapability()
    const capabilities = resolveSupportedResources(
      SITE_TYPES.NEW_API,
      resources,
    )
    const configSecret = "opaque-reserved-delete-config-value"
    vi.mocked(resources.items.delete).mockResolvedValueOnce(
      rejectedMutationWithSecrets(configSecret) as never,
    )

    await expect(
      capabilities.items.delete(
        { adminToken: configSecret } as never,
        {} as never,
      ),
    ).resolves.toEqual(redactedLegacyRejection())
  })

  it("redacts preserved AxonHub native payload secrets from legacy update diagnostics", async () => {
    const resources = buildResourcesCapability()
    const capabilities = resolveSupportedResources(
      SITE_TYPES.AXON_HUB,
      resources,
    )
    const nativeSecrets = [
      "opaque-reserved-axon-credential-value",
      "opaque-reserved-axon-setting-value",
    ]
    vi.mocked(resources.items.update).mockResolvedValueOnce(
      rejectedMutationWithSecrets(...nativeSecrets) as never,
    )

    await expect(
      capabilities.items.update(
        {} as never,
        {
          native: {
            credentials: { oauth: { accessToken: nativeSecrets[0] } },
            settings: { proxy: { password: nativeSecrets[1] } },
          },
        } as never,
        { key: "" } as never,
      ),
    ).resolves.toEqual(redactedLegacyRejection(nativeSecrets.length))
  })

  it("redacts preserved Octopus native payload secrets from legacy update diagnostics", async () => {
    const resources = buildResourcesCapability()
    const capabilities = resolveSupportedResources(
      SITE_TYPES.OCTOPUS,
      resources,
    )
    const nativeSecrets = [
      "opaque-reserved-octopus-header-value",
      "opaque-reserved-octopus-proxy-value",
    ]
    vi.mocked(resources.items.update).mockResolvedValueOnce(
      rejectedMutationWithSecrets(...nativeSecrets) as never,
    )

    await expect(
      capabilities.items.update(
        {} as never,
        {
          native: {
            custom_header: [
              { header_key: "x-example", header_value: nativeSecrets[0] },
            ],
            channel_proxy: nativeSecrets[1],
          },
        } as never,
        { key: "" } as never,
      ),
    ).resolves.toEqual(redactedLegacyRejection(nativeSecrets.length))
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
      capabilities: expectLegacyAdaptedResources(resources),
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

  it("enables model redirect resource slices only for channel-shaped migrated sites by default", () => {
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
        isManagedSiteFeatureResourceSliceEnabled(
          siteType,
          MANAGED_UPSTREAM_RESOURCE_FEATURES.ModelRedirect,
        ),
      ),
    ).toEqual([true, true, true])
    expect(
      migratedChannelShapedSiteTypes.map((siteType) =>
        resolveManagedUpstreamResourceFeatureCapabilities(
          siteType,
          MANAGED_UPSTREAM_RESOURCE_FEATURES.ModelRedirect,
        ),
      ),
    ).toEqual(
      migratedChannelShapedSiteTypes.map((siteType) => ({
        supported: true,
        siteType,
        feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.ModelRedirect,
        capabilities: expectLegacyAdaptedResources(resources),
      })),
    )
    expect(
      [SITE_TYPES.OCTOPUS, SITE_TYPES.AXON_HUB, SITE_TYPES.CLAUDE_CODE_HUB].map(
        (siteType) =>
          resolveManagedUpstreamResourceFeatureCapabilities(
            siteType,
            MANAGED_UPSTREAM_RESOURCE_FEATURES.ModelRedirect,
          ),
      ),
    ).toEqual(
      [SITE_TYPES.OCTOPUS, SITE_TYPES.AXON_HUB, SITE_TYPES.CLAUDE_CODE_HUB].map(
        (siteType) => ({
          supported: false,
          siteType,
          feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.ModelRedirect,
          reason: "feature-slice-disabled",
        }),
      ),
    )
  })

  it("enables model sync resource slices only for channel-model-safe migrated sites by default", () => {
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
    const migratedChannelModelSafeSiteTypes = [
      SITE_TYPES.NEW_API,
      SITE_TYPES.VELOERA,
      SITE_TYPES.DONE_HUB,
    ]

    expect(
      migratedChannelModelSafeSiteTypes.map((siteType) =>
        resolveManagedUpstreamResourceFeatureCapabilities(
          siteType,
          MANAGED_UPSTREAM_RESOURCE_FEATURES.ModelSync,
        ),
      ),
    ).toEqual(
      migratedChannelModelSafeSiteTypes.map((siteType) => ({
        supported: true,
        siteType,
        feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.ModelSync,
        capabilities: expectLegacyAdaptedResources(resources),
      })),
    )
    expect(
      [SITE_TYPES.OCTOPUS, SITE_TYPES.AXON_HUB, SITE_TYPES.CLAUDE_CODE_HUB].map(
        (siteType) =>
          resolveManagedUpstreamResourceFeatureCapabilities(
            siteType,
            MANAGED_UPSTREAM_RESOURCE_FEATURES.ModelSync,
          ),
      ),
    ).toEqual(
      [SITE_TYPES.OCTOPUS, SITE_TYPES.AXON_HUB, SITE_TYPES.CLAUDE_CODE_HUB].map(
        (siteType) => ({
          supported: false,
          siteType,
          feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.ModelSync,
          reason: "feature-slice-disabled",
        }),
      ),
    )
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
          capabilities: expectLegacyAdaptedResources(resources),
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
        capabilities: expectLegacyAdaptedResources(resources),
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

  it("enables token channel status resource matching only for base-url-safe channel-shaped migrated sites by default", () => {
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
    const migratedBaseUrlSafeSiteTypes = [
      SITE_TYPES.NEW_API,
      SITE_TYPES.DONE_HUB,
    ]

    expect(
      migratedBaseUrlSafeSiteTypes.map((siteType) =>
        resolveManagedUpstreamResourceFeatureCapabilities(
          siteType,
          MANAGED_UPSTREAM_RESOURCE_FEATURES.TokenChannelStatus,
        ),
      ),
    ).toEqual(
      migratedBaseUrlSafeSiteTypes.map((siteType) => ({
        supported: true,
        siteType,
        feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.TokenChannelStatus,
        capabilities: expectLegacyAdaptedResources(resources),
      })),
    )
    expect(
      [
        SITE_TYPES.VELOERA,
        SITE_TYPES.OCTOPUS,
        SITE_TYPES.AXON_HUB,
        SITE_TYPES.CLAUDE_CODE_HUB,
      ].map((siteType) =>
        resolveManagedUpstreamResourceFeatureCapabilities(
          siteType,
          MANAGED_UPSTREAM_RESOURCE_FEATURES.TokenChannelStatus,
        ),
      ),
    ).toEqual(
      [
        SITE_TYPES.VELOERA,
        SITE_TYPES.OCTOPUS,
        SITE_TYPES.AXON_HUB,
        SITE_TYPES.CLAUDE_CODE_HUB,
      ].map((siteType) => ({
        supported: false,
        siteType,
        feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.TokenChannelStatus,
        reason: "feature-slice-disabled",
      })),
    )
  })

  it("keeps AxonHub migration off the old feature gate without changing other site slices", () => {
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
    const legacyMigratedSiteTypes = [
      SITE_TYPES.NEW_API,
      SITE_TYPES.VELOERA,
      SITE_TYPES.DONE_HUB,
      SITE_TYPES.OCTOPUS,
      SITE_TYPES.CLAUDE_CODE_HUB,
    ]

    expect(
      legacyMigratedSiteTypes.map((siteType) =>
        resolveManagedUpstreamResourceFeatureCapabilities(
          siteType,
          MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelMigration,
        ),
      ),
    ).toEqual(
      legacyMigratedSiteTypes.map((siteType) => ({
        supported: true,
        siteType,
        feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelMigration,
        capabilities: expectLegacyAdaptedResources(resources),
      })),
    )
    expect(
      resolveManagedUpstreamResourceFeatureCapabilities(
        SITE_TYPES.AXON_HUB,
        MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelMigration,
      ),
    ).toEqual({
      supported: false,
      siteType: SITE_TYPES.AXON_HUB,
      feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelMigration,
      reason: "feature-slice-disabled",
    })
  })

  it("enables channel filter resource config slices for channel-shaped migrated sites by default", () => {
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
    const nativeResourceSiteTypes = [
      SITE_TYPES.OCTOPUS,
      SITE_TYPES.AXON_HUB,
      SITE_TYPES.CLAUDE_CODE_HUB,
    ]

    for (const feature of [
      MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelFilters,
      MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelConfigStorage,
    ]) {
      expect(
        migratedChannelShapedSiteTypes.map((siteType) =>
          resolveManagedUpstreamResourceFeatureCapabilities(siteType, feature),
        ),
      ).toEqual(
        migratedChannelShapedSiteTypes.map((siteType) => ({
          supported: true,
          siteType,
          feature,
          capabilities: expectLegacyAdaptedResources(resources),
        })),
      )
      expect(
        nativeResourceSiteTypes.map((siteType) =>
          resolveManagedUpstreamResourceFeatureCapabilities(siteType, feature),
        ),
      ).toEqual(
        nativeResourceSiteTypes.map((siteType) => ({
          supported: false,
          siteType,
          feature,
          reason: "feature-slice-disabled",
        })),
      )
    }
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
      capabilities: expectLegacyAdaptedResources(resources),
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

function resolveSupportedResources(
  siteType: (typeof MANAGED_SITE_TYPES)[number],
  resources: ManagedUpstreamResourcesCapability,
) {
  getSiteTypeCapabilitiesMock.mockReturnValue({
    siteType,
    managedSites: {
      channels: {} as NonNullable<
        NonNullable<SiteTypeCapabilities["managedSites"]>["channels"]
      >,
      resources,
    },
  })

  const resolution = resolveManagedUpstreamResourceCapabilities(siteType)
  if (!resolution.supported) throw new Error("Expected resource support")
  return resolution.capabilities
}

function rejectedMutationWithSecrets(...secrets: string[]) {
  return {
    outcome: "rejected" as const,
    diagnostic: { message: `provider response: ${secrets.join(" ")}` },
  }
}

function redactedLegacyRejection(secretCount = 1) {
  return {
    success: false,
    message: `provider response: ${Array.from(
      { length: secretCount },
      () => "[REDACTED]",
    ).join(" ")}`,
    data: null,
  }
}
