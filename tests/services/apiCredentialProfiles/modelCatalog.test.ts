import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildApiCredentialProfilePricingResponse,
  fetchApiCredentialModelIds,
  normalizeApiCredentialModelIds,
} from "~/services/apiCredentialProfiles/modelCatalog"
import { API_TYPES } from "~/services/verification/aiApiVerification"

const {
  fetchAnthropicModelIdsMock,
  fetchGoogleModelIdsMock,
  fetchOpenAICompatibleModelIdsMock,
} = vi.hoisted(() => ({
  fetchAnthropicModelIdsMock: vi.fn(),
  fetchGoogleModelIdsMock: vi.fn(),
  fetchOpenAICompatibleModelIdsMock: vi.fn(),
}))

vi.mock("~/services/aiApi/anthropic", () => ({
  fetchAnthropicModelIds: (...args: unknown[]) =>
    fetchAnthropicModelIdsMock(...args),
}))

vi.mock("~/services/aiApi/google", () => ({
  fetchGoogleModelIds: (...args: unknown[]) => fetchGoogleModelIdsMock(...args),
}))

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: unknown[]) =>
    fetchOpenAICompatibleModelIdsMock(...args),
}))

describe("modelCatalog", () => {
  beforeEach(() => {
    fetchAnthropicModelIdsMock.mockReset()
    fetchGoogleModelIdsMock.mockReset()
    fetchOpenAICompatibleModelIdsMock.mockReset()
  })

  it("routes profile model-id lookups to the provider-specific fetcher", async () => {
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce(["gpt-4.1"])
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce(["gpt-4o"])
    fetchAnthropicModelIdsMock.mockResolvedValueOnce(["claude-3-7-sonnet"])
    fetchGoogleModelIdsMock.mockResolvedValueOnce(["gemini-2.5-pro"])

    await expect(
      fetchApiCredentialModelIds({
        apiType: API_TYPES.OPENAI,
        baseUrl: "https://openai.example.com",
        apiKey: "openai-key",
      }),
    ).resolves.toEqual(["gpt-4.1"])
    await expect(
      fetchApiCredentialModelIds({
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://proxy.example.com",
        apiKey: "proxy-key",
      }),
    ).resolves.toEqual(["gpt-4o"])
    await expect(
      fetchApiCredentialModelIds({
        apiType: API_TYPES.ANTHROPIC,
        baseUrl: "https://anthropic.example.com",
        apiKey: "anthropic-key",
      }),
    ).resolves.toEqual(["claude-3-7-sonnet"])
    await expect(
      fetchApiCredentialModelIds({
        apiType: API_TYPES.GOOGLE,
        baseUrl: "https://google.example.com",
        apiKey: "google-key",
      }),
    ).resolves.toEqual(["gemini-2.5-pro"])
  })

  it("passes abort signals to provider-specific model-id fetchers", async () => {
    const abortController = new AbortController()
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce(["gpt-4o"])
    fetchAnthropicModelIdsMock.mockResolvedValueOnce(["claude-3-7-sonnet"])
    fetchGoogleModelIdsMock.mockResolvedValueOnce(["gemini-2.5-pro"])

    await fetchApiCredentialModelIds({
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://proxy.example.com",
      apiKey: "proxy-key",
      abortSignal: abortController.signal,
    })
    await fetchApiCredentialModelIds({
      apiType: API_TYPES.ANTHROPIC,
      baseUrl: "https://anthropic.example.com",
      apiKey: "anthropic-key",
      abortSignal: abortController.signal,
    })
    await fetchApiCredentialModelIds({
      apiType: API_TYPES.GOOGLE,
      baseUrl: "https://google.example.com",
      apiKey: "google-key",
      abortSignal: abortController.signal,
    })

    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: abortController.signal }),
    )
    expect(fetchAnthropicModelIdsMock).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: abortController.signal }),
    )
    expect(fetchGoogleModelIdsMock).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: abortController.signal }),
    )
  })

  it("throws for unsupported profile api types", async () => {
    await expect(
      fetchApiCredentialModelIds({
        apiType: "unsupported" as any,
        baseUrl: "https://example.com",
        apiKey: "key",
      }),
    ).rejects.toThrow("Unsupported apiType")
  })

  it("normalizes profile ids before assembling descriptor-backed pricing rows", () => {
    expect(
      normalizeApiCredentialModelIds([
        " gpt-4o ",
        "",
        "gpt-4o",
        "claude-3-haiku",
        123,
      ] as any),
    ).toEqual(["gpt-4o", "claude-3-haiku"])

    expect(
      buildApiCredentialProfilePricingResponse([
        " gpt-4o ",
        "gpt-4o",
        "claude-3-haiku",
      ]).data,
    ).toEqual([
      expect.objectContaining({ model_name: "gpt-4o" }),
      expect.objectContaining({ model_name: "claude-3-haiku" }),
    ])
  })
})
