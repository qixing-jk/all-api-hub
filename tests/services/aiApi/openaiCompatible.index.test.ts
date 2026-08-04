import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchOpenAICompatibleModelIds,
  fetchOpenAICompatibleModels,
} from "~/services/aiApi/openaiCompatible"
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
      },
    )
  })

  it("accepts an empty canonical model list without trying another endpoint", async () => {
    mockFetchApiData.mockResolvedValueOnce([])

    await expect(fetchOpenAICompatibleModels(params)).resolves.toEqual([])

    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
  })

  it("falls back to /models when the canonical model endpoint fails", async () => {
    const canonicalError = new Error("canonical endpoint unavailable")
    const models = [{ id: "custom-model" }]
    mockFetchApiData
      .mockRejectedValueOnce(canonicalError)
      .mockResolvedValueOnce(models)

    await expect(fetchOpenAICompatibleModels(params)).resolves.toEqual(models)

    expect(mockFetchApiData).toHaveBeenNthCalledWith(1, expect.any(Object), {
      endpoint: "/v1/models",
    })
    expect(mockFetchApiData).toHaveBeenNthCalledWith(2, expect.any(Object), {
      endpoint: "/models",
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
    const canonicalError = new Error("canonical endpoint unavailable")
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
