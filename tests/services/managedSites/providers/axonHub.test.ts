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
  buildManagedSiteChannel,
  buildUserPreferences,
} from "~~/tests/test-utils/factories"

const {
  mockCreateAxonHubChannel,
  mockDeleteAxonHubChannel,
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
    })
    mockUpdateAxonHubChannel.mockResolvedValue({
      id: "updated-channel-id",
      name: "Updated",
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

    await provider.searchChannel(passedAxonHubConfig, "alpha")

    expect(mockSignIn).toHaveBeenCalledWith(axonHubConfig)
    expect(mockSearchChannels).toHaveBeenCalledWith(
      passedAxonHubConfig,
      "alpha",
    )

    await provider.listChannels(passedAxonHubConfig)

    expect(mockListChannels).toHaveBeenCalledWith(passedAxonHubConfig)
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

  it("creates an OpenAI-compatible channel and applies the requested enabled status", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")

    const result = await provider.createChannel(passedAxonHubConfig, {
      mode: "single",
      channel: {
        name: "  Imported Account  ",
        type: AXON_HUB_CHANNEL_TYPE.OPENAI,
        key: "test-source-key",
        base_url: " https://source.example/v1 ",
        models: "gpt-4o,gpt-4.1",
        groups: [],
        priority: 0,
        weight: 7,
        status: CHANNEL_STATUS.Enable,
      },
    })

    expect(result.success).toBe(true)
    expect(mockCreateAxonHubChannel).toHaveBeenCalledWith(passedAxonHubConfig, {
      type: AXON_HUB_CHANNEL_TYPE.OPENAI,
      name: "Imported Account",
      baseURL: "https://source.example/v1",
      credentials: {
        apiKeys: ["test-source-key"],
      },
      supportedModels: ["gpt-4o", "gpt-4.1"],
      manualModels: ["gpt-4o", "gpt-4.1"],
      defaultTestModel: "gpt-4o",
      settings: {},
      orderingWeight: 7,
    })
    expect(mockUpdateAxonHubChannelStatus).toHaveBeenCalledWith(
      passedAxonHubConfig,
      "created-channel-id",
      AXON_HUB_CHANNEL_STATUS.ENABLED,
    )
  })

  it("builds and creates migrated AxonHub channels with string provider type and supported fields", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")

    const payload = provider.buildChannelPayload({
      name: "Migrated Anthropic",
      type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
      key: "migrated-key",
      base_url: "https://anthropic.example/v1",
      models: ["claude-3-5-sonnet", "claude-3-haiku"],
      groups: ["default", "vip"],
      priority: 9,
      weight: 5,
      status: CHANNEL_STATUS.ManuallyDisabled,
    })

    expect(payload).toEqual({
      mode: "single",
      channel: {
        name: "Migrated Anthropic",
        type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
        key: "migrated-key",
        base_url: "https://anthropic.example/v1",
        models: "claude-3-5-sonnet,claude-3-haiku",
        groups: [],
        priority: 0,
        weight: 5,
        status: CHANNEL_STATUS.ManuallyDisabled,
      },
    })

    await expect(
      provider.createChannel(passedAxonHubConfig, payload),
    ).resolves.toEqual({
      success: true,
      data: {
        id: "created-channel-id",
        name: "Created",
      },
      message: "success",
    })

    expect(mockCreateAxonHubChannel).toHaveBeenCalledWith(passedAxonHubConfig, {
      type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
      name: "Migrated Anthropic",
      baseURL: "https://anthropic.example/v1",
      credentials: {
        apiKeys: ["migrated-key"],
      },
      supportedModels: ["claude-3-5-sonnet", "claude-3-haiku"],
      manualModels: ["claude-3-5-sonnet", "claude-3-haiku"],
      defaultTestModel: "claude-3-5-sonnet",
      settings: {},
      orderingWeight: 5,
    })
    expect(mockUpdateAxonHubChannelStatus).not.toHaveBeenCalled()
  })

  it("updates channel fields, status, and delete operations through GraphQL ids", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")

    await expect(
      provider.updateChannel(passedAxonHubConfig, {
        id: 42,
        name: "  Renamed  ",
        type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
        key: "test-updated-key",
        base_url: " https://updated.example/v1 ",
        models: "claude-3-5-sonnet,claude-3-haiku",
        weight: 3,
        status: CHANNEL_STATUS.ManuallyDisabled,
      }),
    ).resolves.toEqual({
      success: true,
      data: { id: "updated-channel-id", name: "Updated" },
      message: "success",
    })

    expect(mockResolveAxonHubGraphqlIdForMutation).toHaveBeenCalledWith(
      passedAxonHubConfig,
      42,
    )
    expect(mockUpdateAxonHubChannel).toHaveBeenCalledWith(
      passedAxonHubConfig,
      "gid-42",
      {
        type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
        name: "Renamed",
        baseURL: "https://updated.example/v1",
        credentials: {
          apiKeys: ["test-updated-key"],
        },
        supportedModels: ["claude-3-5-sonnet", "claude-3-haiku"],
        manualModels: ["claude-3-5-sonnet", "claude-3-haiku"],
        defaultTestModel: "claude-3-5-sonnet",
        orderingWeight: 3,
      },
    )
    expect(mockUpdateAxonHubChannelStatus).toHaveBeenCalledWith(
      passedAxonHubConfig,
      "gid-42",
      AXON_HUB_CHANNEL_STATUS.DISABLED,
    )

    await expect(
      provider.deleteChannel(passedAxonHubConfig, 42),
    ).resolves.toEqual({
      success: true,
      data: true,
      message: "success",
    })
    expect(mockDeleteAxonHubChannel).toHaveBeenCalledWith(
      passedAxonHubConfig,
      "gid-42",
    )
  })

  it("updates explicit status zero values and surfaces delete failures", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")

    mockDeleteAxonHubChannel.mockResolvedValueOnce(false)

    await expect(
      provider.updateChannel(passedAxonHubConfig, {
        id: 7,
        status: CHANNEL_STATUS.Unknown,
      }),
    ).resolves.toEqual({
      success: true,
      data: { id: "updated-channel-id", name: "Updated" },
      message: "success",
    })

    expect(mockUpdateAxonHubChannelStatus).toHaveBeenCalledWith(
      passedAxonHubConfig,
      "gid-7",
      AXON_HUB_CHANNEL_STATUS.DISABLED,
    )

    await expect(
      provider.deleteChannel(passedAxonHubConfig, 7),
    ).resolves.toEqual({
      success: false,
      data: false,
      message: "messages:axonhub.deleteFailed",
    })
  })

  it("returns delete fallbacks when deletion throws", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")

    mockDeleteAxonHubChannel.mockRejectedValueOnce(new Error("delete exploded"))
    await expect(
      provider.deleteChannel(passedAxonHubConfig, 8),
    ).resolves.toEqual({
      success: false,
      data: null,
      message: "delete exploded",
    })
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

  it("imports only when no duplicate exists", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")
    const account = buildDisplaySiteData({
      name: "Source Site",
      baseUrl: "https://source.example/v1",
    })
    const token = buildApiToken({
      name: "Primary",
      key: "test-source-key",
    })
    const matchingChannel = buildManagedSiteChannel({
      id: 7,
      name: "Existing",
      key: "test-source-key",
      base_url: "https://source.example",
      models: "gpt-4o,gpt-4.1",
    })

    mockSearchChannels.mockResolvedValueOnce({
      items: [matchingChannel],
      total: 1,
      page: 1,
      pageSize: 100,
    })
    await expect(provider.importToAxonHub(account, token)).resolves.toEqual({
      success: false,
      message: expect.stringContaining("channelExists"),
    })
    expect(mockSearchChannels).toHaveBeenCalledTimes(1)
    expect(mockCreateAxonHubChannel).not.toHaveBeenCalled()

    mockSearchChannels.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
    })
    await expect(provider.importToAxonHub(account, token)).resolves.toEqual({
      success: true,
      message:
        'messages:axonhub.importSuccess:{"channelName":"Source Site | Primary (auto)"}',
    })
    expect(mockCreateAxonHubChannel).toHaveBeenCalledWith(
      axonHubConfig,
      expect.objectContaining({
        credentials: {
          apiKeys: ["test-source-key"],
        },
        supportedModels: ["gpt-4o", "gpt-4.1"],
      }),
    )
  })

  it("returns config-missing and import-failed messages for AxonHub import fallbacks", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")
    const account = buildDisplaySiteData({
      name: "Broken Source",
      baseUrl: "https://broken.example/v1",
    })
    const token = buildApiToken({
      name: "Broken",
      key: "broken-key",
    })

    mockGetPreferences.mockResolvedValueOnce(
      buildUserPreferences({
        axonHub: {
          baseUrl: "",
          email: "",
          password: "",
        },
      }),
    )
    await expect(provider.importToAxonHub(account, token)).resolves.toEqual({
      success: false,
      message: "messages:axonhub.configMissing",
    })

    mockFetchTokenScopedModels.mockRejectedValueOnce(
      new Error("prefill failed"),
    )
    await expect(provider.importToAxonHub(account, token)).resolves.toEqual({
      success: false,
      message: "prefill failed",
    })
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
