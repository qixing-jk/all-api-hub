import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createChannel,
  fetchChannelModels,
  fetchSiteUserGroups,
  listAllChannels,
  searchChannel,
  updateChannel,
  updateChannelModelMapping,
  updateChannelModels,
} from "~/services/apiService/doneHub"
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

describe("apiService doneHub channel APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("listAllChannels should paginate with page/size and normalize DataResult payload", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: 1,
      },
    }

    mockFetchApiData
      .mockResolvedValueOnce({
        data: [
          { id: 1, type: 1, name: "c1", group: "default", models: "gpt-4" },
          { id: 2, type: 2, name: "c2", group: "default", models: "gpt-4" },
        ],
        page: 1,
        size: 2,
        total_count: 3,
      })
      .mockResolvedValueOnce({
        data: [
          { id: 3, type: 1, name: "c3", group: "default", models: "gpt-4" },
        ],
        page: 2,
        size: 2,
        total_count: 3,
      })

    const result = await listAllChannels(request as any, { pageSize: 2 })

    expect(mockFetchApiData).toHaveBeenCalledTimes(2)

    const firstEndpoint = mockFetchApiData.mock.calls[0][1].endpoint as string
    const secondEndpoint = mockFetchApiData.mock.calls[1][1].endpoint as string

    expect(firstEndpoint).toContain("/api/channel/?")
    expect(firstEndpoint).toContain("page=1")
    expect(firstEndpoint).toContain("size=2")

    expect(secondEndpoint).toContain("/api/channel/?")
    expect(secondEndpoint).toContain("page=2")
    expect(secondEndpoint).toContain("size=2")

    expect(result.items).toHaveLength(3)
    expect(result.total).toBe(3)
    expect(result.type_counts).toEqual({ "1": 2, "2": 1 })
  })

  it("searchChannel should call list endpoint with base_url filter", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: 1,
      },
    }

    mockFetchApiData.mockResolvedValueOnce({
      data: [
        { id: 1, type: 1, name: "c1", base_url: "https://up.example.com" },
      ],
      page: 1,
      size: 100,
      total_count: 1,
    })

    const result = await searchChannel(request as any, "https://up.example.com")

    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
    const endpoint = mockFetchApiData.mock.calls[0][1].endpoint as string
    expect(endpoint).toContain("/api/channel/?")
    expect(endpoint).toContain("base_url=")
    expect(endpoint).toContain("page=1")
    expect(endpoint).toContain("size=100")

    expect(result).not.toBeNull()
    expect(result!.items).toHaveLength(1)
    expect(result!.total).toBe(1)
  })

  it("searchChannel should coerce missing channel type to 0", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: 1,
      },
    }

    mockFetchApiData.mockResolvedValueOnce({
      data: [{ id: 1, name: "c1", base_url: "https://up.example.com" }],
      page: 1,
      size: 100,
      total_count: 1,
    })

    const result = await searchChannel(request as any, "https://up.example.com")

    expect(result).not.toBeNull()
    expect(result!.items[0].type).toBe(0)
    expect(result!.type_counts).toEqual({ "0": 1 })
  })

  it("createChannel should post flat payload with group string", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: 1,
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
    const callOptions = mockFetchApi.mock.calls[0][1]
    expect(callOptions.endpoint).toBe("/api/channel/")
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
    expect(body.mode).toBeUndefined()
  })

  it("updateChannel should put flat payload with group string", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: 1,
      },
    }

    mockFetchApi.mockResolvedValueOnce({ success: true, message: "ok" })

    await updateChannel(request as any, {
      id: 1,
      name: "Updated Channel",
      models: "gpt-4",
      groups: ["default"],
    })

    expect(mockFetchApi).toHaveBeenCalledTimes(1)
    const callOptions = mockFetchApi.mock.calls[0][1]
    expect(callOptions.endpoint).toBe("/api/channel/")
    expect(callOptions.options?.method).toBe("PUT")

    const body = JSON.parse(callOptions.options?.body as string)
    expect(body).toMatchObject({
      id: 1,
      name: "Updated Channel",
      models: "gpt-4",
      group: "default",
    })
    expect(body.groups).toBeUndefined()
  })

  it("fetchChannelModels should call provider_models_list using full channel payload", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: 1,
      },
    }

    mockFetchApiData
      .mockResolvedValueOnce({
        id: 123,
        type: 1,
        key: "k",
        base_url: "https://up.example.com",
        models: "gpt-4",
        group: "default",
      })
      .mockResolvedValueOnce(["gpt-4", "gpt-3.5-turbo"])

    const result = await fetchChannelModels(request as any, 123)

    expect(mockFetchApiData).toHaveBeenCalledTimes(2)

    const channelEndpoint = mockFetchApiData.mock.calls[0][1].endpoint as string
    expect(channelEndpoint).toBe("/api/channel/123")

    const providerEndpoint = mockFetchApiData.mock.calls[1][1]
      .endpoint as string
    expect(providerEndpoint).toBe("/api/channel/provider_models_list")
    expect(mockFetchApiData.mock.calls[1][1].options?.method).toBe("POST")

    const body = JSON.parse(
      mockFetchApiData.mock.calls[1][1].options?.body as string,
    )
    expect(body).toMatchObject({
      id: 123,
      type: 1,
      key: "k",
      base_url: "https://up.example.com",
      models: "",
      model_mapping: "",
      model_headers: "",
    })

    expect(result).toEqual(["gpt-4", "gpt-3.5-turbo"])
  })

  it("updateChannelModels should fetch full channel and PUT complete payload", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: 1,
      },
    }

    mockFetchApiData.mockResolvedValueOnce({
      id: 1,
      type: 1,
      key: "secret",
      name: "c1",
      base_url: "https://up.example.com",
      models: "old-model",
      group: "default",
      proxy: "http://proxy",
      model_mapping: '{"gpt-4":"OpenAI/gpt-4"}',
    })
    mockFetchApi.mockResolvedValueOnce({ success: true, message: "ok" })

    await updateChannelModels(request as any, 1, "gpt-4,gpt-4o")

    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
    expect(mockFetchApiData.mock.calls[0][1].endpoint).toBe("/api/channel/1")

    expect(mockFetchApi).toHaveBeenCalledTimes(1)
    const callOptions = mockFetchApi.mock.calls[0][1]
    expect(callOptions.endpoint).toBe("/api/channel/")
    expect(callOptions.options?.method).toBe("PUT")

    const body = JSON.parse(callOptions.options?.body as string)
    expect(body).toMatchObject({
      id: 1,
      type: 1,
      key: "secret",
      name: "c1",
      base_url: "https://up.example.com",
      models: "gpt-4,gpt-4o",
      group: "default",
      proxy: "http://proxy",
      model_mapping: '{"gpt-4":"OpenAI/gpt-4"}',
    })
  })

  it("updateChannelModelMapping should fetch full channel and PUT complete payload", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: 1,
      },
    }

    mockFetchApiData.mockResolvedValueOnce({
      id: 2,
      type: 8,
      key: "secret-2",
      name: "c2",
      base_url: "https://up.example.com",
      models: "old-model",
      group: "default",
      model_mapping: "",
      model_headers: "",
      custom_parameter: "{}",
    })
    mockFetchApi.mockResolvedValueOnce({ success: true, message: "ok" })

    await updateChannelModelMapping(
      request as any,
      2,
      "gpt-4",
      '{"gpt-4":"OpenAI/gpt-4"}',
    )

    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
    expect(mockFetchApiData.mock.calls[0][1].endpoint).toBe("/api/channel/2")

    expect(mockFetchApi).toHaveBeenCalledTimes(1)
    const callOptions = mockFetchApi.mock.calls[0][1]
    expect(callOptions.endpoint).toBe("/api/channel/")
    expect(callOptions.options?.method).toBe("PUT")

    const body = JSON.parse(callOptions.options?.body as string)
    expect(body).toMatchObject({
      id: 2,
      type: 8,
      key: "secret-2",
      name: "c2",
      base_url: "https://up.example.com",
      models: "gpt-4",
      group: "default",
      model_mapping: '{"gpt-4":"OpenAI/gpt-4"}',
      model_headers: "",
      custom_parameter: "{}",
    })
  })

  it("fetchSiteUserGroups should paginate /api/group/ and return symbols", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: 1,
      },
    }

    const firstPageGroups = Array.from({ length: 100 }, (_, index) => ({
      symbol: index === 0 ? "default" : `group-${index}`,
    }))

    mockFetchApiData
      .mockResolvedValueOnce({
        data: firstPageGroups,
        page: 1,
        size: 100,
        total_count: 101,
      })
      .mockResolvedValueOnce({
        data: [{ symbol: "vip" }],
        page: 2,
        size: 100,
        total_count: 101,
      })

    const result = await fetchSiteUserGroups(request as any)

    expect(mockFetchApiData).toHaveBeenCalledTimes(2)

    const firstEndpoint = mockFetchApiData.mock.calls[0][1].endpoint as string
    const secondEndpoint = mockFetchApiData.mock.calls[1][1].endpoint as string

    expect(firstEndpoint).toContain("/api/group/?")
    expect(firstEndpoint).toContain("page=1")
    expect(firstEndpoint).toContain("size=100")

    expect(secondEndpoint).toContain("/api/group/?")
    expect(secondEndpoint).toContain("page=2")
    expect(secondEndpoint).toContain("size=100")

    expect(result).toHaveLength(101)
    expect(result[0]).toBe("default")
    expect(result).toContain("vip")
  })
})
