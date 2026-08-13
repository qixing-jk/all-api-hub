import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createAnthropic: vi.fn(),
  createGoogleGenerativeAI: vi.fn(),
  createOpenAI: vi.fn(),
  createOpenAICompatible: vi.fn(),
}))

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: mocks.createAnthropic,
}))

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: mocks.createGoogleGenerativeAI,
}))

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: mocks.createOpenAI,
}))

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: mocks.createOpenAICompatible,
}))

describe("aiApiVerification providers", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mocks.createOpenAICompatible.mockImplementation((config) => {
      return (modelId: string) => ({
        provider: "openai-compatible",
        config,
        modelId,
      })
    })

    mocks.createOpenAI.mockImplementation((config) => {
      return (modelId: string) => ({
        provider: "openai",
        config,
        modelId,
      })
    })

    mocks.createAnthropic.mockImplementation((config) => {
      return (modelId: string) => ({
        provider: "anthropic",
        config,
        modelId,
      })
    })

    mocks.createGoogleGenerativeAI.mockImplementation((config) => {
      return (modelId: string) => ({
        provider: "google",
        config,
        modelId,
      })
    })
  })

  it("creates an OpenAI-compatible model with a normalized /v1 base URL and app name", async () => {
    const { createModel } = await import(
      "~/services/verification/aiApiVerification/providers"
    )

    expect(
      createModel({
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api/",
        apiKey: "sk-compatible",
        modelId: "gpt-4.1",
      }),
    ).toEqual({
      provider: "openai-compatible",
      modelId: "gpt-4.1",
      config: {
        name: "all-api-hub",
        baseURL: "https://proxy.example.com/api/v1",
        apiKey: "sk-compatible",
      },
    })
  })

  it("preserves the complete Volcengine Ark Coding Plan prefix for OpenAI-compatible probes", async () => {
    const { createModel } = await import(
      "~/services/verification/aiApiVerification/providers"
    )

    expect(
      createModel({
        apiType: "openai-compatible",
        baseUrl: "https://volcengine-coding-plan.example.invalid/api/coding/v3",
        apiKey: "sk-compatible",
        modelId: "coding-model",
      }),
    ).toMatchObject({
      config: {
        baseURL: "https://volcengine-coding-plan.example.invalid/api/coding/v3",
      },
    })
  })

  it("creates an OpenAI model with a normalized /v1 base URL", async () => {
    const { createModel } = await import(
      "~/services/verification/aiApiVerification/providers"
    )

    expect(
      createModel({
        apiType: "openai",
        baseUrl: "https://openai-proxy.example.com",
        apiKey: "sk-openai",
        modelId: "gpt-4.1-mini",
      }),
    ).toEqual({
      provider: "openai",
      modelId: "gpt-4.1-mini",
      config: {
        baseURL: "https://openai-proxy.example.com/v1",
        apiKey: "sk-openai",
      },
    })
  })

  it("creates an Anthropic model with a normalized /v1 base URL", async () => {
    const { createModel } = await import(
      "~/services/verification/aiApiVerification/providers"
    )

    expect(
      createModel({
        apiType: "anthropic",
        baseUrl: "https://anthropic-proxy.example.com/custom",
        apiKey: "sk-anthropic",
        modelId: "claude-3-7-sonnet",
      }),
    ).toEqual({
      provider: "anthropic",
      modelId: "claude-3-7-sonnet",
      config: {
        baseURL: "https://anthropic-proxy.example.com/custom/v1",
        apiKey: "sk-anthropic",
      },
    })
  })

  it("preserves the complete Volcengine Ark Coding Plan prefix for Codex", async () => {
    const { createModel } = await import(
      "~/services/verification/aiApiVerification/providers"
    )

    expect(
      createModel({
        apiType: "openai",
        baseUrl:
          "https://volcengine-coding-plan.example.invalid/api/coding/v3/",
        apiKey: "sk-cli",
        modelId: "coding-model",
      }),
    ).toMatchObject({
      provider: "openai",
      config: {
        baseURL: "https://volcengine-coding-plan.example.invalid/api/coding/v3",
      },
    })
  })

  it("keeps Volcengine Ark Anthropic compatibility on its native /v1 protocol", async () => {
    const { createModel } = await import(
      "~/services/verification/aiApiVerification/providers"
    )

    expect(
      createModel({
        apiType: "anthropic",
        baseUrl: "https://volcengine-anthropic.example.invalid/api/compatible",
        apiKey: "sk-cli",
        modelId: "claude-test",
      }),
    ).toMatchObject({
      provider: "anthropic",
      config: {
        baseURL:
          "https://volcengine-anthropic.example.invalid/api/compatible/v1",
      },
    })
  })

  it("falls back to the Google provider and normalizes the /v1beta base URL", async () => {
    const { createModel } = await import(
      "~/services/verification/aiApiVerification/providers"
    )

    expect(
      createModel({
        apiType: "google",
        baseUrl: "https://generativelanguage.googleapis.com/",
        apiKey: "AIza-secret",
        modelId: "gemini-2.5-pro",
      }),
    ).toEqual({
      provider: "google",
      modelId: "gemini-2.5-pro",
      config: {
        baseURL: "https://generativelanguage.googleapis.com/v1beta",
        apiKey: "AIza-secret",
      },
    })
  })

  it("exposes provider factories with the same normalized base URL rules", async () => {
    const { createGoogleProvider, createOpenAIProvider } = await import(
      "~/services/verification/aiApiVerification/providers"
    )

    const openAIProvider = createOpenAIProvider({
      baseUrl: "https://proxy.example.com/custom/",
      apiKey: "sk-openai",
    })
    const googleProvider = createGoogleProvider({
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: "AIza-secret",
    })

    expect(openAIProvider("gpt-4.1")).toEqual({
      provider: "openai",
      modelId: "gpt-4.1",
      config: {
        baseURL: "https://proxy.example.com/custom/v1",
        apiKey: "sk-openai",
      },
    })
    expect(googleProvider("gemini-2.0-flash")).toEqual({
      provider: "google",
      modelId: "gemini-2.0-flash",
      config: {
        baseURL: "https://generativelanguage.googleapis.com/v1beta",
        apiKey: "AIza-secret",
      },
    })
  })

  it("prefers an explicit model id over token hints and otherwise falls back to token metadata", async () => {
    const { resolveRequestedModelId } = await import(
      "~/services/verification/aiApiVerification/modelResolver"
    )

    expect(
      resolveRequestedModelId({
        modelId: "explicit-model",
        tokenMeta: {
          models: "fallback-a,fallback-b",
          model_limits: "fallback-c",
          name: "Token",
          id: 1,
        },
      }),
    ).toBe("explicit-model")

    expect(
      resolveRequestedModelId({
        tokenMeta: {
          models: "  gemini-2.5-pro \n gemini-2.5-flash  ",
          model_limits: "gpt-4.1",
          name: "Token",
          id: 2,
        },
      }),
    ).toBe("gemini-2.5-pro")

    expect(
      resolveRequestedModelId({
        tokenMeta: {
          models: "   ",
          model_limits: "claude-3-7-sonnet claude-3-5-haiku",
          name: "Token",
          id: 3,
        },
      }),
    ).toBe("claude-3-7-sonnet")

    expect(resolveRequestedModelId({})).toBeUndefined()
  })
})
