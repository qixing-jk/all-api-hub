import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { buildDisplayAccountTokenRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { buildManagedSiteChannelDraftSource } from "~/services/managedSites/channelDraftSource"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

const {
  mockFetchSiteUserGroups,
  mockGetPreferences,
  mockFetchManagedSiteImportModels,
  mockResolveDefaultChannelGroups,
} = vi.hoisted(() => ({
  mockFetchSiteUserGroups: vi.fn(),
  mockGetPreferences: vi.fn(),
  mockFetchManagedSiteImportModels: vi.fn(),
  mockResolveDefaultChannelGroups: vi.fn(),
}))

vi.mock("~/services/apiService/doneHub", () => ({
  fetchSiteUserGroups: (...args: unknown[]) => mockFetchSiteUserGroups(...args),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: mockGetPreferences,
  },
}))

vi.mock("~/services/managedSites/utils/fetchManagedSiteImportModels", () => ({
  fetchManagedSiteImportModels: mockFetchManagedSiteImportModels,
}))

vi.mock("~/services/managedSites/providers/defaultChannelGroups", () => ({
  resolveDefaultChannelGroups: mockResolveDefaultChannelGroups,
}))

describe("doneHubService additional flows", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()

    mockGetPreferences.mockResolvedValue({
      doneHub: {
        baseUrl: "https://done-hub.example.com",
        adminToken: "done-hub-token",
        userId: "100",
      },
    })
    mockFetchManagedSiteImportModels.mockResolvedValue({
      models: ["gpt-4o", "gpt-4.1"],
      fetchFailed: false,
    })
    mockResolveDefaultChannelGroups.mockResolvedValue(["ops", "default"])
    mockFetchSiteUserGroups.mockResolvedValue(["default"])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("prepares channel form data from token-scoped models and resolved default groups", async () => {
    const { prepareChannelFormData } = await import(
      "~/services/managedSites/providers/doneHubService"
    )
    const account = buildDisplaySiteData({
      name: "Done Hub Account",
      baseUrl: "https://proxy.example.com",
    })
    const token = buildApiToken({
      key: "done-hub-key",
      name: "Primary Token",
    })

    const result = await prepareChannelFormData(
      buildManagedSiteChannelDraftSource(
        buildDisplayAccountTokenRuntimeKey(account, token),
      ),
    )

    expect(mockFetchManagedSiteImportModels).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://proxy.example.com",
        apiKey: "done-hub-key",
      }),
      undefined,
    )
    expect(mockResolveDefaultChannelGroups).toHaveBeenCalled()
    expect(result).toMatchObject({
      name: "Done Hub Account | Primary Token (auto)",
      type: 1,
      enabled: true,
      key: "done-hub-key",
      base_url: "https://proxy.example.com",
      models: ["gpt-4o", "gpt-4.1"],
      groups: ["ops", "default"],
    })
    expect(result.modelPrefillFetchFailed).toBeUndefined()
  })

  it("passes Done Hub group lookup wiring to the default-group resolver", async () => {
    const { prepareChannelFormData } = await import(
      "~/services/managedSites/providers/doneHubService"
    )
    const groupError = new Error("groups unavailable")
    mockResolveDefaultChannelGroups.mockImplementationOnce(async (options) => {
      const groups = await options.fetchSiteUserGroups({
        baseUrl: "https://done-hub.example.com",
        adminToken: "done-hub-token",
        userId: "100",
      })
      options.onError(groupError)
      return groups
    })
    const account = buildDisplaySiteData({
      name: "Done Hub Account",
      baseUrl: "https://proxy.example.com",
    })
    const token = buildApiToken({
      key: "done-hub-key",
      name: "Primary Token",
    })

    const result = await prepareChannelFormData(
      buildManagedSiteChannelDraftSource(
        buildDisplayAccountTokenRuntimeKey(account, token),
      ),
    )

    expect(mockResolveDefaultChannelGroups).toHaveBeenCalled()
    expect(mockResolveDefaultChannelGroups.mock.calls[0][0]).toEqual({
      getConfig: expect.any(Function),
      fetchSiteUserGroups: expect.any(Function),
      onError: expect.any(Function),
    })
    expect(mockFetchSiteUserGroups).toHaveBeenCalledWith({
      baseUrl: "https://done-hub.example.com",
      auth: {
        authType: "access_token",
        accessToken: "done-hub-token",
        userId: "100",
      },
    })
    expect(result.groups).toEqual(["default"])
  })

  it("uses the AIHubMix API origin for managed-site channel imports", async () => {
    const { prepareChannelFormData } = await import(
      "~/services/managedSites/providers/doneHubService"
    )
    const account = buildDisplaySiteData({
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://console.aihubmix.com",
    })
    const token = buildApiToken({
      key: "aihubmix-key",
      name: "AIHubMix Token",
    })

    const result = await prepareChannelFormData(
      buildManagedSiteChannelDraftSource(
        buildDisplayAccountTokenRuntimeKey(account, token),
      ),
    )

    expect(mockFetchManagedSiteImportModels).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://aihubmix.com",
        apiKey: token.key,
      }),
      undefined,
    )
    expect(result.base_url).toBe("https://aihubmix.com")
  })

  it("marks model prefill failure and trims payload fields when building a channel payload", async () => {
    const { buildChannelPayload, prepareChannelFormData } = await import(
      "~/services/managedSites/providers/doneHubService"
    )

    mockFetchManagedSiteImportModels.mockResolvedValueOnce({
      models: ["gpt-4o"],
      fetchFailed: true,
    })
    mockResolveDefaultChannelGroups.mockResolvedValueOnce([])

    const formData = await prepareChannelFormData(
      buildManagedSiteChannelDraftSource(
        buildDisplayAccountTokenRuntimeKey(
          buildDisplaySiteData(),
          buildApiToken(),
        ),
      ),
    )
    const payload = buildChannelPayload({
      ...formData,
      status: 1,
      name: "  Imported Channel  ",
      key: "  secret-key  ",
      base_url: " https://proxy.example.com  ",
      groups: [],
      models: [" gpt-4o ", "gpt-4o", "claude-3"],
    })

    expect(formData.modelPrefillFetchFailed).toBe(true)
    expect(payload).toEqual(
      expect.objectContaining({
        name: "Imported Channel",
        key: "secret-key",
        base_url: "https://proxy.example.com",
        models: "gpt-4o,claude-3",
        group: "default",
      }),
    )
  })

  it("returns config helper fallbacks when preferences are missing or reading fails", async () => {
    const { checkValidDoneHubConfig, getDoneHubConfig } = await import(
      "~/services/managedSites/providers/doneHubService"
    )

    mockGetPreferences.mockResolvedValueOnce(null)
    await expect(checkValidDoneHubConfig()).resolves.toBe(false)

    mockGetPreferences.mockResolvedValueOnce({
      doneHub: {
        baseUrl: "",
        adminToken: "",
        userId: "",
      },
    })
    await expect(getDoneHubConfig()).resolves.toBeNull()

    mockGetPreferences.mockResolvedValueOnce({
      doneHub: {
        baseUrl: "https://done-hub.example.com",
        adminToken: "done-hub-token",
        userId: "abc",
      },
    })
    await expect(checkValidDoneHubConfig()).resolves.toBe(false)

    mockGetPreferences.mockResolvedValueOnce({
      doneHub: {
        baseUrl: "https://done-hub.example.com",
        adminToken: "done-hub-token",
        userId: "abc",
      },
    })
    await expect(getDoneHubConfig()).resolves.toBeNull()

    mockGetPreferences.mockRejectedValueOnce(
      new Error("preferences unavailable"),
    )
    await expect(checkValidDoneHubConfig()).resolves.toBe(false)

    mockGetPreferences.mockRejectedValueOnce(
      new Error("preferences unavailable"),
    )
    await expect(getDoneHubConfig()).resolves.toBeNull()
  })
})
