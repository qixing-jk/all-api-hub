import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
} from "~/constants/axonHub"

const axonHubProvider = vi.hoisted(() => ({
  checkValidAxonHubConfig: vi.fn(),
  listChannels: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  buildChannelPayload: vi.fn(),
  searchChannel: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
}))

const axonHubApi = vi.hoisted(() => {
  class AxonHubRequestError extends Error {
    constructor(
      readonly kind:
        | "authentication"
        | "permission"
        | "not-found"
        | "upstream-rejected"
        | "protocol"
        | "unavailable"
        | "aborted",
      readonly dispatch: "not-dispatched" | "dispatched",
      message: string = kind,
      details: {
        responseReceived?: boolean
        statusCode?: number
        code?: string
        raw?: unknown
        cause?: unknown
      } = {},
    ) {
      super(message)
      this.name = "AxonHubRequestError"
      this.responseReceived = details.responseReceived ?? false
      this.statusCode = details.statusCode
      this.code = details.code
      this.raw = details.raw
      this.cause = details.cause ?? details.raw
    }

    readonly responseReceived: boolean
    readonly statusCode?: number
    readonly code?: string
    readonly raw?: unknown
    override readonly cause?: unknown
  }

  return {
    AxonHubRequestError,
    getAxonHubChannel: vi.fn(),
    createAxonHubChannel: vi.fn(),
    updateAxonHubChannel: vi.fn(),
    updateAxonHubChannelStatus: vi.fn(),
    deleteAxonHubChannel: vi.fn(),
  }
})

const userPreferences = vi.hoisted(() => ({
  getPreferences: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/axonHub", () => ({
  ...axonHubProvider,
}))

vi.mock("~/services/apiService/axonHub", () => ({
  ...axonHubApi,
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
  const currentChannel = {
    __typename: "Channel" as const,
    id: "gid://axonhub/Channel/1",
    type: AXON_HUB_CHANNEL_TYPE.OPENAI,
    name: "current",
    baseURL: "https://current.example.invalid/v1",
    status: AXON_HUB_CHANNEL_STATUS.DISABLED,
    credentials: { apiKeys: ["key-current"] },
    supportedModels: ["model-current"],
    manualModels: ["model-current"],
    defaultTestModel: "model-current",
    orderingWeight: 0,
  }

  beforeEach(() => {
    vi.resetAllMocks()
    axonHubApi.getAxonHubChannel.mockResolvedValue(currentChannel)
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
      prepareFormData: axonHubProvider.prepareChannelFormData,
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
