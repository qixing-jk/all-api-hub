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
    baseUrl: `${params.baseUrl}/v1`,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: params.apiKey,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("requests models once at a complete non-v1 protocol mount", async () => {
    mockFetchApiData.mockResolvedValueOnce([{ id: "ark-model" }])

    await expect(
      discoverOpenAICompatibleModels({
        ...params,
        baseUrl: "https://ark.example.invalid/api/v3",
      }),
    ).resolves.toEqual({
      models: [{ id: "ark-model" }],
      resolvedBaseUrl: "https://ark.example.invalid/api/v3",
    })
    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
    expect(mockFetchApiData).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://ark.example.invalid/api/v3",
      }),
      expect.objectContaining({ endpoint: "models" }),
    )
  })

  it("fetches models from the canonical /v1/models endpoint with access-token auth", async () => {
    const models = [{ id: "gpt-4.1" }, { id: "gpt-4o-mini" }]
    mockFetchApiData.mockResolvedValueOnce(models)

    await expect(fetchOpenAICompatibleModels(params)).resolves.toEqual(models)

    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
    expect(mockFetchApiData).toHaveBeenCalledWith(
      {
        baseUrl: "https://openai-compatible.example.com/v1",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "synthetic-openai-compatible-key",
        },
      },
      {
        endpoint: "models",
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
      resolvedBaseUrl: "https://ark.example.invalid/api/v3",
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
        expect.objectContaining({ baseUrl: resolvedBaseUrl }),
        {
          endpoint: "models",
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

  it("preserves live scheduling intent across model route fallback", async () => {
    const requestScheduling = {
      priority: "background" as "background" | "foreground",
    }
    mockFetchApiData
      .mockImplementationOnce(async (request) => {
        expect(request.requestScheduling).toBe(requestScheduling)
        requestScheduling.priority = "foreground"
        throw new ApiError("canonical route unavailable", 404)
      })
      .mockImplementationOnce(async (request) => {
        expect(request.requestScheduling).toBe(requestScheduling)
        expect(request.requestScheduling.priority).toBe("foreground")
        return [{ id: "custom-model" }]
      })

    await expect(
      discoverOpenAICompatibleModels({ ...params, requestScheduling }),
    ).resolves.toMatchObject({
      models: [{ id: "custom-model" }],
    })
    expect(mockFetchApiData).toHaveBeenCalledTimes(2)
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
        endpoint: "models",
        errorResponseDecoder: decodeOpenAICompatibleResponseError,
      })
      expect(mockFetchApiData).toHaveBeenNthCalledWith(
        2,
        {
          ...expectedRequest,
          baseUrl: params.baseUrl,
        },
        {
          endpoint: "models",
          errorResponseDecoder: decodeOpenAICompatibleResponseError,
        },
      )
    },
  )

  it("tries /v1/models first for a custom proxy subpath, then the subpath itself", async () => {
    const customBaseUrl = "https://custom.proxy.example/api"
    const canonicalError = new ApiError("route unavailable", 404)
    const models = [{ id: "custom-model" }]
    mockFetchApiData
      .mockRejectedValueOnce(canonicalError)
      .mockResolvedValueOnce(models)

    await expect(
      discoverOpenAICompatibleModels({ ...params, baseUrl: customBaseUrl }),
    ).resolves.toEqual({
      models,
      resolvedBaseUrl: "https://custom.proxy.example/api",
    })

    expect(mockFetchApiData).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        baseUrl: "https://custom.proxy.example/api/v1",
      }),
      expect.objectContaining({ endpoint: "models" }),
    )
    expect(mockFetchApiData).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ baseUrl: customBaseUrl }),
      expect.objectContaining({ endpoint: "models" }),
    )
  })

  it("falls back to /models when custom proxy subpath /v1/models returns 404", async () => {
    const customV1BaseUrl = "https://custom.proxy.example/api/v1"
    const canonicalError = new ApiError("route unavailable", 404)
    const models = [{ id: "custom-model" }]
    mockFetchApiData
      .mockRejectedValueOnce(canonicalError)
      .mockResolvedValueOnce(models)

    await expect(
      discoverOpenAICompatibleModels({ ...params, baseUrl: customV1BaseUrl }),
    ).resolves.toEqual({
      models,
      resolvedBaseUrl: "https://custom.proxy.example/api",
    })

    expect(mockFetchApiData).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ baseUrl: customV1BaseUrl }),
      expect.objectContaining({ endpoint: "models" }),
    )
    expect(mockFetchApiData).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ baseUrl: "https://custom.proxy.example/api" }),
      expect.objectContaining({ endpoint: "models" }),
    )
  })

  it("rejects a path fragment without a host", async () => {
    const pathParams = { ...params, baseUrl: "  /api/v3/  " }
    await expect(discoverOpenAICompatibleModels(pathParams)).rejects.toThrow(
      "Invalid OpenAI-compatible API base URL",
    )
    expect(mockFetchApiData).not.toHaveBeenCalled()
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
      endpoint: "models",
      errorResponseDecoder: decodeOpenAICompatibleResponseError,
    })
    expect(mockFetchApiData).toHaveBeenNthCalledWith(2, expect.any(Object), {
      endpoint: "models",
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
        baseUrl: "https://openai-compatible.example.com/v1",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "synthetic-openai-compatible-key",
        },
      },
      {
        endpoint: "models",
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
      "fallback endpoint unavailable",
    )
  })
})
