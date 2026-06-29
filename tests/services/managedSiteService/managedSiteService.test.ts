import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"

const mockGetPreferences = vi.fn()
const capabilityFnsBySiteType = new Map()

const getMockRuntimeConfigForType = async (siteType: string) => {
  const preferences = await mockGetPreferences()
  if (!preferences) {
    return null
  }

  if (siteType === SITE_TYPES.OCTOPUS) {
    const config = preferences.octopus
    return config?.baseUrl && config.username && config.password ? config : null
  }

  if (siteType === SITE_TYPES.AXON_HUB) {
    const config = preferences.axonHub
    return config?.baseUrl && config.email && config.password ? config : null
  }

  if (siteType === SITE_TYPES.CLAUDE_CODE_HUB) {
    const config = preferences.claudeCodeHub
    return config?.baseUrl && config.adminToken ? config : null
  }

  const config =
    siteType === SITE_TYPES.DONE_HUB
      ? preferences.doneHub
      : siteType === SITE_TYPES.VELOERA
        ? preferences.veloera
        : preferences.newApi

  return config?.baseUrl && config.adminToken && config.userId ? config : null
}

const createManagedSiteCapabilities = (
  siteType: string = SITE_TYPES.NEW_API,
) => {
  const channels: Record<string, ReturnType<typeof vi.fn>> = {
    search: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }

  if (
    siteType === SITE_TYPES.NEW_API ||
    siteType === SITE_TYPES.VELOERA ||
    siteType === SITE_TYPES.DONE_HUB ||
    siteType === SITE_TYPES.CLAUDE_CODE_HUB
  ) {
    Object.assign(channels, {
      hydrateComparableKeys: vi.fn(),
      fetchSecretKey: vi.fn(),
    })
  }

  return {
    channels,
    config: {
      checkValid: vi.fn(async () => true),
      get: vi.fn(async () => await getMockRuntimeConfigForType(siteType)),
    },
    channelDrafts: {
      fetchAvailableModels: vi.fn(),
      buildName: vi.fn(),
      prepareFormData: vi.fn(),
      buildPayload: vi.fn(),
    },
    imports: {
      autoConfig: vi.fn(),
    },
  }
}

const baseService = {
  searchChannel: expect.any(Function),
  createChannel: expect.any(Function),
  updateChannel: expect.any(Function),
  deleteChannel: expect.any(Function),
  checkValidConfig: expect.any(Function),
  getConfig: expect.any(Function),
  fetchAvailableModels: expect.any(Function),
  buildChannelName: expect.any(Function),
  prepareChannelFormData: expect.any(Function),
  buildChannelPayload: expect.any(Function),
  autoConfigToManagedSite: expect.any(Function),
}

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()

  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      getPreferences: mockGetPreferences,
    },
  }
})

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: vi.fn((siteType) => {
    if (!capabilityFnsBySiteType.has(siteType)) {
      capabilityFnsBySiteType.set(
        siteType,
        createManagedSiteCapabilities(siteType),
      )
    }

    return {
      siteType,
      managedSites: capabilityFnsBySiteType.get(siteType),
    }
  }),
}))

vi.mock("~/services/managedSites/providers/newApi", () => ({
  checkValidNewApiConfig: vi.fn(async () => true),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
  hydrateComparableChannelKeys: vi.fn(),
  fetchChannelSecretKey: vi.fn(),
  autoConfigToNewApi: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/veloera", () => ({
  checkValidVeloeraConfig: vi.fn(async () => true),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
  hydrateComparableChannelKeys: vi.fn(),
  fetchChannelSecretKey: vi.fn(),
  autoConfigToVeloera: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/doneHubService", () => ({
  checkValidDoneHubConfig: vi.fn(async () => true),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
  hydrateComparableChannelKeys: vi.fn(),
  fetchChannelSecretKey: vi.fn(),
  autoConfigToDoneHub: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/octopus", () => ({
  checkValidOctopusConfig: vi.fn(async () => true),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
  autoConfigToOctopus: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/axonHub", () => ({
  checkValidAxonHubConfig: vi.fn(async () => true),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
  autoConfigToAxonHub: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/claudeCodeHub", () => ({
  checkValidClaudeCodeHubConfig: vi.fn(async () => true),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
  hydrateComparableChannelKeys: vi.fn(),
  fetchChannelSecretKey: vi.fn(),
  autoConfigToClaudeCodeHub: vi.fn(),
}))

describe("managedSiteService", () => {
  beforeEach(() => {
    mockGetPreferences.mockReset()
    capabilityFnsBySiteType.clear()
  })

  it("reports invalid managed-site config when preferences are missing", async () => {
    const { hasValidManagedSiteConfig } = await import(
      "~/services/managedSites/managedSiteService"
    )

    expect(hasValidManagedSiteConfig(null)).toBe(false)
  })

  it("validates explicit managed-site configs by site type", async () => {
    const { hasValidManagedSiteConfig } = await import(
      "~/services/managedSites/managedSiteService"
    )

    const prefs = {
      managedSiteType: SITE_TYPES.NEW_API,
      newApi: {
        baseUrl: "https://new-api.example.com",
        adminToken: "admin-token",
        userId: "1",
      },
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "octo-admin",
        password: "secret",
      },
    }

    expect(hasValidManagedSiteConfig(prefs as any)).toBe(true)
    expect(hasValidManagedSiteConfig(prefs as any, SITE_TYPES.OCTOPUS)).toBe(
      true,
    )
  })

  it("validates AxonHub config completeness by site type", async () => {
    const { hasValidManagedSiteConfig } = await import(
      "~/services/managedSites/managedSiteService"
    )

    const prefs = {
      managedSiteType: SITE_TYPES.AXON_HUB,
      axonHub: {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "secret",
      },
    }

    expect(hasValidManagedSiteConfig(prefs as any)).toBe(true)
    expect(
      hasValidManagedSiteConfig({
        ...prefs,
        axonHub: { ...prefs.axonHub, password: "" },
      } as any),
    ).toBe(false)
  })

  it("validates Claude Code Hub config completeness by site type", async () => {
    const { hasValidManagedSiteConfig } = await import(
      "~/services/managedSites/managedSiteService"
    )

    const prefs = {
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "admin-token",
      },
    }

    expect(hasValidManagedSiteConfig(prefs as any)).toBe(true)
    expect(
      hasValidManagedSiteConfig({
        ...prefs,
        claudeCodeHub: { ...prefs.claudeCodeHub, adminToken: "" },
      } as any),
    ).toBe(false)
  })

  it("routes to New API service by default", async () => {
    const { getManagedSiteService } = await import(
      "~/services/managedSites/managedSiteService"
    )

    const prefs = {
      managedSiteType: SITE_TYPES.NEW_API,
      newApi: {
        baseUrl: "https://new-api.example.com",
        adminToken: "admin-token",
        userId: "1",
      },
    }
    mockGetPreferences.mockResolvedValueOnce(prefs).mockResolvedValueOnce(prefs)

    const service = await getManagedSiteService()
    expect(service.siteType).toBe(SITE_TYPES.NEW_API)
    expect(service.messagesKey).toBe("newapi")
    expect(service).toMatchObject(baseService)
    expect(service.hydrateComparableChannelKeys).toEqual(expect.any(Function))

    const config = await service.getConfig()
    expect(config).toEqual({
      baseUrl: "https://new-api.example.com",
      adminToken: "admin-token",
      userId: "1",
    })
  })

  it("routes to Veloera service when selected", async () => {
    const { getManagedSiteService } = await import(
      "~/services/managedSites/managedSiteService"
    )

    const prefs = {
      managedSiteType: SITE_TYPES.VELOERA,
      veloera: {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "3",
      },
    }
    mockGetPreferences.mockResolvedValueOnce(prefs).mockResolvedValueOnce(prefs)

    const service = await getManagedSiteService()
    expect(service.siteType).toBe(SITE_TYPES.VELOERA)
    expect(service.messagesKey).toBe("veloera")
    expect(service).toMatchObject(baseService)
    expect(service.hydrateComparableChannelKeys).toEqual(expect.any(Function))

    const config = await service.getConfig()
    expect(config).toEqual({
      baseUrl: "https://veloera.example.com",
      adminToken: "veloera-token",
      userId: "3",
    })
  })

  it("keeps selected provider identity when selected config is incomplete", async () => {
    const { getManagedSiteService } = await import(
      "~/services/managedSites/managedSiteService"
    )

    const prefs = {
      managedSiteType: SITE_TYPES.AXON_HUB,
      axonHub: {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "",
      },
    }
    mockGetPreferences.mockResolvedValueOnce(prefs).mockResolvedValueOnce(prefs)

    const service = await getManagedSiteService()
    expect(service.siteType).toBe(SITE_TYPES.AXON_HUB)
    expect(service.messagesKey).toBe("axonhub")

    await expect(service.getConfig()).resolves.toBeNull()
  })

  it("falls back to New API service when preferences cannot be read", async () => {
    const { getManagedSiteService } = await import(
      "~/services/managedSites/managedSiteService"
    )

    mockGetPreferences.mockRejectedValueOnce(new Error("storage unavailable"))

    const service = await getManagedSiteService()

    expect(service.siteType).toBe(SITE_TYPES.NEW_API)
    expect(service.messagesKey).toBe("newapi")
  })

  it("can resolve an explicit target service without changing active preferences", async () => {
    const { getManagedSiteServiceForType } = await import(
      "~/services/managedSites/managedSiteService"
    )

    const service = getManagedSiteServiceForType(SITE_TYPES.DONE_HUB)
    expect(service.siteType).toBe(SITE_TYPES.DONE_HUB)
    expect(service.messagesKey).toBe("donehub")
    expect(service).toMatchObject(baseService)
    expect(service.hydrateComparableChannelKeys).toEqual(expect.any(Function))

    mockGetPreferences.mockResolvedValueOnce({
      managedSiteType: SITE_TYPES.NEW_API,
      doneHub: {
        baseUrl: "https://donehub.example.com",
        adminToken: "done-token",
        userId: "2",
      },
    })

    const config = await service.getConfig()
    expect(config).toEqual({
      baseUrl: "https://donehub.example.com",
      adminToken: "done-token",
      userId: "2",
    })
  })

  it("composes explicit services from managed-site capabilities", async () => {
    const { getManagedSiteServiceForType } = await import(
      "~/services/managedSites/managedSiteService"
    )
    const { getSiteTypeCapabilities } = await import(
      "~/services/apiAdapters/registry"
    )

    const capabilities = createManagedSiteCapabilities()
    capabilityFnsBySiteType.set(SITE_TYPES.DONE_HUB, capabilities)

    const service = getManagedSiteServiceForType(SITE_TYPES.DONE_HUB)

    expect(getSiteTypeCapabilities).toHaveBeenCalledWith(SITE_TYPES.DONE_HUB)
    expect(service.searchChannel).toBe(capabilities.channels.search)
    expect(service.createChannel).toBe(capabilities.channels.create)
    expect(service.updateChannel).toBe(capabilities.channels.update)
    expect(service.deleteChannel).toBe(capabilities.channels.delete)
    expect(service.checkValidConfig).toBe(capabilities.config.checkValid)
    expect(service.getConfig).toBe(capabilities.config.get)
    expect(service.fetchAvailableModels).toBe(
      capabilities.channelDrafts.fetchAvailableModels,
    )
    expect(service.buildChannelName).toBe(capabilities.channelDrafts.buildName)
    expect(service.prepareChannelFormData).toBe(
      capabilities.channelDrafts.prepareFormData,
    )
    expect(service.buildChannelPayload).toBe(
      capabilities.channelDrafts.buildPayload,
    )
    expect(service.hydrateComparableChannelKeys).toBe(
      capabilities.channels.hydrateComparableKeys,
    )
    expect(service.fetchChannelSecretKey).toBe(
      capabilities.channels.fetchSecretKey,
    )
    expect(service.autoConfigToManagedSite).toBe(
      capabilities.imports.autoConfig,
    )
  })

  it("passes runtime config objects directly to converted providers", async () => {
    const { getManagedSiteServiceForType } = await import(
      "~/services/managedSites/managedSiteService"
    )

    const service = getManagedSiteServiceForType(SITE_TYPES.NEW_API)
    const capabilities = capabilityFnsBySiteType.get(SITE_TYPES.NEW_API)

    const newApiConfig = {
      baseUrl: "https://new-api.example.com",
      adminToken: "admin-token",
      userId: "1",
    }
    const octopusConfig = {
      baseUrl: "https://octopus.example.com",
      username: "octo-admin",
      password: "secret",
    }

    await service.searchChannel(newApiConfig, "alpha")

    type SearchChannelConfig = Parameters<typeof service.searchChannel>[0]
    // @ts-expect-error New API services must reject other site config shapes.
    const invalidConfig: SearchChannelConfig = octopusConfig
    void invalidConfig

    expect(capabilities.channels.search).toHaveBeenCalledWith(
      newApiConfig,
      "alpha",
    )
  })

  it("routes to Octopus service when selected explicitly", async () => {
    const { getManagedSiteServiceForType } = await import(
      "~/services/managedSites/managedSiteService"
    )

    const service = getManagedSiteServiceForType(SITE_TYPES.OCTOPUS)
    expect(service.siteType).toBe(SITE_TYPES.OCTOPUS)
    expect(service.messagesKey).toBe("octopus")
    expect(service).toMatchObject(baseService)
    expect(service.hydrateComparableChannelKeys).toBeUndefined()

    mockGetPreferences.mockResolvedValueOnce({
      managedSiteType: SITE_TYPES.NEW_API,
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "octo-admin",
        password: "secret",
      },
    })

    const config = await service.getConfig()
    expect(config).toEqual({
      baseUrl: "https://octopus.example.com",
      username: "octo-admin",
      password: "secret",
    })
  })

  it("routes to AxonHub service when selected explicitly", async () => {
    const { getManagedSiteServiceForType } = await import(
      "~/services/managedSites/managedSiteService"
    )

    const service = getManagedSiteServiceForType(SITE_TYPES.AXON_HUB)
    expect(service.siteType).toBe(SITE_TYPES.AXON_HUB)
    expect(service.messagesKey).toBe("axonhub")
    expect(service).toMatchObject(baseService)
    expect(service.hydrateComparableChannelKeys).toBeUndefined()

    mockGetPreferences.mockResolvedValueOnce({
      managedSiteType: SITE_TYPES.NEW_API,
      axonHub: {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "secret",
      },
    })

    const config = await service.getConfig()
    expect(config).toEqual({
      baseUrl: "https://axonhub.example.com",
      email: "admin@example.com",
      password: "secret",
    })
  })

  it("routes to Claude Code Hub service with key reveal support", async () => {
    const { getManagedSiteServiceForType } = await import(
      "~/services/managedSites/managedSiteService"
    )

    const service = getManagedSiteServiceForType(SITE_TYPES.CLAUDE_CODE_HUB)
    expect(service.siteType).toBe(SITE_TYPES.CLAUDE_CODE_HUB)
    expect(service.messagesKey).toBe("claudecodehub")
    expect(service).toMatchObject(baseService)
    expect(service.hydrateComparableChannelKeys).toEqual(expect.any(Function))
    expect(service.fetchChannelSecretKey).toEqual(expect.any(Function))

    mockGetPreferences.mockResolvedValueOnce({
      managedSiteType: SITE_TYPES.NEW_API,
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "cch-token",
      },
    })

    const config = await service.getConfig()
    expect(config).toEqual({
      baseUrl: "https://cch.example.com",
      adminToken: "cch-token",
    })
  })

  it("exports real key hydration capabilities for hidden-key providers", async () => {
    const [newApi, doneHub, veloera, claudeCodeHub] = await Promise.all([
      vi.importActual<
        typeof import("~/services/managedSites/providers/newApi")
      >("~/services/managedSites/providers/newApi"),
      vi.importActual<
        typeof import("~/services/managedSites/providers/doneHubService")
      >("~/services/managedSites/providers/doneHubService"),
      vi.importActual<
        typeof import("~/services/managedSites/providers/veloera")
      >("~/services/managedSites/providers/veloera"),
      vi.importActual<
        typeof import("~/services/managedSites/providers/claudeCodeHub")
      >("~/services/managedSites/providers/claudeCodeHub"),
    ])

    expect(newApi.hydrateComparableChannelKeys).toEqual(expect.any(Function))
    expect(doneHub.hydrateComparableChannelKeys).toEqual(expect.any(Function))
    expect(veloera.hydrateComparableChannelKeys).toEqual(expect.any(Function))
    expect(claudeCodeHub.hydrateComparableChannelKeys).toEqual(
      expect.any(Function),
    )
  })
})
