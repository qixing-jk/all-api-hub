import { describe, expect, it, vi } from "vitest"

import {
  AXON_HUB,
  CLAUDE_CODE_HUB,
  DONE_HUB,
  NEW_API,
  OCTOPUS,
  VELOERA,
} from "~/constants/siteType"

const mockGetPreferences = vi.fn()

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: mockGetPreferences,
  },
}))

vi.mock("~/services/managedSites/providers/newApi", () => ({
  checkValidNewApiConfig: vi.fn(async () => true),
  getNewApiConfig: vi.fn(async () => ({
    baseUrl: "n",
    token: "t",
    userId: "u",
  })),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
  findMatchingChannel: vi.fn(),
  fetchChannelSecretKey: vi.fn(),
  autoConfigToNewApi: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/veloera", () => ({
  checkValidVeloeraConfig: vi.fn(async () => true),
  getVeloeraConfig: vi.fn(async () => ({
    baseUrl: "v",
    token: "t",
    userId: "u",
  })),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
  findMatchingChannel: vi.fn(),
  fetchChannelSecretKey: vi.fn(),
  autoConfigToVeloera: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/doneHubService", () => ({
  checkValidDoneHubConfig: vi.fn(async () => true),
  getDoneHubConfig: vi.fn(async () => ({
    baseUrl: "d",
    token: "t",
    userId: "u",
  })),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
  findMatchingChannel: vi.fn(),
  fetchChannelSecretKey: vi.fn(),
  autoConfigToDoneHub: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/octopus", () => ({
  checkValidOctopusConfig: vi.fn(async () => true),
  getOctopusConfig: vi.fn(async () => ({
    baseUrl: "o",
    token: "",
    userId: "admin",
  })),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
  findMatchingChannel: vi.fn(),
  autoConfigToOctopus: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/axonHub", () => ({
  checkValidAxonHubConfig: vi.fn(async () => true),
  getAxonHubConfig: vi.fn(async () => ({
    baseUrl: "a",
    token: "p",
    userId: "admin@example.com",
  })),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
  findMatchingChannel: vi.fn(),
  autoConfigToAxonHub: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/claudeCodeHub", () => ({
  checkValidClaudeCodeHubConfig: vi.fn(async () => true),
  getClaudeCodeHubConfig: vi.fn(async () => ({
    baseUrl: "c",
    token: "t",
    userId: "admin",
  })),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
  findMatchingChannel: vi.fn(),
  autoConfigToClaudeCodeHub: vi.fn(),
}))

describe("managedSiteService", () => {
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
      managedSiteType: NEW_API,
      newApi: {
        baseUrl: "https://new-api.example.com",
        adminToken: "admin-token",
        userId: "admin",
      },
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "octo-admin",
        password: "secret",
      },
    }

    expect(hasValidManagedSiteConfig(prefs as any)).toBe(true)
    expect(hasValidManagedSiteConfig(prefs as any, OCTOPUS)).toBe(true)
  })

  it("validates AxonHub config completeness by site type", async () => {
    const { hasValidManagedSiteConfig } = await import(
      "~/services/managedSites/managedSiteService"
    )

    const prefs = {
      managedSiteType: AXON_HUB,
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
      managedSiteType: CLAUDE_CODE_HUB,
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

    mockGetPreferences.mockResolvedValueOnce({ managedSiteType: NEW_API })

    const service = await getManagedSiteService()
    expect(service.siteType).toBe(NEW_API)
    expect(service.messagesKey).toBe("newapi")

    const config = await service.getConfig()
    expect(config?.baseUrl).toBe("n")
  })

  it("routes to Veloera service when selected", async () => {
    const { getManagedSiteService } = await import(
      "~/services/managedSites/managedSiteService"
    )

    mockGetPreferences.mockResolvedValueOnce({ managedSiteType: VELOERA })

    const service = await getManagedSiteService()
    expect(service.siteType).toBe(VELOERA)
    expect(service.messagesKey).toBe("veloera")

    const config = await service.getConfig()
    expect(config?.baseUrl).toBe("v")
  })

  it("can resolve an explicit target service without changing active preferences", async () => {
    const { getManagedSiteServiceForType } = await import(
      "~/services/managedSites/managedSiteService"
    )

    const service = getManagedSiteServiceForType(DONE_HUB)
    expect(service.siteType).toBe(DONE_HUB)
    expect(service.messagesKey).toBe("donehub")

    const config = await service.getConfig()
    expect(config?.baseUrl).toBe("d")
  })

  it("routes to Octopus service when selected explicitly", async () => {
    const { getManagedSiteServiceForType } = await import(
      "~/services/managedSites/managedSiteService"
    )

    const service = getManagedSiteServiceForType(OCTOPUS)
    expect(service.siteType).toBe(OCTOPUS)
    expect(service.messagesKey).toBe("octopus")

    const config = await service.getConfig()
    expect(config?.baseUrl).toBe("o")
  })

  it("routes to AxonHub service when selected explicitly", async () => {
    const { getManagedSiteServiceForType } = await import(
      "~/services/managedSites/managedSiteService"
    )

    const service = getManagedSiteServiceForType(AXON_HUB)
    expect(service.siteType).toBe(AXON_HUB)
    expect(service.messagesKey).toBe("axonhub")

    const config = await service.getConfig()
    expect(config).toEqual({
      baseUrl: "a",
      token: "p",
      userId: "admin@example.com",
    })
  })

  it("routes to Claude Code Hub service without key reveal support", async () => {
    const { getManagedSiteServiceForType } = await import(
      "~/services/managedSites/managedSiteService"
    )

    const service = getManagedSiteServiceForType(CLAUDE_CODE_HUB)
    expect(service.siteType).toBe(CLAUDE_CODE_HUB)
    expect(service.messagesKey).toBe("claudeCodeHub")
    expect(service.fetchChannelSecretKey).toBeUndefined()

    const config = await service.getConfig()
    expect(config).toEqual({
      baseUrl: "c",
      token: "t",
      userId: "admin",
    })
  })
})
