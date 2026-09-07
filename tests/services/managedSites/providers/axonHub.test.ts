import { beforeEach, describe, expect, it, vi } from "vitest"

import { AXON_HUB_CHANNEL_TYPE } from "~/constants/axonHub"
import { SITE_TYPES } from "~/constants/siteType"
import { getManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import {
  buildApiToken,
  buildDisplaySiteData,
  buildUserPreferences,
} from "~~/tests/test-utils/factories"

const { mockFetchTokenScopedModels, mockGetPreferences, mockSignIn } =
  vi.hoisted(() => ({
    mockFetchTokenScopedModels: vi.fn(),
    mockGetPreferences: vi.fn(),
    mockSignIn: vi.fn(),
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

vi.mock("~/services/apiService/axonHub", () => ({ signIn: mockSignIn }))

vi.mock("~/services/managedSites/utils/fetchTokenScopedModels", () => ({
  fetchTokenScopedModels: mockFetchTokenScopedModels,
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
      buildUserPreferences({ axonHub: axonHubConfig }),
    )
    mockFetchTokenScopedModels.mockResolvedValue({
      models: ["gpt-4o", "gpt-4.1"],
      fetchFailed: false,
    })
  })

  it("validates and reads saved config", async () => {
    const provider = await import("~/services/managedSites/providers/axonHub")

    await expect(provider.checkValidAxonHubConfig()).resolves.toBe(true)
    expect(
      (await getManagedSiteRuntimeConfigForType(SITE_TYPES.AXON_HUB))?.config ??
        null,
    ).toEqual(axonHubConfig)

    expect(mockSignIn).toHaveBeenCalledWith(axonHubConfig)
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
    expect(
      (await getManagedSiteRuntimeConfigForType(SITE_TYPES.AXON_HUB))?.config ??
        null,
    ).toBeNull()

    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it("prefills imports from selected token credentials", async () => {
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
        enabled: true,
      }),
    )

    expect(mockFetchTokenScopedModels).toHaveBeenCalledWith(account, token)
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

  it("marks model prefill failures for manual review", async () => {
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
  })
})
