import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createChannel,
  deleteChannel,
  fetchChannelModels,
  fetchSiteUserGroups,
  fetchTodayIncome,
  fetchTodayUsage,
  listAllChannels,
  refreshAccountData,
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

const {
  mockDetermineHealthStatus,
  mockFetchAccountQuota,
  mockFetchCheckInStatus,
  mockFetchTodayIncome,
  mockFetchTodayUsage,
} = vi.hoisted(() => ({
  mockDetermineHealthStatus: vi.fn(() => ({
    status: "unknown",
    message: "unknown",
  })),
  mockFetchAccountQuota: vi.fn(),
  mockFetchCheckInStatus: vi.fn(),
  mockFetchTodayIncome: vi.fn(),
  mockFetchTodayUsage: vi.fn(),
}))

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApiData: mockFetchApiData,
  fetchApi: mockFetchApi,
  aggregateUsageData: vi.fn((items: any[]) => ({
    today_quota_consumption: items.reduce(
      (sum, item) => sum + (item.quota ?? 0),
      0,
    ),
    today_prompt_tokens: items.reduce(
      (sum, item) => sum + (item.prompt_tokens ?? 0),
      0,
    ),
    today_completion_tokens: items.reduce(
      (sum, item) => sum + (item.completion_tokens ?? 0),
      0,
    ),
  })),
  extractAmount: vi.fn(),
  getTodayTimestampRange: vi.fn(() => ({
    start: 111,
    end: 222,
  })),
}))

vi.mock("~/services/apiService/common", () => ({
  determineHealthStatus: mockDetermineHealthStatus,
  fetchAccountQuota: mockFetchAccountQuota,
  fetchCheckInStatus: mockFetchCheckInStatus,
  fetchTodayIncome: mockFetchTodayIncome,
  fetchTodayUsage: mockFetchTodayUsage,
}))

vi.mock("~/utils/i18n/core", () => ({
  t: vi.fn((key: string) => key),
}))

describe("apiService doneHub channel APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchApiData.mockReset()
    mockFetchApi.mockReset()
    mockDetermineHealthStatus.mockReset()
    mockFetchAccountQuota.mockReset()
    mockFetchCheckInStatus.mockReset()
    mockFetchTodayIncome.mockReset()
    mockFetchTodayUsage.mockReset()

    mockDetermineHealthStatus.mockReturnValue({
      status: "unknown",
      message: "unknown",
    })
    mockFetchAccountQuota.mockResolvedValue(500)
    mockFetchTodayIncome.mockResolvedValue({ today_income: 0 })
    mockFetchTodayUsage.mockResolvedValue({
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
    })
    mockFetchCheckInStatus.mockResolvedValue(undefined)
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

  it("searchChannel should return null when the backend does not return a channel array", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: 1,
      },
    }

    mockFetchApiData.mockResolvedValueOnce({
      data: null,
      total_count: 0,
    })

    await expect(
      searchChannel(request as any, "https://up.example.com"),
    ).resolves.toBeNull()
  })

  it("searchChannel should normalize string fields and preserve explicit channel info", async () => {
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
        {
          id: "42",
          type: "7",
          status: "2",
          weight: "3",
          priority: "4",
          balance: "12.5",
          used_quota: "bad-number",
          auto_ban: "1",
          channel_info: {
            is_multi_key: 1,
            multi_key_size: "2",
            multi_key_status_list: ["ready"],
            multi_key_polling_index: "3",
            multi_key_mode: "round_robin",
          },
        },
      ],
      page: 1,
      size: 100,
    })

    const result = await searchChannel(request as any, "https://up.example.com")

    expect(result).not.toBeNull()
    expect(result!.total).toBe(1)
    expect(result!.type_counts).toEqual({ "7": 1 })
    expect(result!.items[0]).toMatchObject({
      id: 42,
      type: 7,
      status: 2,
      weight: 3,
      priority: 4,
      balance: 12.5,
      used_quota: 0,
      auto_ban: 1,
      channel_info: {
        is_multi_key: true,
        multi_key_size: 2,
        multi_key_status_list: ["ready"],
        multi_key_polling_index: 3,
        multi_key_mode: "round_robin",
      },
    })
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

  it("createChannel should default empty groups and model_mapping for DoneHub", async () => {
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
        groups: [],
        priority: 0,
        weight: 0,
        status: 1 as any,
      },
    })

    const body = JSON.parse(
      mockFetchApi.mock.calls[0][1].options?.body as string,
    )
    expect(body.group).toBe("")
    expect(body.model_mapping).toBe("{}")
  })

  it("createChannel should prefer an explicit group over derived groups", async () => {
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
        group: "manual",
        groups: ["default", "vip"],
        model_mapping: '{"gpt-4":"OpenAI/gpt-4"}',
        priority: 0,
        weight: 0,
        status: 1 as any,
      },
    })

    const body = JSON.parse(
      mockFetchApi.mock.calls[0][1].options?.body as string,
    )
    expect(body.group).toBe("manual")
    expect(body.model_mapping).toBe('{"gpt-4":"OpenAI/gpt-4"}')
  })

  it("createChannel should wrap request failures in a user-facing error", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: 1,
      },
    }

    mockFetchApi.mockRejectedValueOnce(new Error("request failed"))

    await expect(
      createChannel(request as any, {
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
      }),
    ).rejects.toThrow("创建渠道失败，请检查网络或 Done Hub 配置。")
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

  it("updateChannel should prefer an explicit group over derived groups", async () => {
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
      group: "manual",
      groups: ["default", "vip"],
    })

    const body = JSON.parse(
      mockFetchApi.mock.calls[0][1].options?.body as string,
    )
    expect(body.group).toBe("manual")
  })

  it("updateChannel should wrap request failures in a user-facing error", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: 1,
      },
    }

    mockFetchApi.mockRejectedValueOnce(new Error("request failed"))

    await expect(
      updateChannel(request as any, {
        id: 1,
        name: "Updated Channel",
        models: "gpt-4",
        groups: ["default"],
      }),
    ).rejects.toThrow("更新渠道失败，请检查网络或 Done Hub 配置。")
  })

  it("deleteChannel should issue a DELETE request and wrap failures", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: 1,
      },
    }

    mockFetchApi
      .mockResolvedValueOnce({ success: true, message: "ok" })
      .mockRejectedValueOnce(new Error("request failed"))

    await expect(deleteChannel(request as any, 99)).resolves.toEqual({
      success: true,
      message: "ok",
    })
    expect(mockFetchApi).toHaveBeenNthCalledWith(
      1,
      request,
      expect.objectContaining({
        endpoint: "/api/channel/99",
        options: expect.objectContaining({
          method: "DELETE",
        }),
      }),
    )

    await expect(deleteChannel(request as any, 100)).rejects.toThrow(
      "删除渠道失败，请检查网络或 Done Hub 配置。",
    )
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

  it("fetchChannelModels should trim and filter blank model names", async () => {
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
      .mockResolvedValueOnce([" gpt-4 ", "", null, "claude-3-5-sonnet"])

    await expect(fetchChannelModels(request as any, 123)).resolves.toEqual([
      "gpt-4",
      "claude-3-5-sonnet",
    ])
  })

  it("fetchChannelModels should throw when the provider payload is not an array", async () => {
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
      .mockResolvedValueOnce({ models: ["gpt-4"] })

    await expect(fetchChannelModels(request as any, 123)).rejects.toThrow(
      "Failed to fetch provider model list",
    )
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

  it("updateChannelModels should use a fallback error when DoneHub returns an empty failure message", async () => {
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
    })
    mockFetchApi.mockResolvedValueOnce({ success: false, message: "" })

    await expect(
      updateChannelModels(request as any, 1, "gpt-4,gpt-4o"),
    ).rejects.toThrow("Failed to update channel models")
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

  it("updateChannelModelMapping should surface the backend failure message", async () => {
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
    })
    mockFetchApi.mockResolvedValueOnce({
      success: false,
      message: "mapping rejected",
    })

    await expect(
      updateChannelModelMapping(
        request as any,
        2,
        "gpt-4",
        '{"gpt-4":"OpenAI/gpt-4"}',
      ),
    ).rejects.toThrow("mapping rejected")
  })

  it("updateChannelModelMapping should use a fallback error when DoneHub returns an empty failure message", async () => {
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
    })
    mockFetchApi.mockResolvedValueOnce({
      success: false,
      message: "",
    })

    await expect(
      updateChannelModelMapping(
        request as any,
        2,
        "gpt-4",
        '{"gpt-4":"OpenAI/gpt-4"}',
      ),
    ).rejects.toThrow("Failed to update channel model mapping")
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

  it("fetchSiteUserGroups should trim blank symbols and dedupe duplicates", async () => {
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
        { symbol: " default " },
        { symbol: "" },
        { symbol: "default" },
        { symbol: "vip" },
      ],
      page: 1,
      size: 100,
    })

    await expect(fetchSiteUserGroups(request as any)).resolves.toEqual([
      "default",
      "vip",
    ])
  })

  it("fetchTodayUsage should delegate to common with DoneHub log query overrides", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: 1,
      },
      checkIn: {
        enableDetection: false,
        siteStatus: {},
      },
    }

    mockFetchTodayUsage.mockResolvedValueOnce({
      today_quota_consumption: 60,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 3,
    })

    await expect(fetchTodayUsage(request as any)).resolves.toEqual({
      today_quota_consumption: 60,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 3,
    })

    expect(mockFetchTodayUsage).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        endpoint: "/api/log/self",
        pageParamName: "page",
        pageSizeParamName: "size",
        logTypeParamName: "log_type",
        itemsField: "data",
        totalField: "total_count",
        includeGroupParam: false,
      }),
    )
  })

  it("fetchTodayIncome should delegate to common with DoneHub log query overrides", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: 1,
      },
      checkIn: {
        enableDetection: false,
        siteStatus: {},
      },
    }

    mockFetchTodayIncome.mockResolvedValueOnce({ today_income: 42 })

    await expect(fetchTodayIncome(request as any)).resolves.toEqual({
      today_income: 42,
    })

    expect(mockFetchTodayIncome).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        endpoint: "/api/log/self",
        pageParamName: "page",
        pageSizeParamName: "size",
        logTypeParamName: "log_type",
        itemsField: "data",
        totalField: "total_count",
        includeGroupParam: false,
      }),
    )
  })

  it("refreshAccountData should use the DoneHub today-usage override", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: 1,
      },
      checkIn: {
        enableDetection: false,
        siteStatus: {},
      },
    }

    mockFetchTodayUsage.mockResolvedValueOnce({
      today_quota_consumption: 88,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 7,
    })

    await expect(refreshAccountData(request as any)).resolves.toMatchObject({
      success: true,
      data: {
        quota: 500,
        today_quota_consumption: 88,
        today_requests_count: 7,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_income: 0,
      },
    })
  })
})
