import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createChannel,
  listAllChannels,
  searchChannel,
  updateChannel,
} from "~/services/apiService/veloera"
import { AuthTypeEnum } from "~/types"

const { mockFetchApiData } = vi.hoisted(() => ({
  mockFetchApiData: vi.fn(),
}))

const { mockFetchApi } = vi.hoisted(() => ({
  mockFetchApi: vi.fn(),
}))

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApiData: mockFetchApiData,
  fetchApi: mockFetchApi,
  aggregateUsageData: vi.fn(),
  extractAmount: vi.fn(),
  getTodayTimestampRange: vi.fn(),
}))

/**
 * Veloera channel API adapters.
 *
 * These tests ensure Veloera responses are normalized to match the New API
 * `ManagedSiteChannelListData` structure.
 */
describe("apiService veloera channel APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("listAllChannels should paginate from p=0 and return New API compatible structure", async () => {
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

    mockFetchApiData
      .mockResolvedValueOnce([
        { id: 1, type: 1, name: "c1" },
        { id: 2, type: 2, name: "c2" },
      ])
      .mockResolvedValueOnce([{ id: 3, type: 1, name: "c3" }])

    const result = await listAllChannels(request as any, {
      pageSize: 2,
    })

    expect(mockFetchApiData).toHaveBeenCalledTimes(2)

    const firstCallEndpoint = mockFetchApiData.mock.calls[0][1]
      .endpoint as string
    const secondCallEndpoint = mockFetchApiData.mock.calls[1][1]
      .endpoint as string

    expect(firstCallEndpoint).toContain("/api/channel/?")
    expect(firstCallEndpoint).toContain("p=0")
    expect(firstCallEndpoint).toContain("page_size=2")

    expect(secondCallEndpoint).toContain("/api/channel/?")
    expect(secondCallEndpoint).toContain("p=1")
    expect(secondCallEndpoint).toContain("page_size=2")

    expect(result.items).toHaveLength(3)
    expect(result.total).toBe(3)
    expect(result.type_counts).toEqual({ "1": 2, "2": 1 })
  })

  it("searchChannel should call search endpoint and normalize array payload", async () => {
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

    mockFetchApiData.mockResolvedValueOnce([
      { id: 1, type: 1, name: "c1" },
      { id: 2, type: 2, name: "c2" },
    ])

    const result = await searchChannel(request as any, "k")

    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
    const callRequest = mockFetchApiData.mock.calls[0][0]
    const callOptions = mockFetchApiData.mock.calls[0][1]
    expect(callRequest.baseUrl).toBe(baseUrl)
    expect(callRequest.auth.userId).toBe(userId)
    expect(callRequest.auth.accessToken).toBe(token)
    expect(callOptions.endpoint).toContain("/api/channel/search")
    expect(callOptions.endpoint).toContain("keyword=")

    expect(result).not.toBeNull()
    expect(result!.items).toHaveLength(2)
    expect(result!.total).toBe(2)
    expect(result!.type_counts).toEqual({ "1": 1, "2": 1 })
  })

  it("createChannel should post flat payload with group string", async () => {
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

    mockFetchApi.mockResolvedValueOnce({ success: true, message: "ok" })

    await createChannel(request as any, {
      mode: "none" as any,
      channel: {
        name: "n",
        type: 1 as any,
        key: "k",
        base_url: "https://upstream.example.com",
        models: "gpt-4",
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1 as any,
      },
    })

    expect(mockFetchApi).toHaveBeenCalledTimes(1)
    const callRequest = mockFetchApi.mock.calls[0][0]
    const callOptions = mockFetchApi.mock.calls[0][1]
    expect(callRequest.baseUrl).toBe(baseUrl)
    expect(callOptions.endpoint).toBe("/api/channel")
    expect(callRequest.auth.accessToken).toBe(token)
    expect(callRequest.auth.userId).toBe(userId)
    expect(callOptions.options?.method).toBe("POST")

    const body = JSON.parse(callOptions.options?.body as string)
    expect(body).toMatchObject({
      name: "n",
      type: 1,
      key: "k",
      base_url: "https://upstream.example.com",
      models: "gpt-4",
      priority: 0,
      weight: 0,
      status: 1,
      group: "default",
    })
    expect(body.groups).toBeUndefined()
  })

  it("updateChannel should put flat payload with group string", async () => {
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

    mockFetchApi.mockResolvedValueOnce({ success: true, message: "ok" })

    await updateChannel(request as any, {
      id: 1,
      name: "Updated Channel",
      key: "k",
      base_url: "https://upstream.example.com",
      models: "gpt-4",
      groups: ["default"],
      priority: 0,
    })

    expect(mockFetchApi).toHaveBeenCalledTimes(1)
    const callRequest = mockFetchApi.mock.calls[0][0]
    const callOptions = mockFetchApi.mock.calls[0][1]
    expect(callRequest.baseUrl).toBe(baseUrl)
    expect(callOptions.endpoint).toBe("/api/channel")
    expect(callRequest.auth.accessToken).toBe(token)
    expect(callRequest.auth.userId).toBe(userId)
    expect(callOptions.options?.method).toBe("PUT")

    const body = JSON.parse(callOptions.options?.body as string)
    expect(body).toMatchObject({
      id: 1,
      name: "Updated Channel",
      key: "k",
      base_url: "https://upstream.example.com",
      models: "gpt-4",
      priority: 0,
      group: "default",
    })
    expect(body.groups).toBeUndefined()
  })
})
