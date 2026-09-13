import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  CLAUDE_CODE_HUB_PROVIDER_TYPE,
  ClaudeCodeHubProviderTypeOptions,
} from "~/constants/claudeCodeHub"
import { SITE_TYPES } from "~/constants/siteType"
import { buildDisplayAccountTokenRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { buildManagedSiteChannelDraftSource } from "~/services/managedSites/channelDraftSource"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import {
  checkValidClaudeCodeHubConfig,
  fetchChannelSecretKey,
  hydrateComparableChannelKeys,
  prepareChannelFormData,
} from "~/services/managedSites/providers/claudeCodeHub"
import { getManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"

const mockFetchManagedSiteImportModels = vi.fn()
const mockFetchManagedSiteAvailableModels = vi.fn()
const mockListProviders = vi.fn()
const mockSearchProviders = vi.fn()
const mockCreateProvider = vi.fn()
const mockUpdateProvider = vi.fn()
const mockDeleteProvider = vi.fn()
const mockGetUnmaskedProviderKey = vi.fn()
const mockGetPreferences = vi.fn()
const mockLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock("~/services/managedSites/utils/fetchManagedSiteImportModels", () => ({
  fetchManagedSiteImportModels: (...args: unknown[]) =>
    mockFetchManagedSiteImportModels(...args),
}))

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

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => mockLogger,
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
    mockFetchManagedSiteImportModels.mockReset()
    mockFetchManagedSiteAvailableModels.mockReset()
    mockListProviders.mockReset()
    mockSearchProviders.mockReset()
    mockCreateProvider.mockReset()
    mockUpdateProvider.mockReset()
    mockDeleteProvider.mockReset()
    mockGetUnmaskedProviderKey.mockReset()
    mockGetPreferences.mockReset()
    mockLogger.warn.mockReset()
    mockLogger.error.mockReset()
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

  it("prepares account-token import form data with default provider type and model fallback", async () => {
    mockFetchManagedSiteImportModels.mockResolvedValueOnce({
      models: ["gpt-4o"],
      fetchFailed: false,
    })

    await expect(
      prepareChannelFormData(
        buildManagedSiteChannelDraftSource(
          buildDisplayAccountTokenRuntimeKey(
            {
              id: "account-1",
              name: "Account",
              baseUrl: "https://api.example.com",
            } as any,
            { id: 1, name: "Token", key: "sk-real-key" } as any,
          ),
        ),
      ),
    ).resolves.toMatchObject({
      name: "Account | Token (auto)",
      type: "openai-compatible",
      enabled: true,
      key: "sk-real-key",
      base_url: "https://api.example.com",
      models: ["gpt-4o"],
      groups: ["default"],
      weight: 1,
    })

    mockFetchManagedSiteImportModels.mockResolvedValueOnce({
      models: [],
      fetchFailed: true,
    })

    await expect(
      prepareChannelFormData(
        buildManagedSiteChannelDraftSource(
          buildDisplayAccountTokenRuntimeKey(
            {
              id: "account-1",
              name: "Account",
              baseUrl: "https://api.example.com",
            } as any,
            { id: 1, name: "Token", key: "sk-real-key" } as any,
          ),
        ),
      ),
    ).resolves.toMatchObject({
      models: [],
      modelPrefillFetchFailed: true,
    })
  })

  it("uses the AIHubMix API origin for managed-site channel imports", async () => {
    mockFetchManagedSiteImportModels.mockResolvedValueOnce({
      models: ["gpt-aihubmix-mini"],
      fetchFailed: false,
    })

    const token = { id: 1, name: "Token", key: "sk-aihubmix-key" } as any

    await expect(
      prepareChannelFormData(
        buildManagedSiteChannelDraftSource(
          buildDisplayAccountTokenRuntimeKey(
            {
              id: "account-1",
              name: "AIHubMix",
              siteType: SITE_TYPES.AIHUBMIX,
              baseUrl: "https://console.aihubmix.com",
            } as any,
            token,
          ),
        ),
      ),
    ).resolves.toMatchObject({
      key: "sk-aihubmix-key",
      base_url: "https://aihubmix.com",
      models: ["gpt-aihubmix-mini"],
    })

    expect(mockFetchManagedSiteImportModels).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://aihubmix.com",
        apiKey: token.key,
      }),
      undefined,
    )
  })

  it("returns the saved Claude Code Hub runtime config helper shape", async () => {
    mockGetPreferences.mockResolvedValue({
      claudeCodeHub: storedClaudeCodeHubConfig,
    })

    expect(
      (await getManagedSiteRuntimeConfigForType(SITE_TYPES.CLAUDE_CODE_HUB))
        ?.config ?? null,
    ).toEqual(storedClaudeCodeHubConfig)
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

  it("redacts saved credentials when config validation fails", async () => {
    const claudeCodeHubApi = await import("~/services/apiService/claudeCodeHub")
    mockGetPreferences.mockResolvedValueOnce({
      claudeCodeHub: storedClaudeCodeHubConfig,
    })
    vi.mocked(
      claudeCodeHubApi.validateClaudeCodeHubConfig,
    ).mockRejectedValueOnce(new Error("token stored-admin-token rejected"))

    await expect(checkValidClaudeCodeHubConfig()).resolves.toBe(false)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Claude Code Hub config validation failed",
      expect.not.stringContaining("stored-admin-token"),
    )
  })

  it("logs a normalized summary when preferences fail before config is loaded", async () => {
    const preferencesError = new Error("preferences unavailable")
    mockGetPreferences.mockRejectedValueOnce(preferencesError)

    await expect(checkValidClaudeCodeHubConfig()).resolves.toBe(false)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Claude Code Hub config validation failed",
      "preferences unavailable",
    )
    expect(mockLogger.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      preferencesError,
    )
  })

  it("returns unavailable configuration without logging the storage error", async () => {
    const preferencesError = new Error("preferences unavailable")
    mockGetPreferences.mockRejectedValueOnce(preferencesError)

    expect(
      (await getManagedSiteRuntimeConfigForType(SITE_TYPES.CLAUDE_CODE_HUB))
        ?.config ?? null,
    ).toBeNull()
    expect(mockLogger.error).not.toHaveBeenCalled()
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
      undefined,
    )
  })

  it("preserves cancellation when a provider key read rejects", async () => {
    const controller = new AbortController()
    const reason = new DOMException("Canceled key read", "AbortError")
    mockGetUnmaskedProviderKey.mockImplementationOnce(async () => {
      controller.abort(reason)
      throw reason
    })
    await expect(
      fetchChannelSecretKey(passedClaudeCodeHubConfig, 42, {
        signal: controller.signal,
      }),
    ).rejects.toBe(reason)
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

  it("sanitizes provider key reveal failures at the facade boundary", async () => {
    const raw = Object.assign(new Error("token passed-admin-token rejected"), {
      raw: { token: "passed-admin-token" },
    })
    mockGetUnmaskedProviderKey.mockRejectedValueOnce(raw)

    const failure = await fetchChannelSecretKey(
      passedClaudeCodeHubConfig,
      42,
      undefined,
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).not.toContain("passed-admin-token")
    expect(failure).not.toHaveProperty("raw")
    expect(Object.keys(failure as object)).toEqual([])
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
      undefined,
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
  it("matches only comparable providers", async () => {
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
