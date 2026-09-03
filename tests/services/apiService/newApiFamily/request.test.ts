import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchApi,
  fetchApiData,
} from "~/services/apiService/newApiFamily/request"
import { decodeNewApiResponseError } from "~/services/apiService/newApiFamily/responseError"
import { AuthTypeEnum } from "~/types"

const { mockFetchApi, mockFetchApiData } = vi.hoisted(() => ({
  mockFetchApi: vi.fn(),
  mockFetchApiData: vi.fn(),
}))

vi.mock("~/services/apiTransport/request", () => ({
  fetchApi: mockFetchApi,
  fetchApiData: mockFetchApiData,
}))

const request = {
  baseUrl: "https://api.example.invalid",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
}

describe("newApiFamily request", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("injects the New API decoder into data requests", async () => {
    mockFetchApiData.mockResolvedValueOnce({ id: 1 })

    await expect(
      fetchApiData(request, { endpoint: "/api/user/self" }),
    ).resolves.toEqual({ id: 1 })
    expect(mockFetchApiData).toHaveBeenCalledWith(request, {
      endpoint: "/api/user/self",
      errorResponseDecoder: decodeNewApiResponseError,
    })
  })

  it("preserves normal-response mode while injecting the decoder", async () => {
    mockFetchApi.mockResolvedValueOnce(["example-model"])

    await expect(
      fetchApi<string[]>(request, { endpoint: "/api/user/models" }, true),
    ).resolves.toEqual(["example-model"])
    expect(mockFetchApi).toHaveBeenCalledWith(
      request,
      {
        endpoint: "/api/user/models",
        errorResponseDecoder: decodeNewApiResponseError,
      },
      true,
    )
  })
})
