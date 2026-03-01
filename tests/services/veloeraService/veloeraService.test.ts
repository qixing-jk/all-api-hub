import { describe, expect, it, vi } from "vitest"

import type { CreateChannelPayload, UpdateChannelPayload } from "~/types/newapi"

// ============================================================================
// MOCKS
// ============================================================================

const mockToast = {
  loading: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}

vi.mock("react-hot-toast", () => ({
  default: mockToast,
}))

const mockFetchAccountAvailableModels = vi.fn()
const mockFetchOpenAICompatibleModelIds = vi.fn()
const mockSearchChannel = vi.fn()
const mockCreateChannel = vi.fn()
const mockUpdateChannel = vi.fn()
const mockDeleteChannel = vi.fn()

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(() => ({
    fetchAccountAvailableModels: mockFetchAccountAvailableModels,
    searchChannel: mockSearchChannel,
    createChannel: mockCreateChannel,
    updateChannel: mockUpdateChannel,
    deleteChannel: mockDeleteChannel,
  })),
}))

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: mockFetchOpenAICompatibleModelIds,
}))

const mockGetPreferences = vi.fn()
vi.mock("~/services/userPreferences", () => ({
  userPreferences: {
    getPreferences: mockGetPreferences,
  },
}))

// ============================================================================
// FIXTURES
// ============================================================================

/**
 * Creates a minimal UserPreferences-like object wired with Veloera configuration.
 */
function createMockUserPreferencesWithVeloera(
  overrides?: Record<string, unknown>,
) {
  return {
    veloera: {
      baseUrl: "https://veloera.example.com",
      adminToken: "admin-token-123",
      userId: "user-123",
    },
    ...overrides,
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe("veloeraService", () => {
  describe("hasValidVeloeraConfig", () => {
    it("returns true with valid config", async () => {
      const { hasValidVeloeraConfig } = await import(
        "~/services/managedSites/providers/veloera"
      )

      expect(
        hasValidVeloeraConfig(
          createMockUserPreferencesWithVeloera() as unknown as Parameters<
            typeof hasValidVeloeraConfig
          >[0],
        ),
      ).toBe(true)
    })

    it("returns false when prefs is null", async () => {
      const { hasValidVeloeraConfig } = await import(
        "~/services/managedSites/providers/veloera"
      )

      expect(hasValidVeloeraConfig(null)).toBe(false)
    })

    it("returns false when required fields are missing", async () => {
      const { hasValidVeloeraConfig } = await import(
        "~/services/managedSites/providers/veloera"
      )

      const cases = [
        { veloera: { adminToken: "token", userId: "user" } },
        { veloera: { baseUrl: "url", userId: "user" } },
        { veloera: { baseUrl: "url", adminToken: "token" } },
        { veloera: { baseUrl: "", adminToken: "token", userId: "user" } },
      ]

      for (const prefs of cases) {
        expect(
          hasValidVeloeraConfig({
            ...createMockUserPreferencesWithVeloera(),
            ...prefs,
          } as unknown as Parameters<typeof hasValidVeloeraConfig>[0]),
        ).toBe(false)
      }
    })
  })

  describe("getVeloeraConfig", () => {
    it("returns config when preferences are valid", async () => {
      const { getVeloeraConfig } = await import(
        "~/services/managedSites/providers/veloera"
      )

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithVeloera(),
      )

      const result = await getVeloeraConfig()
      expect(result).toEqual({
        baseUrl: "https://veloera.example.com",
        token: "admin-token-123",
        userId: "user-123",
      })
    })

    it("returns null when preferences are invalid", async () => {
      const { getVeloeraConfig } = await import(
        "~/services/managedSites/providers/veloera"
      )

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithVeloera({
          veloera: { baseUrl: "", adminToken: "", userId: "" },
        }),
      )

      const result = await getVeloeraConfig()
      expect(result).toBeNull()
    })
  })

  describe("searchChannel/createChannel/updateChannel/deleteChannel", () => {
    it("passes VELOERA site hint to apiService wrappers", async () => {
      const { searchChannel, createChannel, updateChannel, deleteChannel } =
        await import("~/services/managedSites/providers/veloera")

      mockSearchChannel.mockResolvedValueOnce(null)
      await searchChannel("https://veloera.example.com", "token", "1", "k")
      expect(mockSearchChannel).toHaveBeenLastCalledWith(
        {
          baseUrl: "https://veloera.example.com",
          auth: {
            authType: "access_token",
            accessToken: "token",
            userId: "1",
          },
        },
        "k",
      )

      mockCreateChannel.mockResolvedValueOnce({ success: true, message: "ok" })
      const createPayload: CreateChannelPayload = {
        mode: "none" as unknown as CreateChannelPayload["mode"],
        channel: {
          name: "n",
          type: 1,
          key: "k",
          base_url: "https://upstream.example.com",
          models: "gpt-4",
          groups: ["default"],
          priority: 0,
          weight: 0,
          status: 1,
        },
      }
      await createChannel(
        "https://veloera.example.com",
        "token",
        "1",
        createPayload,
      )
      expect(mockCreateChannel).toHaveBeenLastCalledWith(
        {
          baseUrl: "https://veloera.example.com",
          auth: {
            authType: "access_token",
            accessToken: "token",
            userId: "1",
          },
        },
        createPayload,
      )

      mockUpdateChannel.mockResolvedValueOnce({ success: true, message: "ok" })
      const updatePayload: UpdateChannelPayload = {
        id: 1,
        name: "Updated Channel",
        key: "k",
        base_url: "https://upstream.example.com",
        models: "gpt-4",
        group: "default",
        groups: ["default"],
        priority: 0,
      }
      await updateChannel(
        "https://veloera.example.com",
        "token",
        "1",
        updatePayload,
      )
      expect(mockUpdateChannel).toHaveBeenLastCalledWith(
        {
          baseUrl: "https://veloera.example.com",
          auth: {
            authType: "access_token",
            accessToken: "token",
            userId: "1",
          },
        },
        updatePayload,
      )

      mockDeleteChannel.mockResolvedValueOnce({ success: true, message: "ok" })
      await deleteChannel("https://veloera.example.com", "token", "1", 1)
      expect(mockDeleteChannel).toHaveBeenLastCalledWith(
        {
          baseUrl: "https://veloera.example.com",
          auth: {
            authType: "access_token",
            accessToken: "token",
            userId: "1",
          },
        },
        1,
      )
    })
  })
})
