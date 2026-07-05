import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createChannel,
  deleteChannel,
  fetchChannelModels,
  listAllChannels,
  searchChannel,
  updateChannel,
  updateChannelModelMapping,
  updateChannelModels,
} from "~/services/apiService/newApiFamily/channelManagement"
import { ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"

const { mockFetchApi, mockFetchApiData } = vi.hoisted(() => ({
  mockFetchApi: vi.fn(),
  mockFetchApiData: vi.fn(),
}))

vi.mock("~/constants/ui", () => ({
  UI_CONSTANTS: {},
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {},
}))

vi.mock("~/services/apiTransport/request", () => ({
  fetchApi: mockFetchApi,
  fetchApiData: mockFetchApiData,
}))

const baseRequest = {
  baseUrl: "https://example.com",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "token",
    userId: "7",
  },
}

describe("newApiFamily channel management APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("searchChannel returns data on success and null on failure", async () => {
    mockFetchApiData
      .mockResolvedValueOnce({ items: [{ id: 1 }], total: 1 })
      .mockRejectedValueOnce(new ApiError("denied", 403))

    await expect(searchChannel(baseRequest, "gpt-4")).resolves.toEqual({
      items: [{ id: 1 }],
      total: 1,
    })
    await expect(searchChannel(baseRequest, "gpt-4")).resolves.toBeNull()
  })

  it("createChannel serializes groups", async () => {
    mockFetchApi.mockResolvedValueOnce({ success: true })

    await expect(
      createChannel(baseRequest, {
        name: "My Channel",
        channel: {
          name: "inner",
          groups: ["default", "vip"],
        },
      } as any),
    ).resolves.toEqual({ success: true })

    expect(mockFetchApi).toHaveBeenNthCalledWith(
      1,
      baseRequest,
      expect.objectContaining({
        endpoint: "/api/channel/",
        options: {
          method: "POST",
          body: JSON.stringify({
            name: "My Channel",
            channel: {
              name: "inner",
              group: "default,vip",
            },
          }),
        },
      }),
    )
  })

  it("createChannel wraps transport failures", async () => {
    mockFetchApi.mockRejectedValueOnce(new Error("network"))

    await expect(
      createChannel(baseRequest, {
        channel: { groups: ["default"] },
      } as any),
    ).rejects.toThrow("创建渠道失败，请检查网络或 New API 配置。")
  })

  it("updateChannel and deleteChannel wrap transport failures with user-facing messages", async () => {
    mockFetchApi
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error("update failed"))
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error("delete failed"))

    await expect(
      updateChannel(baseRequest, { id: 1, name: "Updated" } as any),
    ).resolves.toEqual({ success: true })
    await expect(
      updateChannel(baseRequest, { id: 1, name: "Updated" } as any),
    ).rejects.toThrow("更新渠道失败，请检查网络或 New API 配置。")

    await expect(deleteChannel(baseRequest, 1)).resolves.toEqual({
      success: true,
    })
    await expect(deleteChannel(baseRequest, 1)).rejects.toThrow(
      "删除渠道失败，请检查网络或 New API 配置。",
    )
  })

  it("updateChannel serializes groups into the New API group field", async () => {
    mockFetchApi.mockResolvedValueOnce({ success: true })

    await updateChannel(baseRequest, {
      id: 1,
      name: "Updated",
      groups: ["default", "vip"],
    } as any)

    const body = JSON.parse(mockFetchApi.mock.calls[0][1].options.body)
    expect(body).toMatchObject({
      id: 1,
      name: "Updated",
      group: "default,vip",
    })
    expect(body.groups).toBeUndefined()
  })

  it("updateChannel omits an empty key so New API preserves the existing secret", async () => {
    mockFetchApi.mockResolvedValueOnce({ success: true })

    await updateChannel(baseRequest, {
      id: 1,
      name: "Updated",
      key: "",
      base_url: "https://upstream.example.invalid/v1",
      groups: ["default"],
    } as any)

    const body = JSON.parse(mockFetchApi.mock.calls[0][1].options.body)
    expect(body).toMatchObject({
      id: 1,
      name: "Updated",
      base_url: "https://upstream.example.invalid/v1",
      group: "default",
    })
    expect(body.key).toBeUndefined()
    expect(body.groups).toBeUndefined()
  })

  it("listAllChannels should paginate and aggregate type_counts", async () => {
    const baseUrl = "https://example.com"
    const token = "token"
    const userId = 1
    const beforeRequest = vi.fn().mockResolvedValue(undefined)
    const request = {
      baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: token,
        userId,
      },
    }

    mockFetchApi
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [{ id: 1 }, { id: 2 }],
          total: 3,
          type_counts: { "1": 2 },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [{ id: 3 }],
          total: 3,
          type_counts: { "1": 1 },
        },
      })

    const result = await listAllChannels(request as any, {
      pageSize: 2,
      beforeRequest,
    })

    expect(beforeRequest).toHaveBeenCalledTimes(2)
    expect(mockFetchApi).toHaveBeenCalledTimes(2)

    expect(mockFetchApi).toHaveBeenNthCalledWith(
      1,
      request,
      expect.objectContaining({
        endpoint: expect.stringContaining("/api/channel/?"),
      }),
      false,
    )
    expect(mockFetchApi).toHaveBeenNthCalledWith(
      2,
      request,
      expect.objectContaining({
        endpoint: expect.stringContaining("/api/channel/?"),
      }),
      false,
    )

    const firstEndpoint = mockFetchApi.mock.calls[0][1].endpoint as string
    const secondEndpoint = mockFetchApi.mock.calls[1][1].endpoint as string
    expect(firstEndpoint).toContain("p=1")
    expect(firstEndpoint).toContain("page_size=2")
    expect(secondEndpoint).toContain("p=2")
    expect(secondEndpoint).toContain("page_size=2")

    expect(result.total).toBe(3)
    expect(result.items).toHaveLength(3)
    expect(result.type_counts).toEqual({ "1": 3 })
  })

  it("listAllChannels rejects invalid upstream page envelopes", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: "1",
      },
    }

    mockFetchApi.mockResolvedValueOnce({
      success: false,
      message: "channel list unavailable",
    })

    await expect(listAllChannels(request as any)).rejects.toMatchObject({
      message: "channel list unavailable",
    })
  })

  it("fetchChannelModels should call correct endpoint and return data", async () => {
    const baseUrl = "https://example.com"
    const token = "token"
    const userId = 1
    const request = {
      baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: token,
        userId,
      },
    }

    mockFetchApi.mockResolvedValueOnce({
      success: true,
      data: ["gpt-4"],
    })

    const result = await fetchChannelModels(request as any, 123)

    expect(mockFetchApi).toHaveBeenCalledWith(
      request,
      { endpoint: "/api/channel/fetch_models/123" },
      false,
    )
    expect(result).toEqual(["gpt-4"])
  })

  it("fetchChannelModels rejects malformed model payloads", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: "1",
      },
    }

    mockFetchApi.mockResolvedValueOnce({
      success: true,
      data: { models: ["gpt-4"] },
      message: "malformed payload",
    })

    await expect(fetchChannelModels(request as any, 123)).rejects.toMatchObject(
      {
        message: "malformed payload",
      },
    )
  })

  it("updateChannelModels and updateChannelModelMapping validate response envelopes", async () => {
    mockFetchApi
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, message: "bad models" })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, message: "bad mapping" })

    await expect(
      updateChannelModels(baseRequest, 1, "gpt-4,gpt-4o"),
    ).resolves.toBeUndefined()
    await expect(
      updateChannelModels(baseRequest, 1, "gpt-4,gpt-4o"),
    ).rejects.toMatchObject({ message: "bad models" })

    await expect(
      updateChannelModelMapping(baseRequest, 1, "gpt-4", '{"gpt-4":"gpt-4o"}'),
    ).resolves.toBeUndefined()
    await expect(
      updateChannelModelMapping(baseRequest, 1, "gpt-4", '{"gpt-4":"gpt-4o"}'),
    ).rejects.toMatchObject({ message: "bad mapping" })
  })
})
