import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  CLAUDE_CODE_HUB_PROVIDER_TYPE,
  ClaudeCodeHubProviderTypeOptions,
  DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS,
} from "~/constants/claudeCodeHub"
import { SITE_TYPES } from "~/constants/siteType"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import {
  buildChannelPayload,
  buildClaudeCodeHubCreatePayloadFromFormData,
  buildClaudeCodeHubUpdatePayloadFromChannelData,
  checkValidClaudeCodeHubConfig,
  createChannel,
  deleteChannel,
  fetchAvailableModels,
  fetchChannelSecretKey,
  getClaudeCodeHubConfig,
  hydrateComparableChannelKeys,
  listChannels,
  prepareChannelFormData,
  providerToManagedSiteChannel,
  searchChannel,
  updateChannel,
} from "~/services/managedSites/providers/claudeCodeHub"
import { CHANNEL_STATUS } from "~/types/managedSite"

const mockFetchTokenScopedModels = vi.fn()
const mockFetchManagedSiteAvailableModels = vi.fn()
const mockListProviders = vi.fn()
const mockSearchProviders = vi.fn()
const mockCreateProvider = vi.fn()
const mockUpdateProvider = vi.fn()
const mockDeleteProvider = vi.fn()
const mockGetUnmaskedProviderKey = vi.fn()
const mockGetPreferences = vi.fn()

vi.mock("~/services/managedSites/utils/fetchTokenScopedModels", () => ({
  fetchTokenScopedModels: (...args: unknown[]) =>
    mockFetchTokenScopedModels(...args),
}))

vi.mock(
  "~/services/managedSites/utils/fetchManagedSiteAvailableModels",
  () => ({
    fetchManagedSiteAvailableModels: (...args: unknown[]) =>
      mockFetchManagedSiteAvailableModels(...args),
  }),
)

vi.mock("~/services/apiService/claudeCodeHub", () => ({
  listProviders: (...args: unknown[]) => mockListProviders(...args),
  searchProviders: (...args: unknown[]) => mockSearchProviders(...args),
  createProvider: (...args: unknown[]) => mockCreateProvider(...args),
  updateProvider: (...args: unknown[]) => mockUpdateProvider(...args),
  deleteProvider: (...args: unknown[]) => mockDeleteProvider(...args),
  getUnmaskedProviderKey: (...args: unknown[]) =>
    mockGetUnmaskedProviderKey(...args),
  validateClaudeCodeHubConfig: vi.fn(),
  normalizeClaudeCodeHubBaseUrl: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: (...args: unknown[]) => mockGetPreferences(...args),
  },
}))

vi.mock("~/utils/i18n/core", () => ({
  t: (key: string) => key,
}))

describe("Claude Code Hub managed-site provider", () => {
  const storedClaudeCodeHubConfig = {
    baseUrl: "https://stored-cch.example.com",
    adminToken: "stored-admin-token",
  }

  const passedClaudeCodeHubConfig = {
    baseUrl: "https://passed-cch.example.com",
    adminToken: "passed-admin-token",
  }

  beforeEach(() => {
    mockFetchTokenScopedModels.mockReset()
    mockFetchManagedSiteAvailableModels.mockReset()
    mockListProviders.mockReset()
    mockSearchProviders.mockReset()
    mockCreateProvider.mockReset()
    mockUpdateProvider.mockReset()
    mockDeleteProvider.mockReset()
    mockGetUnmaskedProviderKey.mockReset()
    mockGetPreferences.mockReset()
  })

  it("normalizes provider display records into managed-site channels", () => {
    const channel = providerToManagedSiteChannel({
      id: 7,
      name: "OpenAI Provider",
      providerType: "openai-compatible",
      url: "https://api.example.com",
      maskedKey: "sk-***",
      isEnabled: false,
      weight: 3,
      priority: 9,
      groupTag: "paid",
      allowedModels: [
        { matchType: "exact", pattern: "gpt-4o" },
        { matchType: "regex", pattern: "gpt-.*" },
        "claude-sonnet",
      ],
      createdAt: "2026-04-27T00:00:00.000Z",
    })

    expect(channel).toMatchObject({
      id: 7,
      name: "OpenAI Provider",
      type: "openai-compatible",
      base_url: "https://api.example.com",
      key: "sk-***",
      status: CHANNEL_STATUS.ManuallyDisabled,
      weight: 3,
      priority: 9,
      group: "paid",
      models: "gpt-4o,claude-sonnet",
    })
    expect(channel._claudeCodeHubData.name).toBe("OpenAI Provider")
  })

  it("exposes only the supported provider types in add-flow options", () => {
    expect(ClaudeCodeHubProviderTypeOptions).toEqual([
      {
        value: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
        label: "OpenAI Compatible",
      },
      {
        value: CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX,
        label: "Codex (Responses API)",
      },
      {
        value: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
        label: "Claude (Anthropic Messages API)",
      },
      {
        value: CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI,
        label: "Gemini (Google Gemini API)",
      },
    ])
  })

  it("preserves legacy provider types returned by Claude Code Hub", () => {
    const channel = providerToManagedSiteChannel({
      id: 8,
      name: "Legacy Gemini CLI Provider",
      providerType: "gemini-cli",
      url: "https://api.example.com",
      allowedModels: ["gemini-2.5-pro"],
    })

    expect(channel.type).toBe("gemini-cli")
  })

  it("maps create form data to CCH provider payloads and validates real keys", () => {
    expect(
      buildClaudeCodeHubCreatePayloadFromFormData({
        name: "Provider",
        type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX,
        key: "sk-real-key",
        base_url: "https://api.example.com",
        models: ["gpt-4o"],
        groups: ["paid"],
        priority: 2,
        weight: 0,
        status: CHANNEL_STATUS.Enable,
      }),
    ).toEqual({
      name: "Provider",
      url: "https://api.example.com",
      key: "sk-real-key",
      provider_type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX,
      allowed_models: [{ matchType: "exact", pattern: "gpt-4o" }],
      is_enabled: true,
      weight: 1,
      priority: 2,
      group_tag: "paid",
    })

    expect(() =>
      buildClaudeCodeHubCreatePayloadFromFormData({
        ...DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS,
        name: "Provider",
        key: "sk-***",
        base_url: "https://api.example.com",
        models: ["gpt-4o"],
      }),
    ).toThrow("messages:claudecodehub.realProviderKeyRequired")

    expect(
      buildClaudeCodeHubCreatePayloadFromFormData({
        name: "Weighted Provider",
        type: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
        key: "sk-real-key",
        base_url: "https://api.example.com",
        models: ["gpt-4o"],
        groups: ["paid"],
        priority: 2,
        weight: Number.NaN,
        status: CHANNEL_STATUS.Enable,
      }),
    ).toMatchObject({
      weight: 1,
    })
  })

  it("omits masked keys on update and sends replacement keys only when usable", () => {
    expect(
      buildClaudeCodeHubUpdatePayloadFromChannelData({
        id: 7,
        name: "Provider",
        type: "gemini-cli",
        key: "sk-***",
        base_url: "https://api.example.com",
        models: "gemini-2.5-pro",
        groups: ["default"],
        priority: 3,
        weight: 4,
        status: CHANNEL_STATUS.ManuallyDisabled,
      }),
    ).toEqual({
      providerId: 7,
      name: "Provider",
      provider_type: "gemini-cli",
      url: "https://api.example.com",
      allowed_models: [{ matchType: "exact", pattern: "gemini-2.5-pro" }],
      is_enabled: false,
      weight: 4,
      priority: 3,
      group_tag: "default",
    })

    expect(
      buildClaudeCodeHubUpdatePayloadFromChannelData({
        id: 7,
        key: "sk-replacement",
      }),
    ).toMatchObject({ providerId: 7, key: "sk-replacement" })
  })

  it("prepares account-token import form data with default provider type and model fallback", async () => {
    mockFetchTokenScopedModels.mockResolvedValueOnce({
      models: ["gpt-4o"],
      fetchFailed: false,
    })

    await expect(
      prepareChannelFormData(
        {
          id: "account-1",
          name: "Account",
          baseUrl: "https://api.example.com",
        } as any,
        { id: 1, name: "Token", key: "sk-real-key" } as any,
      ),
    ).resolves.toMatchObject({
      name: "Account | Token (auto)",
      type: "openai-compatible",
      key: "sk-real-key",
      base_url: "https://api.example.com",
      models: ["gpt-4o"],
      groups: ["default"],
      weight: 1,
    })

    mockFetchTokenScopedModels.mockResolvedValueOnce({
      models: [],
      fetchFailed: true,
    })

    await expect(
      prepareChannelFormData(
        {
          id: "account-1",
          name: "Account",
          baseUrl: "https://api.example.com",
        } as any,
        { id: 1, name: "Token", key: "sk-real-key" } as any,
      ),
    ).resolves.toMatchObject({
      models: [],
      modelPrefillFetchFailed: true,
    })
  })

  it("uses the AIHubMix API origin for managed-site channel imports", async () => {
    mockFetchTokenScopedModels.mockResolvedValueOnce({
      models: ["gpt-aihubmix-mini"],
      fetchFailed: false,
    })

    const token = { id: 1, name: "Token", key: "sk-aihubmix-key" } as any

    await expect(
      prepareChannelFormData(
        {
          id: "account-1",
          name: "AIHubMix",
          siteType: SITE_TYPES.AIHUBMIX,
          baseUrl: "https://console.aihubmix.com",
        } as any,
        token,
      ),
    ).resolves.toMatchObject({
      key: "sk-aihubmix-key",
      base_url: "https://aihubmix.com",
      models: ["gpt-aihubmix-mini"],
    })

    expect(mockFetchTokenScopedModels).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://aihubmix.com",
      }),
      token,
    )
  })

  it("returns the saved Claude Code Hub runtime config helper shape", async () => {
    mockGetPreferences.mockResolvedValue({
      claudeCodeHub: storedClaudeCodeHubConfig,
    })

    await expect(getClaudeCodeHubConfig()).resolves.toEqual(
      storedClaudeCodeHubConfig,
    )
  })

  it("validates saved Claude Code Hub config only when required fields exist", async () => {
    const claudeCodeHubApi = await import("~/services/apiService/claudeCodeHub")
    vi.mocked(
      claudeCodeHubApi.validateClaudeCodeHubConfig,
    ).mockResolvedValueOnce(true)
    mockGetPreferences.mockResolvedValueOnce({
      claudeCodeHub: storedClaudeCodeHubConfig,
    })

    await expect(checkValidClaudeCodeHubConfig()).resolves.toBe(true)
    expect(claudeCodeHubApi.validateClaudeCodeHubConfig).toHaveBeenCalledWith(
      storedClaudeCodeHubConfig,
    )

    vi.mocked(claudeCodeHubApi.validateClaudeCodeHubConfig).mockClear()
    mockGetPreferences.mockResolvedValueOnce({
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "",
      },
    })

    await expect(checkValidClaudeCodeHubConfig()).resolves.toBe(false)
    expect(claudeCodeHubApi.validateClaudeCodeHubConfig).not.toHaveBeenCalled()
  })

  it("lists providers through the same normalized channel list shape", async () => {
    const requestSignal = new AbortController().signal
    const beforeRequest = vi.fn().mockResolvedValue(undefined)
    mockListProviders.mockResolvedValue([
      {
        id: 22,
        name: "Provider Beta",
        providerType: "claude",
        url: "https://beta.example.com",
        maskedKey: "sk-***",
        allowedModels: ["claude-sonnet"],
        groupTag: "team-b",
      },
    ])

    await expect(
      listChannels(passedClaudeCodeHubConfig, {
        signal: requestSignal,
        beforeRequest,
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          id: 22,
          name: "Provider Beta",
          models: "claude-sonnet",
        }),
      ],
      type_counts: {
        claude: 1,
      },
    })
    expect(beforeRequest).toHaveBeenCalledTimes(1)
    expect(mockListProviders).toHaveBeenCalledWith(passedClaudeCodeHubConfig, {
      signal: requestSignal,
    })
    expect(mockSearchProviders).not.toHaveBeenCalled()
  })

  it("searches, creates, updates, and deletes providers with passed admin config", async () => {
    mockGetPreferences.mockResolvedValue({
      claudeCodeHub: storedClaudeCodeHubConfig,
    })
    mockSearchProviders.mockResolvedValue([
      {
        id: 21,
        name: "Provider Alpha",
        providerType: "codex",
        url: "https://alpha.example.com",
        key: "sk-real-key",
        allowedModels: ["gpt-4o"],
        groupTag: "team-a",
      },
    ])
    mockCreateProvider.mockResolvedValue({ ok: true })
    mockUpdateProvider.mockResolvedValue({ ok: true })
    mockDeleteProvider.mockResolvedValue({ ok: true })

    await expect(
      searchChannel(passedClaudeCodeHubConfig, "alpha"),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          id: 21,
          name: "Provider Alpha",
        }),
      ],
      type_counts: {
        codex: 1,
      },
    })
    expect(mockSearchProviders).toHaveBeenCalledWith(
      passedClaudeCodeHubConfig,
      "alpha",
    )
    expect(mockListProviders).not.toHaveBeenCalled()

    await expect(
      createChannel(passedClaudeCodeHubConfig, {
        channel: {
          name: "Created Provider",
          type: "codex",
          key: "sk-created-key",
          base_url: "https://created.example.com",
          models: "gpt-4o,gpt-4.1",
          groups: ["team-a"],
          priority: 2,
          weight: 3,
          status: CHANNEL_STATUS.Enable,
        },
      } as any),
    ).resolves.toEqual({
      success: true,
      data: { ok: true },
      message: "success",
    })
    expect(mockCreateProvider).toHaveBeenCalledWith(
      passedClaudeCodeHubConfig,
      expect.objectContaining({
        name: "Created Provider",
        provider_type: "codex",
        group_tag: "team-a",
      }),
    )

    await expect(
      updateChannel(passedClaudeCodeHubConfig, {
        id: 21,
        key: "sk-updated-key",
        base_url: "https://updated.example.com",
        models: "gpt-4o",
        groups: ["team-b"],
        status: CHANNEL_STATUS.ManuallyDisabled,
      } as any),
    ).resolves.toEqual({
      success: true,
      data: { ok: true },
      message: "success",
    })

    await expect(deleteChannel(passedClaudeCodeHubConfig, 21)).resolves.toEqual(
      {
        success: true,
        data: { ok: true },
        message: "success",
      },
    )
  })

  it("fetches real provider keys through the Claude Code Hub provider API", async () => {
    mockGetPreferences.mockResolvedValue({
      claudeCodeHub: storedClaudeCodeHubConfig,
    })
    mockGetUnmaskedProviderKey.mockResolvedValueOnce("sk-real-provider-key")

    await expect(
      fetchChannelSecretKey(passedClaudeCodeHubConfig, 42),
    ).resolves.toBe("sk-real-provider-key")
    expect(mockGetUnmaskedProviderKey).toHaveBeenCalledWith(
      passedClaudeCodeHubConfig,
      42,
    )
  })

  it("surfaces provider key reveal failures from edit flows", async () => {
    mockGetPreferences.mockResolvedValue({
      claudeCodeHub: storedClaudeCodeHubConfig,
    })
    mockGetUnmaskedProviderKey.mockRejectedValueOnce(new Error("reveal failed"))

    await expect(
      fetchChannelSecretKey(passedClaudeCodeHubConfig, 42),
    ).rejects.toThrow("reveal failed")
  })

  it("hydrates provided Claude Code Hub candidates through provider key reveal", async () => {
    mockGetPreferences.mockResolvedValue({
      claudeCodeHub: storedClaudeCodeHubConfig,
    })
    mockGetUnmaskedProviderKey.mockResolvedValueOnce("sk-provider-secret")

    const result = await hydrateComparableChannelKeys(
      passedClaudeCodeHubConfig,
      [
        {
          id: 30,
          type: "openai-compatible",
          key: "",
          name: "Masked Provider",
          base_url: "https://api.example.com",
          models: "gpt-4o",
        } as any,
      ],
    )

    expect(result).toEqual([
      expect.objectContaining({
        id: 30,
        key: "sk-provider-secret",
      }),
    ])
  })

  it("hydrates only provided Claude Code Hub duplicate candidates", async () => {
    mockGetPreferences.mockResolvedValue({
      claudeCodeHub: storedClaudeCodeHubConfig,
    })
    mockGetUnmaskedProviderKey.mockResolvedValueOnce("sk-real-key")

    const result = await hydrateComparableChannelKeys(
      passedClaudeCodeHubConfig,
      [
        {
          id: 31,
          name: "Matching Masked Provider",
          key: "",
        } as any,
      ],
    )

    expect(result).toEqual([
      expect.objectContaining({
        id: 31,
        name: "Matching Masked Provider",
        key: "sk-real-key",
      }),
    ])
    expect(mockGetUnmaskedProviderKey).toHaveBeenCalledTimes(1)
    expect(mockGetUnmaskedProviderKey).toHaveBeenCalledWith(
      passedClaudeCodeHubConfig,
      31,
    )
  })

  it("maps Claude Code Hub provider key reveal failures to unresolved hydration errors", async () => {
    mockGetPreferences.mockResolvedValue({
      claudeCodeHub: storedClaudeCodeHubConfig,
    })
    mockGetUnmaskedProviderKey.mockRejectedValueOnce(new Error("reveal failed"))

    await expect(
      hydrateComparableChannelKeys(passedClaudeCodeHubConfig, [
        {
          id: 33,
          name: "Masked Provider",
          key: "",
        } as any,
      ]),
    ).rejects.toMatchObject({
      name: MatchResolutionUnresolvedError.name,
      reason:
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
    })
  })

  it("surfaces API failures for CRUD-style operations", async () => {
    mockGetPreferences.mockResolvedValueOnce({})

    mockGetPreferences.mockResolvedValue({
      claudeCodeHub: storedClaudeCodeHubConfig,
    })
    mockCreateProvider.mockRejectedValueOnce(new Error("create failed"))
    mockUpdateProvider.mockRejectedValueOnce(new Error("update failed"))
    mockDeleteProvider.mockRejectedValueOnce(new Error("delete failed"))
    mockSearchProviders.mockRejectedValueOnce(new Error("search failed"))

    await expect(
      searchChannel(passedClaudeCodeHubConfig, "alpha"),
    ).resolves.toBeNull()
    await expect(
      createChannel(passedClaudeCodeHubConfig, {
        channel: {
          name: "Created Provider",
          key: "sk-created-key",
          models: "gpt-4o",
        },
      } as any),
    ).resolves.toEqual({
      success: false,
      data: null,
      message: "create failed",
    })
    await expect(
      updateChannel(passedClaudeCodeHubConfig, {
        id: 21,
        key: "sk-updated-key",
      } as any),
    ).resolves.toEqual({
      success: false,
      data: null,
      message: "update failed",
    })
    await expect(deleteChannel(passedClaudeCodeHubConfig, 21)).resolves.toEqual(
      {
        success: false,
        data: null,
        message: "delete failed",
      },
    )
  })

  it("builds channel payloads, fetches models, and matches only comparable providers", async () => {
    const payload = buildChannelPayload(
      {
        name: "Imported Provider",
        type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
        key: "sk-imported-key",
        base_url: "https://imported.example.com",
        models: ["claude-sonnet"],
        groups: ["team-a"],
        priority: 4,
        weight: 2,
        status: CHANNEL_STATUS.Enable,
      },
      "single",
    )

    expect(payload).toEqual({
      mode: "single",
      channel: {
        name: "Imported Provider",
        type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
        key: "sk-imported-key",
        base_url: "https://imported.example.com",
        models: "claude-sonnet",
        groups: ["team-a"],
        group: "team-a",
        priority: 4,
        weight: 2,
        status: CHANNEL_STATUS.Enable,
      },
    })

    mockFetchManagedSiteAvailableModels.mockResolvedValueOnce(["gpt-4o"])
    await expect(
      fetchAvailableModels(
        { id: "account-1", baseUrl: "https://api.example.com" } as any,
        { id: 1, key: "sk-real-key" } as any,
      ),
    ).resolves.toEqual(["gpt-4o"])

    mockGetPreferences.mockResolvedValue({
      claudeCodeHub: storedClaudeCodeHubConfig,
    })
    await expect(
      hydrateComparableChannelKeys(passedClaudeCodeHubConfig, [
        {
          id: 31,
          name: "Comparable Provider",
          key: "sk-real-key",
        } as any,
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 31,
        key: "sk-real-key",
      }),
    ])
    expect(mockGetUnmaskedProviderKey).not.toHaveBeenCalled()
  })
})
