import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchOpenAICompatibleModelIds,
  fetchOpenAICompatibleModels,
} from "~/services/apiService/openaiCompatible"
import { AuthTypeEnum } from "~/types"

const { mockFetchApiData, mockLoggerError } = vi.hoisted(() => ({
  mockFetchApiData: vi.fn(),
  mockLoggerError: vi.fn(),
}))

vi.mock("~/services/apiService/common/utils", () => ({
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
    apiKey: "secret-key",
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches models from the canonical /v1/models endpoint with access-token auth", async () => {
    const models = [{ id: "gpt-4.1" }, { id: "gpt-4o-mini" }]
    mockFetchApiData.mockResolvedValueOnce(models)

    await expect(fetchOpenAICompatibleModels(params as any)).resolves.toEqual(
      models,
    )

    expect(mockFetchApiData).toHaveBeenCalledWith(
      {
        baseUrl: "https://openai-compatible.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "secret-key",
        },
      },
      {
        endpoint: "/v1/models",
      },
    )
  })

  it("passes caller abort signals to the model-list request", async () => {
    const models = [{ id: "gpt-4.1" }]
    const abortController = new AbortController()
    mockFetchApiData.mockResolvedValueOnce(models)

    await expect(
      fetchOpenAICompatibleModels({
        ...params,
        abortSignal: abortController.signal,
      } as any),
    ).resolves.toEqual(models)

    expect(mockFetchApiData).toHaveBeenCalledWith(
      {
        baseUrl: "https://openai-compatible.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "secret-key",
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

  it("maps upstream models into plain model id lists", async () => {
    mockFetchApiData.mockResolvedValueOnce([
      { id: "gpt-4.1", owned_by: "openai" },
      { id: "gpt-4o-mini", owned_by: "openai" },
    ])

    await expect(fetchOpenAICompatibleModelIds(params as any)).resolves.toEqual(
      ["gpt-4.1", "gpt-4o-mini"],
    )
  })

  it("logs and rethrows fetch failures", async () => {
    const error = new Error("upstream unavailable")
    mockFetchApiData.mockRejectedValueOnce(error)

    await expect(fetchOpenAICompatibleModels(params as any)).rejects.toThrow(
      error,
    )
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Failed to fetch upstream model list",
      error,
    )
  })
})
