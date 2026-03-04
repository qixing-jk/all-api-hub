import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchAccountTokens,
  fetchTokenById,
} from "~/services/apiService/common"
import { fetchApiData } from "~/services/apiService/common/utils"
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

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: mockFetchApi,
  fetchApiData: mockFetchApiData,
  aggregateUsageData: vi.fn(),
  extractAmount: vi.fn(),
  getTodayTimestampRange: vi.fn(),
}))

const mockedFetchApiData = fetchApiData as unknown as ReturnType<typeof vi.fn>

describe("apiService common token APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetchAccountTokens normalizes token.key with sk- prefix (array response)", async () => {
    mockedFetchApiData.mockResolvedValueOnce([
      { id: 1, key: "plain-key" },
      { id: 2, key: "sk-already" },
      { id: 3, key: "  sk-trim  " },
    ])

    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "token",
      },
    }

    const result = await fetchAccountTokens(request as any)

    expect(mockedFetchApiData).toHaveBeenCalledTimes(1)
    const endpoint = mockedFetchApiData.mock.calls[0][1].endpoint as string
    expect(endpoint).toContain("/api/token/?")
    expect(endpoint).toContain("p=0")
    expect(endpoint).toContain("size=100")

    expect(result.map((token: any) => token.key)).toEqual([
      "sk-plain-key",
      "sk-already",
      "sk-trim",
    ])
  })

  it("fetchAccountTokens normalizes token.key with sk- prefix (paginated response)", async () => {
    mockedFetchApiData.mockResolvedValueOnce({
      items: [{ id: 1, key: "plain" }],
    })

    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "token",
      },
    }

    const result = await fetchAccountTokens(request as any)
    expect(result.map((token: any) => token.key)).toEqual(["sk-plain"])
  })

  it("fetchTokenById normalizes token.key with sk- prefix", async () => {
    mockedFetchApiData.mockResolvedValueOnce({ id: 99, key: "abc" })

    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "token",
      },
    }

    const result = await fetchTokenById(request as any, 99)

    expect(mockedFetchApiData).toHaveBeenCalledWith(request, {
      endpoint: "/api/token/99",
    })
    expect((result as any).key).toBe("sk-abc")
  })
})
