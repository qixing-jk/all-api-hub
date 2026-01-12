import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchApiData } from "~/services/apiService/common/utils"
import {
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchAvailableModel,
  fetchModelPricing,
  fetchUserGroupMap,
  fetchUserGroups,
} from "~/services/apiService/oneHub"
import {
  transformModelPricing,
  transformUserGroup,
} from "~/utils/dataTransform/one-hub"

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApiData: vi.fn(),
}))

vi.mock("~/utils/dataTransform/one-hub", () => ({
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
    userId: 1,
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

  it("fetchAccountTokens should normalize token.key with sk- prefix", async () => {
    mockedFetchApiData.mockResolvedValueOnce([
      { id: 1, key: "plain" },
      { id: 2, key: "sk-already" },
      { id: 3, key: "  sk-trim  " },
    ])

    const result = await fetchAccountTokens(baseRequest as any)
    expect(result.map((token: any) => token.key)).toEqual([
      "sk-plain",
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

  it("fetchAccountTokens should return empty array for unexpected format", async () => {
    mockedFetchApiData.mockResolvedValueOnce({ foo: "bar" })

    const result = await fetchAccountTokens(baseRequest as any)

    expect(result).toEqual([])
  })

  it("fetchAccountTokens should rethrow errors", async () => {
    const error = new Error("token error")
    mockedFetchApiData.mockRejectedValueOnce(error)

    await expect(fetchAccountTokens(baseRequest as any)).rejects.toThrow(
      "token error",
    )
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
