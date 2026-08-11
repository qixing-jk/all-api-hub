import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createApiToken,
  defaultKeyManagementImplementation,
  deleteApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchCurrentUserGroup,
  fetchSiteUserGroups,
  fetchTokenById,
  fetchUserGroups,
  updateApiToken,
} from "~/services/apiService/newApiFamily/default/keyManagement"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { AuthTypeEnum, type ApiToken } from "~/types"

const {
  mockFetchApi,
  mockFetchApiData,
  mockInvalidateResolvedApiTokenKeyCache,
  mockResolveApiTokenKey,
  mockSyncResolvedApiTokenKeyCache,
} = vi.hoisted(() => ({
  mockFetchApi: vi.fn(),
  mockFetchApiData: vi.fn(),
  mockInvalidateResolvedApiTokenKeyCache: vi.fn(),
  mockResolveApiTokenKey: vi.fn(),
  mockSyncResolvedApiTokenKeyCache: vi.fn(),
}))

vi.mock("~/services/accountTokens/tokenKeyResolver", () => ({
  invalidateResolvedApiTokenKeyCache: mockInvalidateResolvedApiTokenKeyCache,
  resolveApiTokenKey: mockResolveApiTokenKey,
  syncResolvedApiTokenKeyCache: mockSyncResolvedApiTokenKeyCache,
}))

vi.mock("~/services/apiTransport/request", () => ({
  fetchApi: mockFetchApi,
  fetchApiData: mockFetchApiData,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  })),
}))

describe("newApiFamily keyManagement", () => {
  const request = {
    baseUrl: "https://api.example.invalid",
    accountId: "account-1",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: "access-token",
      userId: "user-1",
    },
  }

  const token: ApiToken = {
    id: 123,
    user_id: 1,
    key: "sk-abcd************wxyz",
    status: 1,
    name: "Example token",
    created_time: 0,
    accessed_time: 0,
    expired_time: -1,
    remain_quota: 500000,
    unlimited_quota: false,
    model_limits_enabled: false,
    model_limits: "",
    allow_ips: "",
    used_quota: 0,
    group: "",
  }
  const tokenKeyReference: Pick<ApiToken, "id" | "key"> = {
    id: token.id,
    key: token.key,
  }

  const tokenData = {
    name: "Example token",
    remain_quota: 500000,
    expired_time: -1,
    unlimited_quota: false,
    model_limits_enabled: false,
    model_limits: "",
    allow_ips: "",
    group: "",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchApi.mockReset()
    mockFetchApiData.mockReset()
  })

  it("fetchAccountTokens reads every New API page until the empty sentinel", async () => {
    mockFetchApiData
      .mockResolvedValueOnce({
        items: [
          { id: 1, key: " plain-key " },
          { id: 2, key: "sk-already" },
        ],
        page: 1,
        page_size: 2,
        total: 3,
      })
      .mockResolvedValueOnce({
        items: [{ id: 3, key: " sk-final " }],
        page: 2,
        page_size: 2,
        total: 3,
      })
      .mockResolvedValueOnce({
        items: [],
        page: 3,
        page_size: 2,
        total: 3,
      })

    await expect(fetchAccountTokens(request)).resolves.toEqual([
      { id: 1, key: "plain-key" },
      { id: 2, key: "sk-already" },
      { id: 3, key: "sk-final" },
    ])
    expect(mockFetchApiData).toHaveBeenNthCalledWith(1, request, {
      endpoint: "/api/token/?p=0&size=100",
    })
    expect(mockFetchApiData).toHaveBeenNthCalledWith(2, request, {
      endpoint: "/api/token/?p=2&size=100",
    })
    expect(mockFetchApiData).toHaveBeenNthCalledWith(3, request, {
      endpoint: "/api/token/?p=3&size=100",
    })
  })

  it("fetchAccountTokens reads legacy array pages until the empty sentinel", async () => {
    mockFetchApiData
      .mockResolvedValueOnce([{ id: 1, key: " first " }])
      .mockResolvedValueOnce([{ id: 2, key: " second " }])
      .mockResolvedValueOnce([])

    await expect(fetchAccountTokens(request)).resolves.toEqual([
      { id: 1, key: "first" },
      { id: 2, key: "second" },
    ])
    expect(mockFetchApiData).toHaveBeenNthCalledWith(1, request, {
      endpoint: "/api/token/?p=0&size=100",
    })
    expect(mockFetchApiData).toHaveBeenNthCalledWith(2, request, {
      endpoint: "/api/token/?p=1&size=100",
    })
    expect(mockFetchApiData).toHaveBeenNthCalledWith(3, request, {
      endpoint: "/api/token/?p=2&size=100",
    })
  })

  it("fetchAccountTokens ignores stale page and total metadata", async () => {
    mockFetchApiData
      .mockResolvedValueOnce({
        items: [{ id: 1, key: "sk-first" }],
        page: 1,
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [{ id: 2, key: "sk-second" }],
        page: 1,
        total: 99,
      })
      .mockResolvedValueOnce({ items: [], page: 1, total: 0 })

    await expect(fetchAccountTokens(request)).resolves.toHaveLength(2)
    expect(mockFetchApiData).toHaveBeenNthCalledWith(2, request, {
      endpoint: "/api/token/?p=2&size=100",
    })
  })

  it("fetchAccountTokens rejects duplicate IDs instead of accepting a stalled inventory", async () => {
    mockFetchApiData
      .mockResolvedValueOnce([{ id: 1, key: "first" }])
      .mockResolvedValueOnce([{ id: 1, key: "first" }])
      .mockResolvedValueOnce([])

    await expect(fetchAccountTokens(request)).rejects.toThrow(
      "duplicate_token_id",
    )
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "fetchAccountTokens ignores invalid pagination totals: %s",
    async (total) => {
      mockFetchApiData
        .mockResolvedValueOnce({
          items: [{ id: 1, key: "sk-invalid-total" }],
          page: 1,
          page_size: 100,
          total,
        })
        .mockResolvedValueOnce({ items: [], page: 2, total })

      await expect(fetchAccountTokens(request)).resolves.toHaveLength(1)
    },
  )

  it("fetchAccountTokens ignores totals that change mid-inventory", async () => {
    mockFetchApiData
      .mockResolvedValueOnce({
        items: [{ id: 1, key: "sk-first" }],
        page: 1,
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [{ id: 2, key: "sk-second" }],
        page: 2,
        total: 3,
      })
      .mockResolvedValueOnce({ items: [], page: 3, total: 0 })

    await expect(fetchAccountTokens(request)).resolves.toHaveLength(2)
  })

  it("fetchAccountTokens treats an empty page as complete despite a stale total", async () => {
    mockFetchApiData
      .mockResolvedValueOnce({
        items: [{ id: 1, key: "sk-first" }],
        page: 1,
        total: 2,
      })
      .mockResolvedValueOnce({ items: [], page: 2, total: 2 })

    await expect(fetchAccountTokens(request)).resolves.toEqual([
      { id: 1, key: "sk-first" },
    ])
  })

  it("fetchAccountTokens rejects unexpected payload shapes", async () => {
    mockFetchApiData.mockResolvedValueOnce({ unexpected: true })

    await expect(fetchAccountTokens(request)).rejects.toThrow(
      "invalid_token_page_payload",
    )
  })

  it("fetchAccountTokens syncs the complete normalized inventory", async () => {
    mockFetchApiData
      .mockResolvedValueOnce({
        items: [{ id: 3, key: "  sk-trim  " }],
        page: 1,
        page_size: 50,
        total: 1,
      })
      .mockResolvedValueOnce({ items: [], page: 2, total: 1 })

    const result = await fetchAccountTokens(request)

    expect(result.map((item) => item.key)).toEqual(["sk-trim"])
    expect(mockSyncResolvedApiTokenKeyCache).toHaveBeenCalledWith(
      request,
      result,
    )
  })

  it("fetchAccountTokens and related fetch helpers rethrow upstream failures", async () => {
    const tokensError = new Error("tokens unavailable")
    const modelsError = new Error("models unavailable")
    const groupsError = new Error("groups unavailable")
    const siteGroupsError = new Error("site groups unavailable")
    const tokenError = new Error("token unavailable")

    mockFetchApiData
      .mockRejectedValueOnce(tokensError)
      .mockRejectedValueOnce(modelsError)
      .mockRejectedValueOnce(groupsError)
      .mockRejectedValueOnce(siteGroupsError)
      .mockRejectedValueOnce(tokenError)

    await expect(fetchAccountTokens(request)).rejects.toBe(tokensError)
    await expect(fetchAccountAvailableModels(request)).rejects.toBe(modelsError)
    await expect(fetchUserGroups(request)).rejects.toBe(groupsError)
    await expect(fetchSiteUserGroups(request)).rejects.toBe(siteGroupsError)
    await expect(fetchTokenById(request, 9)).rejects.toBe(tokenError)
  })

  it("fetchAccountAvailableModels and fetchUserGroups delegate to their endpoints", async () => {
    mockFetchApiData
      .mockResolvedValueOnce(["gpt-4.1", "claude-3.7"])
      .mockResolvedValueOnce({ default: { quota: 1 } })
      .mockResolvedValueOnce(["default", "vip"])

    await expect(fetchAccountAvailableModels(request)).resolves.toEqual([
      "gpt-4.1",
      "claude-3.7",
    ])
    await expect(fetchUserGroups(request)).resolves.toEqual({
      default: { quota: 1 },
    })
    await expect(fetchSiteUserGroups(request)).resolves.toEqual([
      "default",
      "vip",
    ])
    expect(mockFetchApiData).toHaveBeenNthCalledWith(1, request, {
      endpoint: "/api/user/models",
    })
    expect(mockFetchApiData).toHaveBeenNthCalledWith(2, request, {
      endpoint: "/api/user/self/groups",
    })
    expect(mockFetchApiData).toHaveBeenNthCalledWith(3, request, {
      endpoint: "/api/group",
    })
  })

  it("reads and validates the current user group used by empty-group tokens", async () => {
    mockFetchApiData.mockResolvedValueOnce({ group: " default " })

    await expect(fetchCurrentUserGroup(request)).resolves.toBe("default")
    expect(mockFetchApiData).toHaveBeenCalledWith(request, {
      endpoint: "/api/user/self",
    })

    mockFetchApiData.mockResolvedValueOnce({ group: "" })
    await expect(fetchCurrentUserGroup(request)).rejects.toThrow(
      "invalid_current_user_group_payload",
    )
  })

  it("createApiToken, fetchTokenById, updateApiToken, and deleteApiToken manage token flows", async () => {
    mockFetchApi
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, message: "update failed" })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, message: "delete failed" })
    mockFetchApiData.mockResolvedValueOnce({ id: 9, key: "  sk-123  " })

    await expect(createApiToken(request, tokenData)).resolves.toBe(true)
    await expect(fetchTokenById(request, 9)).resolves.toMatchObject({
      id: 9,
      key: "sk-123",
    })
    await expect(updateApiToken(request, 9, tokenData)).resolves.toBe(true)
    await expect(updateApiToken(request, 9, tokenData)).rejects.toMatchObject({
      message: "update failed",
      code: API_ERROR_CODES.BUSINESS_ERROR,
    })
    await expect(deleteApiToken(request, 9)).resolves.toBe(true)
    await expect(deleteApiToken(request, 9)).rejects.toMatchObject({
      message: "delete failed",
      code: API_ERROR_CODES.BUSINESS_ERROR,
    })

    expect(mockFetchApi).toHaveBeenNthCalledWith(1, request, {
      endpoint: "/api/token/",
      options: {
        method: "POST",
        body: JSON.stringify(tokenData),
      },
    })
    expect(mockFetchApiData).toHaveBeenCalledWith(request, {
      endpoint: "/api/token/9",
    })
    expect(mockFetchApi).toHaveBeenNthCalledWith(2, request, {
      endpoint: "/api/token/",
      options: {
        method: "PUT",
        body: JSON.stringify({ ...tokenData, id: 9 }),
      },
    })
    expect(mockFetchApi).toHaveBeenNthCalledWith(4, request, {
      endpoint: "/api/token/9",
      options: {
        method: "DELETE",
      },
    })
    expect(mockInvalidateResolvedApiTokenKeyCache).toHaveBeenCalledTimes(3)
  })

  it("createApiToken rethrows failed create responses and transport failures", async () => {
    const transportError = new Error("create transport failed")

    mockFetchApi
      .mockResolvedValueOnce({ success: false, message: "create failed" })
      .mockRejectedValueOnce(transportError)

    await expect(createApiToken(request, tokenData)).rejects.toMatchObject({
      message: "create failed",
      code: API_ERROR_CODES.BUSINESS_ERROR,
    })
    await expect(createApiToken(request, tokenData)).rejects.toBe(
      transportError,
    )
  })

  it("uses New API-family helpers by default", async () => {
    const keyManagement = defaultKeyManagementImplementation

    mockFetchApiData
      .mockResolvedValueOnce([token])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ default: { desc: "", ratio: 1 } })
      .mockResolvedValueOnce(["gpt-4o"])
    mockFetchApi
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
    mockResolveApiTokenKey.mockResolvedValue("sk-resolved")

    await expect(keyManagement.fetchAccountTokens(request)).resolves.toEqual([
      token,
    ])
    await expect(
      keyManagement.createApiToken(request, tokenData),
    ).resolves.toBe(true)
    await expect(
      keyManagement.updateApiToken(request, token.id, tokenData),
    ).resolves.toBe(true)
    await expect(
      keyManagement.resolveApiTokenKey(request, tokenKeyReference),
    ).resolves.toBe("sk-resolved")
    await expect(keyManagement.deleteApiToken(request, token.id)).resolves.toBe(
      true,
    )
    await expect(keyManagement.fetchUserGroups(request)).resolves.toEqual({
      default: { desc: "", ratio: 1 },
    })
    await expect(
      keyManagement.fetchAccountAvailableModels(request),
    ).resolves.toEqual(["gpt-4o"])

    expect(mockFetchApiData).toHaveBeenNthCalledWith(1, request, {
      endpoint: "/api/token/?p=0&size=100",
    })
    expect(mockFetchApiData).toHaveBeenNthCalledWith(2, request, {
      endpoint: "/api/token/?p=1&size=100",
    })
    expect(mockResolveApiTokenKey).toHaveBeenCalledWith(
      request,
      tokenKeyReference,
    )
  })
})
