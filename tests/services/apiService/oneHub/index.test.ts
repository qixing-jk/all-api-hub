import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchAvailableModel,
  fetchCompleteAccountTokens,
  fetchModelPricing,
  fetchUserGroupMap,
  fetchUserGroups,
} from "~/services/apiService/oneHub"
import {
  transformModelPricing,
  transformUserGroup,
} from "~/services/apiService/oneHub/transform"
import { fetchApiData } from "~/services/apiTransport/request"

vi.mock("~/services/apiTransport/request", () => ({
  fetchApiData: vi.fn(),
}))

vi.mock("~/services/apiService/oneHub/transform", () => ({
  transformModelPricing: vi.fn(),
  transformUserGroup: vi.fn(),
}))

const mockedFetchApiData = fetchApiData as unknown as ReturnType<typeof vi.fn>
const mockedTransformModelPricing =
  transformModelPricing as unknown as ReturnType<typeof vi.fn>
const mockedTransformUserGroup = transformUserGroup as unknown as ReturnType<
  typeof vi.fn
>

const baseRequest = {
  baseUrl: "https://example.com",
  auth: {
    authType: "access_token",
    userId: "1",
    accessToken: "token",
  },
}

describe("OneHub API service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetchAvailableModel should call fetchApiData with correct endpoint", async () => {
    mockedFetchApiData.mockResolvedValueOnce({})

    await fetchAvailableModel(baseRequest as any)

    expect(mockedFetchApiData).toHaveBeenCalledWith(baseRequest, {
      endpoint: "/api/available_model",
    })
  })

  it("fetchUserGroupMap should call fetchApiData with correct endpoint", async () => {
    mockedFetchApiData.mockResolvedValueOnce({})

    await fetchUserGroupMap(baseRequest as any)

    expect(mockedFetchApiData).toHaveBeenCalledWith(baseRequest, {
      endpoint: "/api/user_group_map",
    })
  })

  it("fetchModelPricing should combine available models and user group map then transform", async () => {
    const availableModel = { model: {} }
    const userGroupMap = { group: {} }
    const transformed = {
      data: [],
      group_ratio: {},
      success: true,
      usable_group: {},
    }

    mockedFetchApiData
      .mockResolvedValueOnce(availableModel)
      .mockResolvedValueOnce(userGroupMap)
    mockedTransformModelPricing.mockReturnValueOnce(transformed)

    const result = await fetchModelPricing(baseRequest as any)

    expect(mockedFetchApiData).toHaveBeenNthCalledWith(1, baseRequest, {
      endpoint: "/api/available_model",
    })
    expect(mockedFetchApiData).toHaveBeenNthCalledWith(2, baseRequest, {
      endpoint: "/api/user_group_map",
    })
    expect(mockedTransformModelPricing).toHaveBeenCalledWith(
      availableModel,
      userGroupMap,
    )
    expect(result).toBe(transformed)
  })

  it("fetchModelPricing should rethrow errors from underlying calls", async () => {
    const error = new Error("network error")
    mockedFetchApiData.mockRejectedValueOnce(error)

    await expect(fetchModelPricing(baseRequest as any)).rejects.toThrow(
      "network error",
    )
  })

  it("fetchAccountTokens should return array when response is array", async () => {
    const tokens = [{ id: 1 }]
    mockedFetchApiData.mockResolvedValueOnce(tokens)

    const result = await fetchAccountTokens(baseRequest as any)

    expect(mockedFetchApiData).toHaveBeenCalled()
    expect(result).toEqual(tokens)
  })

  it("fetchAccountTokens should trim token.key without synthesizing an sk- prefix", async () => {
    mockedFetchApiData.mockResolvedValueOnce([
      { id: 1, key: "plain" },
      { id: 2, key: "sk-already" },
      { id: 3, key: "  sk-trim  " },
    ])

    const result = await fetchAccountTokens(baseRequest as any)
    expect(result.map((token: any) => token.key)).toEqual([
      "plain",
      "sk-already",
      "sk-trim",
    ])
  })

  it("fetchAccountTokens should return data field when response is paginated object", async () => {
    const tokens = [{ id: 1 }, { id: 2 }]
    mockedFetchApiData.mockResolvedValueOnce({ data: tokens })

    const result = await fetchAccountTokens(baseRequest as any)

    expect(result).toEqual(tokens)
  })

  it("fetchAccountTokens should translate a zero-based page to OneHub pagination", async () => {
    mockedFetchApiData.mockResolvedValueOnce({ data: [] })

    await expect(
      fetchAccountTokens(baseRequest as any, 2, 25),
    ).resolves.toEqual([])
    expect(mockedFetchApiData).toHaveBeenCalledWith(baseRequest, {
      endpoint: "/api/token/?page=3&size=25",
    })
  })

  it("fetchAccountTokens should return an empty array for an unexpected format", async () => {
    mockedFetchApiData.mockResolvedValueOnce({ foo: "bar" })

    await expect(fetchAccountTokens(baseRequest as any)).resolves.toEqual([])
  })

  it("fetchAccountTokens should rethrow errors", async () => {
    const error = new Error("token error")
    mockedFetchApiData.mockRejectedValueOnce(error)

    await expect(fetchAccountTokens(baseRequest as any)).rejects.toThrow(
      "token error",
    )
  })

  it("fetchCompleteAccountTokens collects OneHub pages without requiring size echo", async () => {
    const firstPageTokens = [{ id: 1 }, { id: 2 }]
    mockedFetchApiData
      .mockResolvedValueOnce({
        data: firstPageTokens,
        page: 1,
        size: 2,
        total_count: 3,
      })
      .mockResolvedValueOnce({
        data: [{ id: 3 }],
        page: 2,
        size: 2,
        total_count: 3,
      })
      .mockResolvedValueOnce({ data: [], page: 3, total_count: 3 })

    await expect(
      fetchCompleteAccountTokens(baseRequest as any),
    ).resolves.toEqual([...firstPageTokens, { id: 3 }])
    expect(mockedFetchApiData).toHaveBeenNthCalledWith(1, baseRequest, {
      endpoint: "/api/token/?page=1&size=100",
    })
    expect(mockedFetchApiData).toHaveBeenNthCalledWith(2, baseRequest, {
      endpoint: "/api/token/?page=2&size=100",
    })
    expect(mockedFetchApiData).toHaveBeenNthCalledWith(3, baseRequest, {
      endpoint: "/api/token/?page=3&size=100",
    })
  })

  it("fetchCompleteAccountTokens tolerates stale OneHub page metadata", async () => {
    mockedFetchApiData
      .mockResolvedValueOnce({
        data: [{ id: 1 }],
        page: 9,
        size: 1,
        total_count: 2,
      })
      .mockResolvedValueOnce({
        data: [{ id: 2 }],
        page: 9,
        size: 1,
        total_count: 2,
      })
      .mockResolvedValueOnce({ data: [], page: 9, total_count: 0 })

    await expect(
      fetchCompleteAccountTokens(baseRequest as any),
    ).resolves.toEqual([{ id: 1 }, { id: 2 }])
    expect(mockedFetchApiData).toHaveBeenNthCalledWith(2, baseRequest, {
      endpoint: "/api/token/?page=2&size=100",
    })
  })

  it("fetchUserGroups should transform user group response", async () => {
    const responseData = { group1: { id: 1 } }
    const transformed = { group1: { desc: "Group 1", ratio: 1 } }
    mockedFetchApiData.mockResolvedValueOnce(responseData)
    mockedTransformUserGroup.mockReturnValueOnce(transformed)

    const result = await fetchUserGroups(baseRequest as any)

    expect(mockedFetchApiData).toHaveBeenCalledWith(baseRequest, {
      endpoint: "/api/user_group_map",
    })
    expect(mockedTransformUserGroup).toHaveBeenCalledWith(responseData)
    expect(result).toBe(transformed)
  })

  it("fetchUserGroups should rethrow errors", async () => {
    const error = new Error("group error")
    mockedFetchApiData.mockRejectedValueOnce(error)

    await expect(fetchUserGroups(baseRequest as any)).rejects.toThrow(
      "group error",
    )
  })

  it("fetchAccountAvailableModels should return keys of available models", async () => {
    const availableModel = {
      modelA: {},
      modelB: {},
    }
    mockedFetchApiData.mockResolvedValueOnce(availableModel)

    const result = await fetchAccountAvailableModels(baseRequest as any)

    expect(result).toEqual(["modelA", "modelB"])
  })
})
