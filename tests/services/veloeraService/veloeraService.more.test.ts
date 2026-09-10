import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { buildDisplayAccountTokenRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { buildManagedSiteChannelDraftSource } from "~/services/managedSites/channelDraftSource"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

const {
  mockGetPreferences,
  mockFetchManagedSiteImportModels,
  mockResolveDefaultChannelGroups,
} = vi.hoisted(() => ({
  mockGetPreferences: vi.fn(),
  mockFetchManagedSiteImportModels: vi.fn(),
  mockResolveDefaultChannelGroups: vi.fn(),
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

describe("veloeraService additional flows", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()

    mockGetPreferences.mockResolvedValue({
      veloera: {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "200",
      },
    })
    mockFetchManagedSiteImportModels.mockResolvedValue({
      models: ["gpt-4o"],
      fetchFailed: false,
    })
    mockResolveDefaultChannelGroups.mockResolvedValue(["ops"])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns safe nullish results when Veloera config reads fail", async () => {
    const { checkValidVeloeraConfig, getVeloeraConfig } = await import(
      "~/services/managedSites/providers/veloera"
    )
    mockGetPreferences.mockRejectedValue(new Error("prefs unavailable"))

    await expect(checkValidVeloeraConfig()).resolves.toBe(false)
    await expect(getVeloeraConfig()).resolves.toBeNull()
  })

  it("treats non-numeric stored Veloera admin user IDs as invalid config", async () => {
    const { checkValidVeloeraConfig, getVeloeraConfig } = await import(
      "~/services/managedSites/providers/veloera"
    )
    mockGetPreferences.mockResolvedValueOnce({
      veloera: {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "abc",
      },
    })

    await expect(checkValidVeloeraConfig()).resolves.toBe(false)

    mockGetPreferences.mockResolvedValueOnce({
      veloera: {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "abc",
      },
    })
    await expect(getVeloeraConfig()).resolves.toBeNull()
  })

  it("uses token-model fallback, resolved groups, and model-prefill failure metadata", async () => {
    const { prepareChannelFormData } = await import(
      "~/services/managedSites/providers/veloera"
    )
    mockFetchManagedSiteImportModels.mockResolvedValueOnce({
      models: [],
      fetchFailed: true,
    })

    const token = buildApiToken({
      key: "veloera-key",
      name: "Primary Token",
      models: "gpt-4o,claude-3",
    })

    const result = await prepareChannelFormData(
      buildManagedSiteChannelDraftSource(
        buildDisplayAccountTokenRuntimeKey(
          buildDisplaySiteData({
            name: "Veloera Site",
            baseUrl: "https://proxy.example.com",
          }),
          token,
        ),
      ),
    )

    expect(result).toMatchObject({
      name: "Veloera Site | Primary Token (auto)",
      key: "veloera-key",
      base_url: "https://proxy.example.com",
      models: ["gpt-4o", "claude-3"],
      groups: ["ops"],
      modelPrefillFetchFailed: true,
    })
  })

  it("trims payload fields and falls back to the default group when none is supplied", async () => {
    const { buildChannelPayload } = await import(
      "~/services/managedSites/providers/veloera"
    )

    const payload = buildChannelPayload({
      name: "  Imported Veloera Channel  ",
      type: 1,
      key: "  veloera-key  ",
      base_url: " https://proxy.example.com  ",
      models: ["gpt-4o", "gpt-4o", "claude-3"],
      groups: [],
      priority: 0,
      weight: 0,
      status: 1,
    } as any)

    expect(payload).toEqual(
      expect.objectContaining({
        name: "Imported Veloera Channel",
        key: "veloera-key",
        base_url: "https://proxy.example.com",
        models: "gpt-4o,claude-3",
        group: "default",
      }),
    )
  })
})
