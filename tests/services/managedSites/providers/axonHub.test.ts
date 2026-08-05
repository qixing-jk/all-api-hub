import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
} from "~/constants/axonHub"
import { SITE_TYPES } from "~/constants/siteType"
import { CHANNEL_STATUS } from "~/types/managedSite"
import {
  buildApiToken,
  buildDisplaySiteData,
  buildUserPreferences,
} from "~~/tests/test-utils/factories"

const {
  mockCreateAxonHubChannel,
  mockDeleteAxonHubChannel,
  mockAxonHubChannelToManagedSite,
  mockFetchManagedSiteAvailableModels,
  mockFetchTokenScopedModels,
  mockGetPreferences,
  mockListChannels,
  mockResolveAxonHubGraphqlIdForMutation,
  mockSearchChannels,
  mockSignIn,
  mockUpdateAxonHubChannel,
  mockUpdateAxonHubChannelStatus,
} = vi.hoisted(() => ({
  mockAxonHubChannelToManagedSite: vi.fn(
    (channel: { id: string; name: string; status?: string }) => ({
      id: channel.id,
      name: channel.name,
      ...(channel.status ? { status: channel.status } : {}),
    }),
  ),
  mockCreateAxonHubChannel: vi.fn(),
  mockDeleteAxonHubChannel: vi.fn(),
  mockFetchManagedSiteAvailableModels: vi.fn(),
  mockFetchTokenScopedModels: vi.fn(),
  mockGetPreferences: vi.fn(),
  mockListChannels: vi.fn(),
  mockResolveAxonHubGraphqlIdForMutation: vi.fn(
    (_config: unknown, id: number) => Promise.resolve(`gid-${id}`),
  ),
  mockSearchChannels: vi.fn(),
  mockSignIn: vi.fn(),
  mockUpdateAxonHubChannel: vi.fn(),
  mockUpdateAxonHubChannelStatus: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("~/services/preferences/userPreferences")

  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      getPreferences: mockGetPreferences,
    },
  }
})

vi.mock("~/services/apiService/axonHub", () => ({
  axonHubChannelToManagedSite: mockAxonHubChannelToManagedSite,
  createAxonHubChannel: mockCreateAxonHubChannel,
  deleteAxonHubChannel: mockDeleteAxonHubChannel,
  listChannels: mockListChannels,
  resolveAxonHubGraphqlIdForMutation: mockResolveAxonHubGraphqlIdForMutation,
  searchChannels: mockSearchChannels,
  signIn: mockSignIn,
  updateAxonHubChannel: mockUpdateAxonHubChannel,
  updateAxonHubChannelStatus: mockUpdateAxonHubChannelStatus,
}))

vi.mock("~/services/managedSites/utils/fetchTokenScopedModels", () => ({
  fetchTokenScopedModels: mockFetchTokenScopedModels,
}))

vi.mock(
  "~/services/managedSites/utils/fetchManagedSiteAvailableModels",
  () => ({
    fetchManagedSiteAvailableModels: mockFetchManagedSiteAvailableModels,
  }),
)

vi.mock("~/utils/i18n/core", () => ({
  t: (key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key,
}))

const axonHubConfig = {
  baseUrl: "https://axonhub.example",
  email: "admin@example.com",
  password: "admin-password",
}

const passedAxonHubConfig = {
  baseUrl: "https://passed-axonhub.example",
  email: "passed-admin@example.com",
  password: "passed-admin-password",
}

describe("AxonHub managed-site provider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPreferences.mockResolvedValue(
      buildUserPreferences({
        axonHub: axonHubConfig,
      }),
    )
    mockFetchTokenScopedModels.mockResolvedValue({
      models: ["gpt-4o", "gpt-4.1"],
      fetchFailed: false,
    })
    mockCreateAxonHubChannel.mockResolvedValue({
      id: "created-channel-id",
      name: "Created",
      status: AXON_HUB_CHANNEL_STATUS.DISABLED,
    })
    mockUpdateAxonHubChannel.mockResolvedValue({
      id: "updated-channel-id",
      name: "Updated",
      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
    })
    mockDeleteAxonHubChannel.mockResolvedValue(true)
    mockSearchChannels.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
    })
    mockListChannels.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
    })
  })

  it("validates saved config, reads config, searches, and lists through passed config", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")

    await expect(provider.checkValidAxonHubConfig()).resolves.toBe(true)
    await expect(provider.getAxonHubConfig()).resolves.toEqual(axonHubConfig)

    const signal = new AbortController().signal
    await provider.searchChannel(passedAxonHubConfig, "alpha")

    expect(mockSignIn).toHaveBeenCalledWith(axonHubConfig)
    expect(mockSearchChannels).toHaveBeenCalledWith(
      passedAxonHubConfig,
      "alpha",
    )

    await provider.listChannels(passedAxonHubConfig, { signal })

    expect(mockListChannels).toHaveBeenCalledWith(passedAxonHubConfig, {
      signal,
    })
  })

  it("returns null for search failures and rethrows list failures", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")

    mockSearchChannels.mockRejectedValueOnce(new Error("search failed"))
    await expect(
      provider.searchChannel(passedAxonHubConfig, "missing"),
    ).resolves.toBeNull()

    mockListChannels.mockRejectedValueOnce(new Error("list failed"))
    await expect(provider.listChannels(passedAxonHubConfig)).rejects.toThrow(
      "list failed",
    )
  })

  it("returns missing-config fallbacks for saved AxonHub config helpers", async () => {
    mockGetPreferences.mockResolvedValue(
      buildUserPreferences({
        axonHub: {
          baseUrl: "",
          email: "",
          password: "",
        },
      }),
    )

    const provider = await import("~/services/managedSites/providers/axonHub")

    await expect(provider.checkValidAxonHubConfig()).resolves.toBe(false)
    await expect(provider.getAxonHubConfig()).resolves.toBeNull()

    expect(mockSignIn).not.toHaveBeenCalled()
    expect(mockCreateAxonHubChannel).not.toHaveBeenCalled()
  })

  it("prefills imports from selected token credentials and requires final models", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")
    const account = buildDisplaySiteData({
      name: "Source Site",
      baseUrl: "https://source.example/v1",
    })
    const token = buildApiToken({
      name: "Primary",
      key: "test-selected-token-key",
      models: "metadata-model",
    })

    await expect(
      provider.prepareChannelFormData(account, token),
    ).resolves.toEqual(
      expect.objectContaining({
        name: "Source Site | Primary (auto)",
        type: AXON_HUB_CHANNEL_TYPE.OPENAI,
        key: "test-selected-token-key",
        base_url: "https://source.example/v1",
        models: ["gpt-4o", "gpt-4.1"],
        groups: [],
        priority: 0,
        weight: 0,
        status: CHANNEL_STATUS.Enable,
      }),
    )

    expect(mockFetchTokenScopedModels).toHaveBeenCalledWith(account, token)
    expect(
      provider.buildChannelPayload({
        name: "Manual",
        type: AXON_HUB_CHANNEL_TYPE.OPENAI,
        key: "test-selected-token-key",
        base_url: "https://source.example/v1",
        models: ["manual-model"],
        groups: [],
        priority: 0,
        weight: 0,
        status: CHANNEL_STATUS.Enable,
      }),
    ).toEqual({
      mode: "single",
      channel: {
        name: "Manual",
        type: AXON_HUB_CHANNEL_TYPE.OPENAI,
        key: "test-selected-token-key",
        base_url: "https://source.example/v1",
        models: "manual-model",
        groups: [],
        priority: 0,
        weight: 0,
        status: CHANNEL_STATUS.Enable,
      },
    })
    expect(() =>
      provider.buildChannelPayload({
        name: "Missing models",
        type: AXON_HUB_CHANNEL_TYPE.OPENAI,
        key: "test-selected-token-key",
        base_url: "https://source.example/v1",
        models: [],
        groups: [],
        priority: 0,
        weight: 0,
        status: CHANNEL_STATUS.Enable,
      }),
    ).toThrow("messages:axonhub.modelsMissing")
  })

  it("uses the AIHubMix API origin for managed-site channel imports", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")
    const account = buildDisplaySiteData({
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://console.aihubmix.com",
    })
    const token = buildApiToken({
      name: "AIHubMix Token",
      key: "test-aihubmix-token-key",
    })

    await expect(
      provider.prepareChannelFormData(account, token),
    ).resolves.toEqual(
      expect.objectContaining({
        key: "test-aihubmix-token-key",
        base_url: "https://aihubmix.com",
      }),
    )

    expect(mockFetchTokenScopedModels).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://aihubmix.com",
      }),
      token,
    )
  })

  it("marks model prefill failures for manual review and still accepts manual fallback models", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")
    const account = buildDisplaySiteData({
      baseUrl: "https://source.example/v1",
    })
    const token = buildApiToken({
      key: "test-token-without-live-models",
      model_limits: "metadata-model",
    })

    mockFetchTokenScopedModels.mockResolvedValueOnce({
      models: [],
      fetchFailed: true,
    })

    await expect(
      provider.prepareChannelFormData(account, token),
    ).resolves.toEqual(
      expect.objectContaining({
        key: "test-token-without-live-models",
        models: [],
        modelPrefillFetchFailed: true,
      }),
    )

    expect(() =>
      provider.buildChannelPayload({
        name: "Manual fallback",
        type: AXON_HUB_CHANNEL_TYPE.OPENAI,
        key: "test-token-without-live-models",
        base_url: "https://source.example/v1",
        models: ["manually-entered-model"],
        groups: [],
        priority: 0,
        weight: 0,
        status: CHANNEL_STATUS.Enable,
      }),
    ).not.toThrow()
  })

  it("fetches available models through the shared managed-site model resolver", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")
    const account = buildDisplaySiteData({
      name: "Converted",
      baseUrl: "https://converted.example/v1",
    })
    const token = buildApiToken({
      name: "Auto",
      key: "test-auto-token-key",
    })

    mockFetchManagedSiteAvailableModels.mockResolvedValue(["gpt-4o"])
    await expect(
      provider.fetchAvailableModels(account, token),
    ).resolves.toEqual(["gpt-4o"])
    expect(mockFetchManagedSiteAvailableModels).toHaveBeenCalledWith(
      account,
      token,
      {
        includeAccountFallback: false,
      },
    )
  })
})
