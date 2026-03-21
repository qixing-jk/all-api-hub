import { describe, expect, it, vi } from "vitest"

import { DONE_HUB, NEW_API, VELOERA } from "~/constants/siteType"

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

describe("managedSiteService", () => {
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
})
