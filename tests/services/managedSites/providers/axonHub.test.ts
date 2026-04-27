import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
} from "~/constants/axonHub"
import { CHANNEL_STATUS } from "~/types/managedSite"
import {
  buildApiToken,
  buildDisplaySiteData,
  buildManagedSiteChannel,
  buildSiteAccount,
  buildUserPreferences,
} from "~~/tests/test-utils/factories"

const {
  mockConvertToDisplayData,
  mockCreateAxonHubChannel,
  mockDeleteAxonHubChannel,
  mockEnsureAccountApiToken,
  mockFetchManagedSiteAvailableModels,
  mockFetchTokenScopedModels,
  mockGetPreferences,
  mockListChannels,
  mockResolveAxonHubGraphqlId,
  mockSearchChannels,
  mockSignIn,
  mockUpdateAxonHubChannel,
  mockUpdateAxonHubChannelStatus,
} = vi.hoisted(() => ({
  mockConvertToDisplayData: vi.fn(),
  mockCreateAxonHubChannel: vi.fn(),
  mockDeleteAxonHubChannel: vi.fn(),
  mockEnsureAccountApiToken: vi.fn(),
  mockFetchManagedSiteAvailableModels: vi.fn(),
  mockFetchTokenScopedModels: vi.fn(),
  mockGetPreferences: vi.fn(),
  mockListChannels: vi.fn(),
  mockResolveAxonHubGraphqlId: vi.fn((id: number) => `gid-${id}`),
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
  resolveAxonHubGraphqlId: mockResolveAxonHubGraphqlId,
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

vi.mock("~/services/accounts/accountOperations", () => ({
  ensureAccountApiToken: mockEnsureAccountApiToken,
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    convertToDisplayData: mockConvertToDisplayData,
  },
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock("~/utils/i18n/core", () => ({
  t: (key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key,
}))

const axonHubConfig = {
  baseUrl: "https://axonhub.example",
  email: "admin@example.com",
  password: "admin-password",
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

  it("validates config, reads config, and searches through saved credentials", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")

    await expect(provider.checkValidAxonHubConfig()).resolves.toBe(true)
    await expect(provider.getAxonHubConfig()).resolves.toEqual({
      baseUrl: axonHubConfig.baseUrl,
      token: axonHubConfig.password,
      userId: axonHubConfig.email,
    })

    await provider.searchChannel("", "", "", "alpha")

    expect(mockSignIn).toHaveBeenCalledWith(axonHubConfig)
    expect(mockSearchChannels).toHaveBeenCalledWith(axonHubConfig, "alpha")
  })

  it("returns missing-config fallbacks when saved AxonHub credentials are incomplete", async () => {
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
    await expect(
      provider.createChannel("", "", "", {
        mode: "single",
        channel: {
          name: "Missing Config",
          type: AXON_HUB_CHANNEL_TYPE.OPENAI,
          key: "sk-test",
          base_url: "https://source.example/v1",
          models: "gpt-4o",
          groups: [],
          priority: 0,
          weight: 0,
          status: CHANNEL_STATUS.Enable,
        },
      }),
    ).resolves.toEqual({
      success: false,
      data: null,
      message: "messages:axonhub.configMissing",
    })

    expect(mockSignIn).not.toHaveBeenCalled()
    expect(mockCreateAxonHubChannel).not.toHaveBeenCalled()
  })

  it("creates an OpenAI-compatible channel and applies the requested enabled status", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")

    const result = await provider.createChannel("", "", "", {
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
    expect(mockCreateAxonHubChannel).toHaveBeenCalledWith(axonHubConfig, {
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
      axonHubConfig,
      "created-channel-id",
      AXON_HUB_CHANNEL_STATUS.ENABLED,
    )
  })

  it("updates channel fields, status, and delete operations through GraphQL ids", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")

    await expect(
      provider.updateChannel("", "", "", {
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

    expect(mockResolveAxonHubGraphqlId).toHaveBeenCalledWith(42)
    expect(mockUpdateAxonHubChannel).toHaveBeenCalledWith(
      axonHubConfig,
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
      axonHubConfig,
      "gid-42",
      AXON_HUB_CHANNEL_STATUS.DISABLED,
    )

    await expect(provider.deleteChannel("", "", "", 42)).resolves.toEqual({
      success: true,
      data: true,
      message: "success",
    })
    expect(mockDeleteAxonHubChannel).toHaveBeenCalledWith(
      axonHubConfig,
      "gid-42",
    )
  })

  it("updates explicit status zero values and surfaces delete failures", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")

    mockDeleteAxonHubChannel.mockResolvedValueOnce(false)

    await expect(
      provider.updateChannel("", "", "", {
        id: 7,
        status: CHANNEL_STATUS.Unknown,
      }),
    ).resolves.toEqual({
      success: true,
      data: { id: "updated-channel-id", name: "Updated" },
      message: "success",
    })

    expect(mockUpdateAxonHubChannelStatus).toHaveBeenCalledWith(
      axonHubConfig,
      "gid-7",
      AXON_HUB_CHANNEL_STATUS.DISABLED,
    )

    await expect(provider.deleteChannel("", "", "", 7)).resolves.toEqual({
      success: false,
      data: false,
      message: "messages:axonhub.deleteFailed",
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

  it("finds existing matching channels and imports only when no duplicate exists", async () => {
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

    mockListChannels.mockResolvedValueOnce({
      items: [matchingChannel],
      total: 1,
      page: 1,
      pageSize: 100,
    })

    await expect(
      provider.findMatchingChannel(
        "",
        "",
        "",
        "https://source.example/v1",
        ["gpt-4o", "gpt-4.1"],
        "test-source-key",
      ),
    ).resolves.toEqual(matchingChannel)

    mockListChannels.mockResolvedValueOnce({
      items: [matchingChannel],
      total: 1,
      page: 1,
      pageSize: 100,
    })
    await expect(provider.importToAxonHub(account, token)).resolves.toEqual({
      success: false,
      message: 'messages:axonhub.channelExists:{"channelName":"Existing"}',
    })
    expect(mockCreateAxonHubChannel).not.toHaveBeenCalled()

    mockListChannels.mockResolvedValueOnce({
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

  it("fetches available models and auto-provisions account tokens before import", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")
    const account = buildDisplaySiteData({
      name: "Converted",
      baseUrl: "https://converted.example/v1",
    })
    const storedAccount = buildSiteAccount()
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
    )

    mockConvertToDisplayData.mockReturnValue(account)
    mockEnsureAccountApiToken.mockResolvedValue(token)
    mockListChannels.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
    })

    await expect(
      provider.autoConfigToAxonHub(storedAccount, "toast-1"),
    ).resolves.toEqual({
      success: true,
      message:
        'messages:axonhub.importSuccess:{"channelName":"Converted | Auto (auto)"}',
    })
    expect(mockEnsureAccountApiToken).toHaveBeenCalledWith(
      storedAccount,
      account,
      "toast-1",
    )
  })

  it("shows an error toast when auto-config import returns a failure result", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")
    const account = buildDisplaySiteData({
      name: "Duplicate Source",
      baseUrl: "https://duplicate.example/v1",
    })
    const storedAccount = buildSiteAccount()
    const token = buildApiToken({
      name: "Duplicate",
      key: "duplicate-key",
    })
    const existingChannel = buildManagedSiteChannel({
      id: 9,
      name: "Existing Duplicate",
      key: "duplicate-key",
      base_url: "https://duplicate.example",
      models: "gpt-4o,gpt-4.1",
    })

    mockConvertToDisplayData.mockReturnValue(account)
    mockEnsureAccountApiToken.mockResolvedValue(token)
    mockListChannels.mockResolvedValueOnce({
      items: [existingChannel],
      total: 1,
      page: 1,
      pageSize: 100,
    })

    await expect(
      provider.autoConfigToAxonHub(storedAccount, "toast-duplicate"),
    ).resolves.toEqual({
      success: false,
      message:
        'messages:axonhub.channelExists:{"channelName":"Existing Duplicate"}',
    })

    expect(toast.loading).toHaveBeenCalledWith(
      "messages:accountOperations.importingToAxonHub",
      { id: "toast-duplicate" },
    )
    expect(toast.error).toHaveBeenCalledWith(
      'messages:axonhub.channelExists:{"channelName":"Existing Duplicate"}',
      { id: "toast-duplicate" },
    )
  })

  it("shows the thrown provisioning error when auto-config cannot create a token", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")
    const account = buildDisplaySiteData({
      name: "Broken Source",
      baseUrl: "https://broken.example/v1",
    })
    const storedAccount = buildSiteAccount()

    mockConvertToDisplayData.mockReturnValue(account)
    mockEnsureAccountApiToken.mockRejectedValueOnce(new Error("token missing"))

    await expect(
      provider.autoConfigToAxonHub(storedAccount, "toast-broken"),
    ).resolves.toEqual({
      success: false,
      message: "token missing",
    })

    expect(toast.error).toHaveBeenCalledWith("token missing", {
      id: "toast-broken",
    })
  })

  it("returns config-missing before auto-config starts when saved AxonHub credentials are absent", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")
    const storedAccount = buildSiteAccount()

    mockGetPreferences.mockResolvedValueOnce(
      buildUserPreferences({
        axonHub: {
          baseUrl: "",
          email: "",
          password: "",
        },
      }),
    )

    await expect(
      provider.autoConfigToAxonHub(storedAccount, "toast-missing"),
    ).resolves.toEqual({
      success: false,
      message: "messages:axonhub.configMissing",
    })

    expect(mockConvertToDisplayData).not.toHaveBeenCalled()
    expect(mockEnsureAccountApiToken).not.toHaveBeenCalled()
  })
})
