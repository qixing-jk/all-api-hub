import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuthTypeEnum } from "~/types"

const mockFetchAccountAvailableModels = vi.fn()
const mockFetchOpenAICompatibleModelIds = vi.fn()

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(() => ({
    fetchAccountAvailableModels: mockFetchAccountAvailableModels,
  })),
}))

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: mockFetchOpenAICompatibleModelIds,
}))

const createAccount = () => ({
  siteType: "new-api" as const,
  baseUrl: "https://api.example.com",
  id: "site-1",
  authType: AuthTypeEnum.AccessToken,
  userId: 1,
  token: "account-access-token",
  cookieAuthSessionCookie: "session=abc",
})

const createToken = (overrides: Record<string, unknown> = {}) => ({
  key: "sk-live-token",
  ...overrides,
})

describe("fetchManagedSiteAvailableModels", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("ignores token.models metadata and keeps only live source results", async () => {
    const { fetchManagedSiteAvailableModels } = await import(
      "~/services/managedSites/utils/fetchManagedSiteAvailableModels"
    )

    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4o-mini"])
    mockFetchAccountAvailableModels.mockResolvedValueOnce([])

    const result = await fetchManagedSiteAvailableModels(
      createAccount(),
      createToken({ models: "declared-a,declared-b" }),
    )

    expect(result).toEqual(["gpt-4o-mini"])
  })

  it("falls back to account model discovery when the live token probe fails", async () => {
    const { fetchManagedSiteAvailableModels } = await import(
      "~/services/managedSites/utils/fetchManagedSiteAvailableModels"
    )

    mockFetchOpenAICompatibleModelIds.mockRejectedValueOnce(
      new Error("Upstream failed"),
    )
    mockFetchAccountAvailableModels.mockResolvedValueOnce(["claude-3-opus"])

    const result = await fetchManagedSiteAvailableModels(
      createAccount(),
      createToken({ models: "declared-only-model" }),
    )

    expect(result).toEqual(["claude-3-opus"])
    expect(result).not.toContain("declared-only-model")
  })

  it("can skip account fallback entirely for providers that require token-only live results", async () => {
    const { fetchManagedSiteAvailableModels } = await import(
      "~/services/managedSites/utils/fetchManagedSiteAvailableModels"
    )

    mockFetchOpenAICompatibleModelIds.mockRejectedValueOnce(
      new Error("Upstream failed"),
    )

    const result = await fetchManagedSiteAvailableModels(
      createAccount(),
      createToken({ models: "declared-only-model" }),
      {
        includeAccountFallback: false,
      },
    )

    expect(result).toEqual([])
    expect(mockFetchAccountAvailableModels).not.toHaveBeenCalled()
  })
})
