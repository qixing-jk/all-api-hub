import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  discoverOpenAICompatibleModels,
  fetchOpenAICompatibleModelIds,
  fetchOpenAICompatibleModels,
} from "~/services/aiApi/openaiCompatible"
import { decodeOpenAICompatibleResponseError } from "~/services/aiApi/openaiCompatible/responseError"
import { ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"

const { mockFetchApiData, mockLoggerError } = vi.hoisted(() => ({
  mockFetchApiData: vi.fn(),
  mockLoggerError: vi.fn(),
}))

vi.mock("~/services/apiTransport/request", () => ({
  fetchApiData: mockFetchApiData,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => ({
    error: mockLoggerError,
  })),
}))

describe("OpenAI-compatible model fetchers", () => {
  const params = {
    baseUrl: "https://openai-compatible.example.com",
    apiKey: "synthetic-openai-compatible-key",
  }
  const expectedRequest = {
    baseUrl: params.baseUrl,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: params.apiKey,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches models from the canonical /v1/models endpoint with access-token auth", async () => {
    const models = [{ id: "gpt-4.1" }, { id: "gpt-4o-mini" }]
    mockFetchApiData.mockResolvedValueOnce(models)

    await expect(fetchOpenAICompatibleModels(params)).resolves.toEqual(models)

    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
    expect(mockFetchApiData).toHaveBeenCalledWith(
      {
        baseUrl: "https://openai-compatible.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "synthetic-openai-compatible-key",
        },
      },
      {
        endpoint: "/v1/models",
        errorResponseDecoder: decodeOpenAICompatibleResponseError,
      },
    )
  })

  it.each([
    {
      baseUrl: "https://openai-compatible.example.com",
      resolvedBaseUrl: "https://openai-compatible.example.com/v1",
    },
    {
      baseUrl: "https://x.test/v1",
      resolvedBaseUrl: "https://x.test/v1",
    },
    {
      baseUrl: "https://ark.example.invalid/api/v3",
      resolvedBaseUrl: "https://ark.example.invalid/api/v3/v1",
    },
  ])(
    "returns $resolvedBaseUrl when the canonical route succeeds for $baseUrl",
    async ({ baseUrl, resolvedBaseUrl }) => {
      const models = [{ id: "gpt-4.1" }]
      mockFetchApiData.mockResolvedValueOnce(models)

      await expect(
        discoverOpenAICompatibleModels({ ...params, baseUrl }),
      ).resolves.toEqual({ models, resolvedBaseUrl })

      expect(mockFetchApiData).toHaveBeenCalledWith(
        expect.objectContaining({ baseUrl }),
        {
          endpoint: "/v1/models",
          errorResponseDecoder: decodeOpenAICompatibleResponseError,
        },
      )
    },
  )

  it("accepts an empty canonical model list without trying another endpoint", async () => {
    mockFetchApiData.mockResolvedValueOnce([])

    await expect(fetchOpenAICompatibleModels(params)).resolves.toEqual([])

    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
  })

  it.each([404, 405])(
    "falls back to /models when the canonical route returns %s",
    async (statusCode) => {
      const canonicalError = new ApiError(
        "canonical route unavailable",
        statusCode,
      )
      const models = [{ id: "custom-model" }]
      mockFetchApiData
        .mockRejectedValueOnce(canonicalError)
        .mockResolvedValueOnce(models)

      await expect(discoverOpenAICompatibleModels(params)).resolves.toEqual({
        models,
        resolvedBaseUrl: "https://openai-compatible.example.com",
      })

      expect(mockFetchApiData).toHaveBeenNthCalledWith(1, expectedRequest, {
        endpoint: "/v1/models",
        errorResponseDecoder: decodeOpenAICompatibleResponseError,
      })
      expect(mockFetchApiData).toHaveBeenNthCalledWith(2, expectedRequest, {
        endpoint: "/models",
        errorResponseDecoder: decodeOpenAICompatibleResponseError,
      })
    },
  )

  it("normalizes a path-fragment Base URL after fallback discovery", async () => {
    const pathParams = { ...params, baseUrl: "  /api/v3/  " }
    const canonicalError = new ApiError("canonical route unavailable", 404)
    const models = [{ id: "custom-model" }]
    mockFetchApiData
      .mockRejectedValueOnce(canonicalError)
      .mockResolvedValueOnce(models)

    await expect(discoverOpenAICompatibleModels(pathParams)).resolves.toEqual({
      models,
      resolvedBaseUrl: "/api/v3",
    })
  })

  it.each([
    ["authentication", new ApiError("unauthorized", 401)],
    ["throttling", new ApiError("rate limited", 429)],
    ["server", new ApiError("upstream unavailable", 500)],
    ["network", new TypeError("network request failed")],
  ])("does not infer another route from a %s failure", async (_kind, error) => {
    mockFetchApiData.mockRejectedValueOnce(error)

    await expect(discoverOpenAICompatibleModels(params)).rejects.toBe(error)

    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
  })

  it("does not accept an invalid successful payload as route confirmation", async () => {
    mockFetchApiData.mockResolvedValueOnce({ message: "not a model list" })

    await expect(discoverOpenAICompatibleModels(params)).rejects.toThrow(
      "invalid model list",
    )

    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
  })

  it("keeps the model-only wrapper compatible with /models fallback", async () => {
    const canonicalError = new ApiError("canonical route unavailable", 404)
    const models = [{ id: "custom-model" }]
    mockFetchApiData
      .mockRejectedValueOnce(canonicalError)
      .mockResolvedValueOnce(models)

    await expect(fetchOpenAICompatibleModels(params)).resolves.toEqual(models)

    expect(mockFetchApiData).toHaveBeenNthCalledWith(1, expect.any(Object), {
      endpoint: "/v1/models",
      errorResponseDecoder: decodeOpenAICompatibleResponseError,
    })
    expect(mockFetchApiData).toHaveBeenNthCalledWith(2, expect.any(Object), {
      endpoint: "/models",
      errorResponseDecoder: decodeOpenAICompatibleResponseError,
    })
  })

  it("passes caller abort signals to the model-list request", async () => {
    const models = [{ id: "gpt-4.1" }]
    const abortController = new AbortController()
    mockFetchApiData.mockResolvedValueOnce(models)

    await expect(
      fetchOpenAICompatibleModels({
        ...params,
        abortSignal: abortController.signal,
      }),
    ).resolves.toEqual(models)

    expect(mockFetchApiData).toHaveBeenCalledWith(
      {
        baseUrl: "https://openai-compatible.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "synthetic-openai-compatible-key",
        },
      },
      {
        endpoint: "/v1/models",
        errorResponseDecoder: decodeOpenAICompatibleResponseError,
        options: {
          signal: abortController.signal,
        },
      },
    )
  })

  it("does not try another model endpoint after the request is aborted", async () => {
    const abortController = new AbortController()
    const abortError = new DOMException(
      "The operation was aborted",
      "AbortError",
    )
    mockFetchApiData.mockImplementationOnce(async () => {
      abortController.abort()
      throw abortError
    })

    await expect(
      fetchOpenAICompatibleModels({
        ...params,
        abortSignal: abortController.signal,
      }),
    ).rejects.toBe(abortError)

    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
  })

  it("maps upstream models into plain model id lists", async () => {
    mockFetchApiData.mockResolvedValueOnce([
      { id: "gpt-4.1", owned_by: "openai" },
      { id: "gpt-4o-mini", owned_by: "openai" },
    ])

    await expect(fetchOpenAICompatibleModelIds(params)).resolves.toEqual([
      "gpt-4.1",
      "gpt-4o-mini",
    ])
  })

  it("logs and rethrows after both model endpoints fail", async () => {
    const canonicalError = new ApiError("canonical route unavailable", 404)
    const fallbackError = new Error("fallback endpoint unavailable")
    mockFetchApiData
      .mockRejectedValueOnce(canonicalError)
      .mockRejectedValueOnce(fallbackError)

    await expect(fetchOpenAICompatibleModels(params)).rejects.toBe(
      fallbackError,
    )
    expect(mockFetchApiData).toHaveBeenCalledTimes(2)
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Failed to fetch upstream model list",
      fallbackError,
    )
  })
})
