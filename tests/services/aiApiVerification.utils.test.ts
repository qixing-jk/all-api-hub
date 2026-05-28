import { beforeEach, describe, expect, it, vi } from "vitest"

const registryMocks = vi.hoisted(() => ({
  runModelsProbe: vi.fn(),
  runStructuredOutputProbe: vi.fn(),
  runTextGenerationProbe: vi.fn(),
  runToolCallingProbe: vi.fn(),
  runWebSearchProbe: vi.fn(),
}))

vi.mock("~/services/verification/aiApiVerification/probes/modelsProbe", () => ({
  runModelsProbe: registryMocks.runModelsProbe,
}))

vi.mock(
  "~/services/verification/aiApiVerification/probes/structuredOutputProbe",
  () => ({
    runStructuredOutputProbe: registryMocks.runStructuredOutputProbe,
  }),
)

vi.mock(
  "~/services/verification/aiApiVerification/probes/textGenerationProbe",
  () => ({
    runTextGenerationProbe: registryMocks.runTextGenerationProbe,
  }),
)

vi.mock(
  "~/services/verification/aiApiVerification/probes/toolCallingProbe",
  () => ({
    runToolCallingProbe: registryMocks.runToolCallingProbe,
  }),
)

vi.mock(
  "~/services/verification/aiApiVerification/probes/webSearchProbe",
  () => ({
    runWebSearchProbe: registryMocks.runWebSearchProbe,
  }),
)

describe("aiApiVerification utils", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("redacts known secrets from user-visible error summaries", async () => {
    const { toSanitizedErrorSummary } = await import(
      "~/services/verification/aiApiVerification/utils"
    )

    expect(
      toSanitizedErrorSummary(
        new Error("401 sk-secret denied with sk-secret again"),
        ["sk-secret"],
      ),
    ).toBe("401 [REDACTED] denied with [REDACTED] again")
  })

  it("maps stable HTTP status codes to summary keys", async () => {
    const { summaryKeyFromHttpStatus } = await import(
      "~/services/verification/aiApiVerification/utils"
    )

    expect(summaryKeyFromHttpStatus(401)).toBe(
      "verifyDialog.summaries.unauthorized",
    )
    expect(summaryKeyFromHttpStatus(403)).toBe(
      "verifyDialog.summaries.forbidden",
    )
    expect(summaryKeyFromHttpStatus(404)).toBe(
      "verifyDialog.summaries.endpointNotFound",
    )
    expect(summaryKeyFromHttpStatus(500)).toBeUndefined()
  })

  it("infers HTTP status codes from nested error shapes and fallback messages", async () => {
    const { inferHttpStatus } = await import(
      "~/services/verification/aiApiVerification/utils"
    )

    expect(inferHttpStatus({ status: 401 }, "")).toBe(401)
    expect(inferHttpStatus({ statusCode: "403" }, "")).toBe(403)
    expect(inferHttpStatus({ response: { status: 404 } }, "")).toBe(404)
    expect(inferHttpStatus({ cause: { statusCode: "429" } }, "")).toBe(429)
    expect(
      inferHttpStatus(
        new Error("service returned 503"),
        "service returned 503",
      ),
    ).toBe(503)
    expect(
      inferHttpStatus(new Error("plain failure"), "plain failure"),
    ).toBeUndefined()
  })

  it("infers analytics HTTP status only from structured error fields", async () => {
    const { inferHttpStatus, inferStructuredHttpStatus } = await import(
      "~/services/verification/aiApiVerification/utils"
    )

    expect(inferStructuredHttpStatus({ status: 401 })).toBe(401)
    expect(inferStructuredHttpStatus({ statusCode: "403" })).toBe(403)
    expect(inferStructuredHttpStatus({ response: { status: 404 } })).toBe(404)
    expect(inferStructuredHttpStatus({ cause: { statusCode: "429" } })).toBe(
      429,
    )
    expect(
      inferHttpStatus(
        new Error("service returned 401"),
        "service returned 401",
      ),
    ).toBe(401)
    expect(
      inferStructuredHttpStatus(new Error("service returned 401")),
    ).toBeUndefined()
    expect(inferStructuredHttpStatus({ statusCode: 99 })).toBeUndefined()
    expect(inferStructuredHttpStatus({ statusCode: "600" })).toBeUndefined()
    expect(inferStructuredHttpStatus({ statusCode: 401.5 })).toBeUndefined()
  })

  it("normalizes verification base URLs and guesses a fallback model id from token metadata", async () => {
    const {
      coerceBaseUrlToAnthropicV1,
      coerceBaseUrlToGoogleV1beta,
      coerceBaseUrlToV1,
      guessModelIdFromToken,
    } = await import("~/services/verification/aiApiVerification/utils")

    expect(coerceBaseUrlToV1("https://proxy.example.com/api/")).toBe(
      "https://proxy.example.com/api/v1",
    )
    expect(coerceBaseUrlToAnthropicV1("https://anthropic.example.com/v1")).toBe(
      "https://anthropic.example.com/v1",
    )
    expect(
      coerceBaseUrlToGoogleV1beta("https://generativelanguage.googleapis.com"),
    ).toBe("https://generativelanguage.googleapis.com/v1beta")

    expect(
      guessModelIdFromToken({
        models: " gpt-4.1-mini,\n gpt-4.1 ",
        model_limits: "claude-3-7-sonnet",
      }),
    ).toBe("gpt-4.1-mini")
    expect(
      guessModelIdFromToken({
        models: " ",
        model_limits: "claude-3-7-sonnet claude-3-5-haiku",
      }),
    ).toBe("claude-3-7-sonnet")
    expect(
      guessModelIdFromToken({
        models: "",
        model_limits: "",
      }),
    ).toBeUndefined()
  })
})

describe("apiVerificationProbeRegistry", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("marks only the models probe as model-id optional", async () => {
    const { apiVerificationProbeRegistry } = await import(
      "~/services/verification/aiApiVerification/probeRegistry"
    )

    expect(apiVerificationProbeRegistry.models.requiresModelId).toBe(false)
    expect(
      apiVerificationProbeRegistry["text-generation"].requiresModelId,
    ).toBe(true)
    expect(apiVerificationProbeRegistry["tool-calling"].requiresModelId).toBe(
      true,
    )
    expect(
      apiVerificationProbeRegistry["structured-output"].requiresModelId,
    ).toBe(true)
    expect(apiVerificationProbeRegistry["web-search"].requiresModelId).toBe(
      true,
    )
  })

  it("dispatches each registry entry to the correct probe runner shape", async () => {
    registryMocks.runModelsProbe.mockResolvedValueOnce({
      result: { id: "models", status: "pass" },
    })
    registryMocks.runTextGenerationProbe.mockResolvedValueOnce({
      id: "text-generation",
      status: "pass",
    })
    registryMocks.runToolCallingProbe.mockResolvedValueOnce({
      id: "tool-calling",
      status: "pass",
    })
    registryMocks.runStructuredOutputProbe.mockResolvedValueOnce({
      id: "structured-output",
      status: "pass",
    })
    registryMocks.runWebSearchProbe.mockResolvedValueOnce({
      id: "web-search",
      status: "pass",
    })

    const { apiVerificationProbeRegistry } = await import(
      "~/services/verification/aiApiVerification/probeRegistry"
    )

    const baseParams = {
      baseUrl: "https://proxy.example.com",
      apiKey: "sk-secret",
      apiType: "openai" as const,
      modelId: "gpt-4.1",
    }

    await expect(
      apiVerificationProbeRegistry.models.run(baseParams),
    ).resolves.toEqual({
      id: "models",
      status: "pass",
    })
    await expect(
      apiVerificationProbeRegistry["text-generation"].run(baseParams),
    ).resolves.toEqual({
      id: "text-generation",
      status: "pass",
    })
    await expect(
      apiVerificationProbeRegistry["tool-calling"].run(baseParams),
    ).resolves.toEqual({
      id: "tool-calling",
      status: "pass",
    })
    await expect(
      apiVerificationProbeRegistry["structured-output"].run(baseParams),
    ).resolves.toEqual({
      id: "structured-output",
      status: "pass",
    })
    await expect(
      apiVerificationProbeRegistry["web-search"].run(baseParams),
    ).resolves.toEqual({
      id: "web-search",
      status: "pass",
    })

    expect(registryMocks.runModelsProbe).toHaveBeenCalledWith({
      baseUrl: "https://proxy.example.com",
      apiKey: "sk-secret",
      apiType: "openai",
    })
    expect(registryMocks.runTextGenerationProbe).toHaveBeenCalledWith(
      baseParams,
    )
    expect(registryMocks.runToolCallingProbe).toHaveBeenCalledWith(baseParams)
    expect(registryMocks.runStructuredOutputProbe).toHaveBeenCalledWith(
      baseParams,
    )
    expect(registryMocks.runWebSearchProbe).toHaveBeenCalledWith(baseParams)
  })
})
