import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchChannelModels,
  listAllChannels,
} from "~/services/apiService/common"
import { AuthTypeEnum } from "~/types"

const { mockFetchApi } = vi.hoisted(() => ({
  mockFetchApi: vi.fn(),
}))

vi.mock("~/constants/ui", () => ({
  UI_CONSTANTS: {},
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {},
}))

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: mockFetchApi,
  fetchApiData: vi.fn(),
  aggregateUsageData: vi.fn(),
  extractAmount: vi.fn(),
  getTodayTimestampRange: vi.fn(),
}))

describe("apiService common channel APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
