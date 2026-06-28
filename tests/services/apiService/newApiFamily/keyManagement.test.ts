import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createApiToken,
  defaultKeyManagementImplementation,
  deleteApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchSiteUserGroups,
  fetchTokenById,
  fetchUserGroups,
  updateApiToken,
} from "~/services/apiService/newApiFamily/default/keyManagement"
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

vi.mock("~/services/apiService/common/tokenKeyResolver", () => ({
  invalidateResolvedApiTokenKeyCache: mockInvalidateResolvedApiTokenKeyCache,
  resolveApiTokenKey: mockResolveApiTokenKey,
  syncResolvedApiTokenKeyCache: mockSyncResolvedApiTokenKeyCache,
}))

vi.mock("~/services/apiService/common/utils", () => ({
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

  it("fetchAccountTokens normalizes array and paginated responses", async () => {
    mockFetchApiData
      .mockResolvedValueOnce([
        { id: 1, key: " plain-key " },
        { id: 2, key: "sk-already" },
      ])
      .mockResolvedValueOnce({
        items: [{ id: 3, key: "  sk-trim  " }],
        page: 2,
        page_size: 10,
        total: 21,
      })

    const arrayResult = await fetchAccountTokens(request)
    const pageResult = await fetchAccountTokens(request, 2, 10)

    expect(arrayResult.map((item) => item.key)).toEqual([
      "plain-key",
      "sk-already",
    ])
    expect(pageResult.map((item) => item.key)).toEqual(["sk-trim"])
    expect(mockFetchApiData).toHaveBeenNthCalledWith(1, request, {
      endpoint: "/api/token/?p=0&size=100",
    })
    expect(mockFetchApiData).toHaveBeenNthCalledWith(2, request, {
      endpoint: "/api/token/?p=2&size=10",
    })
    expect(mockSyncResolvedApiTokenKeyCache).toHaveBeenNthCalledWith(
      1,
      request,
      arrayResult,
    )
    expect(mockSyncResolvedApiTokenKeyCache).toHaveBeenCalledTimes(1)
  })

  it("fetchAccountTokens syncs cache for a complete first paginated inventory", async () => {
    mockFetchApiData.mockResolvedValueOnce({
      items: [{ id: 3, key: "  sk-trim  " }],
      page: 0,
      page_size: 100,
      total: 1,
    })

    const result = await fetchAccountTokens(request)

    expect(result.map((item) => item.key)).toEqual(["sk-trim"])
    expect(mockSyncResolvedApiTokenKeyCache).toHaveBeenCalledWith(
      request,
      result,
    )
  })

  it("fetchAccountTokens returns an empty list for unexpected payloads", async () => {
    mockFetchApiData.mockResolvedValueOnce({ something: "else" })

    await expect(fetchAccountTokens(request)).resolves.toEqual([])
    expect(mockSyncResolvedApiTokenKeyCache).not.toHaveBeenCalled()
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
    })
    await expect(deleteApiToken(request, 9)).resolves.toBe(true)
    await expect(deleteApiToken(request, 9)).rejects.toMatchObject({
      message: "delete failed",
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
    })
    await expect(createApiToken(request, tokenData)).rejects.toBe(
      transportError,
    )
  })

  it("uses New API-family helpers by default", async () => {
    const keyManagement = defaultKeyManagementImplementation

    mockFetchApiData
      .mockResolvedValueOnce([token])
      .mockResolvedValueOnce({ default: { desc: "", ratio: 1 } })
      .mockResolvedValueOnce(["gpt-4o"])
    mockFetchApi
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
    mockResolveApiTokenKey.mockResolvedValue("sk-resolved")

    await expect(
      keyManagement.fetchAccountTokens(request, 2, 25),
    ).resolves.toEqual([token])
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
      endpoint: "/api/token/?p=2&size=25",
    })
    expect(mockResolveApiTokenKey).toHaveBeenCalledWith(
      request,
      tokenKeyReference,
    )
  })
})
