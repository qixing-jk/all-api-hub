import { beforeEach, describe, expect, it, vi } from "vitest"

import { toManagedSiteApiServiceRequest } from "~/services/apiAdapters/managedSites/request"
import {
  createChannel,
  deleteChannel,
  fetchChannel,
  fetchChannelModels,
  fetchDraftChannelModels,
  listAllChannels,
  manageChannelKey,
  searchChannel,
  updateChannelFields,
  updateChannelStatus,
} from "~/services/apiService/newApiFamily/channelManagement"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"

const { mockFetchApi, mockFetchApiData, mockLoggerError } = vi.hoisted(() => ({
  mockFetchApi: vi.fn(),
  mockFetchApiData: vi.fn(),
  mockLoggerError: vi.fn(),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: mockLoggerError,
    info: vi.fn(),
    warn: vi.fn(),
  }),
}))

vi.mock("~/constants/ui", () => ({
  UI_CONSTANTS: {},
}))

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: {
    data: mockFetchApiData,
    envelope: mockFetchApi,
  },
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
  it.each(["delete_key", "enable_key", "disable_key"] as const)(
    "sends native indexed action %s and preserves the response",
    async (action) => {
      const response = { success: false, message: "rejected" }
      mockFetchApi.mockResolvedValueOnce(response)
      await expect(manageChannelKey(baseRequest, 17, action, 2)).resolves.toBe(
        response,
      )
      expect(mockFetchApi).toHaveBeenCalledWith(baseRequest, {
        endpoint: "/api/channel/multi_key/manage",
        options: {
          method: "POST",
          body: JSON.stringify({ channel_id: 17, action, key_index: 2 }),
        },
      })
    },
  )
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

  it("fetchChannel reads one channel through the upstream detail endpoint", async () => {
    const signal = new AbortController().signal
    const channel = { id: 17, name: "Example Channel" }
    mockFetchApiData.mockResolvedValueOnce(channel)

    await expect(fetchChannel(baseRequest, 17, { signal })).resolves.toBe(
      channel,
    )
    expect(mockFetchApiData).toHaveBeenCalledWith(baseRequest, {
      endpoint: "/api/channel/17",
      options: { signal },
    })
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

  it("managed-site request conversion retains a local lifecycle observer", () => {
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    }

    expect(
      toManagedSiteApiServiceRequest(
        {
          baseUrl: "https://example.invalid",
          adminToken: "admin-token",
          userId: "7",
        },
        { observer },
      ),
    ).toMatchObject({ observer })
  })

  it("mutation wrappers preserve ApiError details as cause without logging it", async () => {
    const operations = [
      {
        invoke: () =>
          createChannel(baseRequest, {
            channel: { groups: ["default"] },
          } as any),
        message: "创建渠道失败，请检查网络或 New API 配置。",
      },
      {
        invoke: () => deleteChannel(baseRequest, 1),
        message: "删除渠道失败，请检查网络或 New API 配置。",
      },
    ]

    for (const operation of operations) {
      mockFetchApi.mockReset()
      mockLoggerError.mockClear()
      const cause = new ApiError(
        "upstream denied",
        503,
        "/api/channel/",
        API_ERROR_CODES.HTTP_OTHER,
      )
      mockFetchApi.mockRejectedValueOnce(cause)

      const error = await operation.invoke().catch((caught) => caught)

      expect(error).toMatchObject({
        message: operation.message,
        statusCode: 503,
        endpoint: "/api/channel/",
        code: API_ERROR_CODES.HTTP_OTHER,
        cause,
      })
      expect(mockLoggerError).toHaveBeenCalledWith(expect.any(String))
      expect(mockLoggerError.mock.calls.flat()).not.toContain(cause)
    }
  })

  it("deleteChannel wraps transport failures with user-facing messages", async () => {
    mockFetchApi
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error("delete failed"))

    await expect(deleteChannel(baseRequest, 1)).resolves.toEqual({
      success: true,
    })
    await expect(deleteChannel(baseRequest, 1)).rejects.toThrow(
      "删除渠道失败，请检查网络或 New API 配置。",
    )
  })

  it("updateChannelFields serializes groups into the New API group field", async () => {
    mockFetchApi.mockResolvedValueOnce({ success: true })

    await updateChannelFields(baseRequest, {
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

  it("updateChannelFields omits an empty key so New API preserves the existing secret", async () => {
    mockFetchApi.mockResolvedValueOnce({ success: true })

    await updateChannelFields(baseRequest, {
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

  it.each([1, 2])(
    "updateChannelStatus sends manual status %i to the status endpoint",
    async (status) => {
      mockFetchApi.mockResolvedValueOnce({ success: true, data: true })

      await expect(
        updateChannelStatus(baseRequest, 1, status),
      ).resolves.toEqual({
        success: true,
        data: true,
      })
      expect(mockFetchApi).toHaveBeenCalledExactlyOnceWith(baseRequest, {
        endpoint: "/api/channel/1/status",
        options: {
          method: "POST",
          body: JSON.stringify({ status }),
        },
      })
    },
  )

  it.each([1, 2, 3] as const)(
    "updateChannelFields omits status %i from the field update",
    async (status) => {
      mockFetchApi.mockResolvedValueOnce({ success: true })

      await updateChannelFields(baseRequest, {
        id: 1,
        name: "Updated",
        status,
      })

      const updateBody = JSON.parse(mockFetchApi.mock.calls[0][1].options.body)
      expect(updateBody).toMatchObject({ id: 1, name: "Updated" })
      expect(updateBody.status).toBeUndefined()
      expect(mockFetchApi).toHaveBeenCalledTimes(1)
    },
  )

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
    )
    expect(mockFetchApi).toHaveBeenNthCalledWith(
      2,
      request,
      expect.objectContaining({
        endpoint: expect.stringContaining("/api/channel/?"),
      }),
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

    expect(mockFetchApi).toHaveBeenCalledWith(request, {
      endpoint: "/api/channel/fetch_models/123",
    })
    expect(result).toEqual(["gpt-4"])
  })

  it("fetchDraftChannelModels probes an unsaved channel configuration", async () => {
    const signal = new AbortController().signal
    mockFetchApi.mockResolvedValueOnce({
      success: true,
      data: ["model-example-a", "model-example-b"],
    })

    await expect(
      fetchDraftChannelModels(
        baseRequest,
        {
          type: 1,
          baseUrl: "https://upstream.example.invalid",
          key: "credential-placeholder",
        },
        { signal },
      ),
    ).resolves.toEqual(["model-example-a", "model-example-b"])
    expect(mockFetchApi).toHaveBeenCalledWith(baseRequest, {
      endpoint: "/api/channel/fetch_models",
      options: {
        method: "POST",
        body: JSON.stringify({
          type: 1,
          base_url: "https://upstream.example.invalid",
          key: "credential-placeholder",
        }),
        signal,
      },
    })
  })

  it("preserves New API model lookup messages from provider failure envelopes", async () => {
    mockFetchApi
      .mockResolvedValueOnce({
        success: false,
        message: "The example upstream rejected the saved-channel lookup",
      })
      .mockResolvedValueOnce({
        success: false,
        message: "The example upstream rejected the draft lookup",
      })

    await expect(fetchChannelModels(baseRequest, 17)).rejects.toMatchObject({
      message: "The example upstream rejected the saved-channel lookup",
    })
    await expect(
      fetchDraftChannelModels(baseRequest, {
        type: 1,
        baseUrl: "https://upstream.example.invalid",
        key: "credential-placeholder",
      }),
    ).rejects.toMatchObject({
      message: "The example upstream rejected the draft lookup",
    })
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
})
