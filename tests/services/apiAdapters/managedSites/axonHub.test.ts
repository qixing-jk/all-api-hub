import { describe, expect, it, vi } from "vitest"

const axonHubProvider = vi.hoisted(() => ({
  checkValidAxonHubConfig: vi.fn(),
  listChannels: vi.fn(),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
}))

const userPreferences = vi.hoisted(() => ({
  getPreferences: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/axonHub", () => ({
  ...axonHubProvider,
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences,
}))

describe("AxonHub managed-site channel capability", () => {
  const config = {
    baseUrl: "https://axonhub.example.invalid",
    email: "admin@example.invalid",
    password: "password",
  }

  it("returns null on search failure via the provider protocol helper", async () => {
    axonHubProvider.searchChannel.mockResolvedValue(null)

    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteChannels.search(config, "missing"),
    ).resolves.toBeNull()
  })

  it("exposes direct channel listing without model-sync write methods", async () => {
    const listResponse = {
      items: [{ id: 1, name: "Axon" }],
      total: 1,
      type_counts: { openai: 1 },
    }
    axonHubProvider.listChannels.mockResolvedValue(listResponse)

    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(axonHubManagedSiteChannels.list?.(config)).resolves.toBe(
      listResponse,
    )
    expect(axonHubProvider.listChannels).toHaveBeenCalledWith(config)
    expect(axonHubManagedSiteChannels.fetchModels).toBeUndefined()
    expect(axonHubManagedSiteChannels.updateModels).toBeUndefined()
    expect(axonHubManagedSiteChannels.updateModelMapping).toBeUndefined()
  })

  it("returns ApiResponse objects for create, update, and delete", async () => {
    axonHubProvider.createChannel.mockResolvedValue({
      success: true,
      data: { id: 1 },
      message: "success",
    })
    axonHubProvider.updateChannel.mockResolvedValue({
      success: true,
      data: { id: 1 },
      message: "success",
    })
    axonHubProvider.deleteChannel.mockResolvedValue({
      success: true,
      data: true,
      message: "success",
    })

    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteChannels.create(config, {
        mode: "single",
        channel: { name: "channel", status: 1 },
      }),
    ).resolves.toEqual({
      success: true,
      data: { id: 1 },
      message: "success",
    })
    await expect(
      axonHubManagedSiteChannels.update(config, { id: 1 }),
    ).resolves.toEqual({
      success: true,
      data: { id: 1 },
      message: "success",
    })
    await expect(axonHubManagedSiteChannels.delete(config, 1)).resolves.toEqual(
      {
        success: true,
        data: true,
        message: "success",
      },
    )
  })

  it("does not expose model-sync methods", async () => {
    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    expect(axonHubManagedSiteChannels.fetchModels).toBeUndefined()
    expect(axonHubManagedSiteChannels.updateModels).toBeUndefined()
    expect(axonHubManagedSiteChannels.updateModelMapping).toBeUndefined()
  })

  it("exposes provider config and draft functions", async () => {
    userPreferences.getPreferences.mockResolvedValue({
      axonHub: config,
    })
    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(axonHubManagedSiteCapabilities.config.get()).resolves.toBe(
      config,
    )
    expect(axonHubManagedSiteCapabilities.config.checkValid).toBe(
      axonHubProvider.checkValidAxonHubConfig,
    )
    expect(axonHubManagedSiteCapabilities.channelDrafts).toEqual({
      fetchAvailableModels: axonHubProvider.fetchAvailableModels,
      buildName: axonHubProvider.buildChannelName,
      prepareFormData: axonHubProvider.prepareChannelFormData,
      buildPayload: axonHubProvider.buildChannelPayload,
    })
    expect(axonHubManagedSiteCapabilities).not.toHaveProperty("imports")
  })

  it("returns null when AxonHub runtime config is incomplete", async () => {
    userPreferences.getPreferences.mockResolvedValue({
      axonHub: {
        baseUrl: "",
        email: "",
        password: "",
      },
    })
    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteCapabilities.config.get(),
    ).resolves.toBeNull()
  })
})
