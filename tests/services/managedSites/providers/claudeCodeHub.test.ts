import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  CLAUDE_CODE_HUB_PROVIDER_TYPE,
  ClaudeCodeHubProviderTypeOptions,
  DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS,
} from "~/constants/claudeCodeHub"
import {
  autoConfigToClaudeCodeHub,
  buildChannelPayload,
  buildClaudeCodeHubCreatePayloadFromFormData,
  buildClaudeCodeHubUpdatePayloadFromChannelData,
  createChannel,
  deleteChannel,
  fetchAvailableModels,
  findMatchingChannel,
  prepareChannelFormData,
  providerToManagedSiteChannel,
  searchChannel,
  updateChannel,
} from "~/services/managedSites/providers/claudeCodeHub"
import { CHANNEL_STATUS } from "~/types/managedSite"

const mockFetchTokenScopedModels = vi.fn()
const mockFetchManagedSiteAvailableModels = vi.fn()
const mockListProviders = vi.fn()
const mockCreateProvider = vi.fn()
const mockUpdateProvider = vi.fn()
const mockDeleteProvider = vi.fn()
const mockGetPreferences = vi.fn()
const mockFindManagedSiteChannelByComparableInputs = vi.fn()
const mockConvertToDisplayData = vi.fn()
const mockEnsureAccountApiToken = vi.fn()
const toastLoading = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()

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
  createProvider: (...args: unknown[]) => mockCreateProvider(...args),
  updateProvider: (...args: unknown[]) => mockUpdateProvider(...args),
  deleteProvider: (...args: unknown[]) => mockDeleteProvider(...args),
  validateClaudeCodeHubConfig: vi.fn(),
  normalizeClaudeCodeHubBaseUrl: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: (...args: unknown[]) => mockGetPreferences(...args),
  },
}))

vi.mock("~/services/managedSites/utils/channelMatching", () => ({
  findManagedSiteChannelByComparableInputs: (...args: unknown[]) =>
    mockFindManagedSiteChannelByComparableInputs(...args),
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    convertToDisplayData: (...args: unknown[]) =>
      mockConvertToDisplayData(...args),
  },
}))

vi.mock("~/services/accounts/accountOperations", () => ({
  ensureAccountApiToken: (...args: unknown[]) =>
    mockEnsureAccountApiToken(...args),
}))

vi.mock("~/utils/i18n/core", () => ({
  t: (key: string) => key,
}))

vi.mock("react-hot-toast", () => ({
  default: {
    loading: (...args: unknown[]) => toastLoading(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

describe("Claude Code Hub managed-site provider", () => {
  beforeEach(() => {
    mockFetchTokenScopedModels.mockReset()
    mockFetchManagedSiteAvailableModels.mockReset()
    mockListProviders.mockReset()
    mockCreateProvider.mockReset()
    mockUpdateProvider.mockReset()
    mockDeleteProvider.mockReset()
    mockGetPreferences.mockReset()
    mockFindManagedSiteChannelByComparableInputs.mockReset()
    mockConvertToDisplayData.mockReset()
    mockEnsureAccountApiToken.mockReset()
    toastLoading.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
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

  it("searches, creates, updates, and deletes providers with stored admin config", async () => {
    mockGetPreferences.mockResolvedValue({
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "admin-token",
      },
    })
    mockListProviders.mockResolvedValue([
      {
        id: 21,
        name: "Provider Alpha",
        providerType: "codex",
        url: "https://alpha.example.com",
        key: "sk-real-key",
        allowedModels: ["gpt-4o"],
        groupTag: "team-a",
      },
      {
        id: 22,
        name: "Provider Beta",
        providerType: "gemini",
        url: "https://beta.example.com",
        key: "sk-other-key",
        allowedModels: ["gemini-2.5-pro"],
        groupTag: "team-b",
      },
    ])
    mockCreateProvider.mockResolvedValue({ ok: true })
    mockUpdateProvider.mockResolvedValue({ ok: true })
    mockDeleteProvider.mockResolvedValue({ ok: true })

    await expect(searchChannel("", "", "", "alpha")).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          id: 21,
          name: "Provider Alpha",
        }),
      ],
      type_counts: {
        codex: 1,
        gemini: 1,
      },
    })

    await expect(
      createChannel("", "", "", {
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
      {
        baseUrl: "https://cch.example.com",
        adminToken: "admin-token",
      },
      expect.objectContaining({
        name: "Created Provider",
        provider_type: "codex",
        group_tag: "team-a",
      }),
    )

    await expect(
      updateChannel("", "", "", {
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

    await expect(deleteChannel("", "", "", 21)).resolves.toEqual({
      success: true,
      data: { ok: true },
      message: "success",
    })
  })

  it("surfaces config and API failures for CRUD-style operations", async () => {
    mockGetPreferences.mockResolvedValueOnce({})

    await expect(searchChannel("", "", "", "alpha")).resolves.toBeNull()
    await expect(
      createChannel("", "", "", {
        channel: {
          name: "Created Provider",
          key: "sk-created-key",
          models: "gpt-4o",
        },
      } as any),
    ).resolves.toEqual({
      success: false,
      data: null,
      message: "messages:claudecodehub.configMissing",
    })

    mockGetPreferences.mockResolvedValue({
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "admin-token",
      },
    })
    mockUpdateProvider.mockRejectedValueOnce(new Error("update failed"))
    mockDeleteProvider.mockRejectedValueOnce(new Error("delete failed"))
    mockListProviders.mockRejectedValueOnce(new Error("search failed"))

    await expect(searchChannel("", "", "", "alpha")).resolves.toBeNull()
    await expect(
      updateChannel("", "", "", {
        id: 21,
        key: "sk-updated-key",
      } as any),
    ).resolves.toEqual({
      success: false,
      data: null,
      message: "update failed",
    })
    await expect(deleteChannel("", "", "", 21)).resolves.toEqual({
      success: false,
      data: null,
      message: "delete failed",
    })
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
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "admin-token",
      },
    })
    mockListProviders.mockResolvedValue([
      {
        id: 31,
        name: "Comparable Provider",
        providerType: "openai-compatible",
        url: "https://api.example.com",
        key: "sk-real-key",
        allowedModels: ["gpt-4o"],
      },
      {
        id: 32,
        name: "Masked Provider",
        providerType: "openai-compatible",
        url: "https://api.example.com",
        maskedKey: "sk-***",
        allowedModels: ["gpt-4o"],
      },
    ])
    mockFindManagedSiteChannelByComparableInputs.mockResolvedValueOnce({
      id: 31,
      name: "Comparable Provider",
    })

    await expect(
      findMatchingChannel(
        "",
        "",
        "",
        "https://api.example.com",
        ["gpt-4o"],
        "sk-real-key",
      ),
    ).resolves.toEqual({
      id: 31,
      name: "Comparable Provider",
    })
    expect(mockFindManagedSiteChannelByComparableInputs).toHaveBeenCalledWith({
      channels: [
        expect.objectContaining({
          id: 31,
          key: "sk-real-key",
        }),
      ],
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4o"],
      key: "sk-real-key",
    })

    mockFindManagedSiteChannelByComparableInputs.mockClear()
    await expect(
      findMatchingChannel(
        "",
        "",
        "",
        "https://api.example.com",
        ["gpt-4o"],
        "sk-***",
      ),
    ).resolves.toBeNull()
    expect(mockFindManagedSiteChannelByComparableInputs).not.toHaveBeenCalled()
  })

  it("auto-imports tokens into Claude Code Hub and reports duplicate or runtime failures", async () => {
    const displayAccount = {
      id: "account-1",
      name: "Account",
      baseUrl: "https://api.example.com",
    }
    const apiToken = { id: 1, name: "Token", key: "sk-real-key" }

    mockGetPreferences.mockResolvedValue({
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "admin-token",
      },
    })
    mockConvertToDisplayData.mockReturnValue(displayAccount)
    mockEnsureAccountApiToken.mockResolvedValue(apiToken)
    mockFetchTokenScopedModels.mockResolvedValue({
      models: ["gpt-4o"],
      fetchFailed: false,
    })
    mockListProviders.mockResolvedValue([])
    mockFindManagedSiteChannelByComparableInputs.mockResolvedValueOnce(null)
    mockCreateProvider.mockResolvedValue({ ok: true })

    await expect(
      autoConfigToClaudeCodeHub({ id: "account-1" } as any, "toast-id"),
    ).resolves.toEqual({
      success: true,
      message: "messages:claudecodehub.importSuccess",
    })
    expect(toastLoading).toHaveBeenCalledWith(
      "messages:accountOperations.importingToClaudeCodeHub",
      { id: "toast-id" },
    )
    expect(toastSuccess).toHaveBeenCalledWith(
      "messages:claudecodehub.importSuccess",
      { id: "toast-id" },
    )

    mockFindManagedSiteChannelByComparableInputs.mockResolvedValueOnce({
      name: "Existing Provider",
    })
    await expect(
      autoConfigToClaudeCodeHub({ id: "account-1" } as any, "toast-id"),
    ).resolves.toEqual({
      success: false,
      message: "messages:claudecodehub.channelExists",
    })
    expect(toastError).toHaveBeenCalledWith(
      "messages:claudecodehub.channelExists",
      { id: "toast-id" },
    )

    mockEnsureAccountApiToken.mockRejectedValueOnce(new Error("token failed"))
    await expect(
      autoConfigToClaudeCodeHub({ id: "account-1" } as any, "toast-id"),
    ).resolves.toEqual({
      success: false,
      message: "token failed",
    })
    expect(toastError).toHaveBeenCalledWith("token failed", { id: "toast-id" })
  })
})
