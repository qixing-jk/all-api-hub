import { APICallError, StreamProviderError } from "ai"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { modelMetadataService } from "~/services/models/modelMetadata"
import { MODEL_METADATA_URL } from "~/services/models/modelMetadata/constants"
import { runContextCapacity } from "~/services/verification/modelQuality/contextCapacityRun"
import { classifyContextError } from "~/services/verification/modelQuality/contextErrors"
import { preloadContextTokens } from "~~/tests/test-utils/contextTokens"

beforeAll(preloadContextTokens)

// Original report: https://github.com/anomalyco/opencode/issues/1000
const GROQ_OUTPUT_LIMIT =
  "`max_tokens` must be less than or equal to `16384`, the maximum value for `max_tokens` is less than the `context_window` for this model"

describe("capacity request outcomes", () => {
  it.each([
    {
      name: "response.failed",
      status: 200,
      code: "model_context_window_exceeded",
      outcome: "context-limit",
      prefix: "",
    },
    {
      name: "before output",
      status: 200,
      code: "model_context_window_exceeded",
      outcome: "context-limit",
      prefix: "",
    },
    {
      name: "after output",
      status: 200,
      code: "model_context_window_exceeded",
      outcome: "context-limit",
      prefix:
        'data: {"type":"response.output_item.added","output_index":0,"item":{"id":"msg_1","type":"message","role":"assistant","content":[]}}\n\ndata: {"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":"partial"}\n\n',
    },
    {
      name: "a real HTTP 500",
      status: 500,
      code: "model_context_window_exceeded",
      outcome: "inconclusive",
      prefix: "",
    },
    {
      name: "an explicit streamed 500",
      message: "prompt is too long",
      status: 200,
      code: "500",
      outcome: "inconclusive",
      prefix: "",
    },
    {
      name: "an unrelated server error",
      message: "prompt is too long",
      status: 200,
      code: "server_error",
      outcome: "inconclusive",
      prefix: "",
    },
  ])(
    "classifies Responses errors with transport evidence: $name",
    async ({
      name,
      status,
      code,
      outcome,
      prefix,
      message = "Input rejected",
    }) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: unknown) =>
          String(url) === MODEL_METADATA_URL
            ? Response.json({ models: [] })
            : new Response(
                prefix +
                  `data: ${JSON.stringify(name === "response.failed" ? { type: "response.failed", sequence_number: 1, response: { error: { code, message } } } : { type: "error", sequence_number: 1, code, message, param: null })}\n\n`,
                { status, headers: { "Content-Type": "text/event-stream" } },
              ),
        ),
      )
      const result = await runContextCapacity({
        baseUrl: "https://example.invalid",
        apiKey: "test-key",
        apiType: "openai",
        modelId: "test",
        maxInputTokens: 1024,
        mode: "streaming",
        abortSignal: new AbortController().signal,
      })
      expect(result.attempts).toMatchObject([{ outcome }])
      if (outcome === "context-limit")
        expect(result.upperBoundTokens).toBeGreaterThan(0)
      else expect(result.upperBoundTokens).toBeUndefined()
    },
  )
  it.each([
    {
      // Derived gateway fixture: exercise SDK parsing, not a constructed error.
      name: "a nested upstream code preserved through SDK parsing",
      error: {
        message: "Provider rejected input",
        code: "upstream_error",
        innererror: { code: "context_length_exceeded" },
      },
    },
    {
      name: "the reported upstream rejection",
      error: {
        message:
          'This endpoint\'s maximum context length is 1000000 tokens. However, you requested about 1290675 tokens (1290547 of text input, 128 in the output). Please reduce the length of either one, or use the context-compression plugin to compress your prompt automatically. ({"provider_name":null})',
        type: "upstream_error",
        param: "",
        code: 400,
        metadata: { provider_name: null },
      },
    },
    {
      // OpenAI's structured overflow code; the SSE envelope is a derived fixture.
      name: "a structured overflow code without a status",
      error: {
        message: "Input rejected",
        type: "invalid_request_error",
        code: "context_length_exceeded",
      },
    },
    {
      name: "the reported message split across lines",
      error: {
        message:
          "This endpoint's maximum context length is 1000000 tokens.\nHowever, you requested about 1290675 tokens.",
        code: 400,
      },
    },
    // Provider wording from @opencode/ai@2.2.6 provider-error.js;
    // replayed in a compatible SSE envelope, not a live provider capture.
    { name: "Z.ai wording", error: { message: "Prompt 超长", code: "1261" } },
    {
      name: "Bedrock Nova wording",
      error: { message: "number of input tokens exceeds maximum length" },
    },
  ])("reduces input after SSE keepalive comments: $name", async ({ error }) => {
    let providerRequests = 0
    const fetch = vi.fn(async (url: unknown) =>
      String(url) === MODEL_METADATA_URL
        ? Response.json({ models: [] })
        : ++providerRequests === 1
          ? new Response(
              ": PING\n\n".repeat(12) +
                `data: ${JSON.stringify({ error })}\n\ndata: [DONE]\n\n`,
              { headers: { "Content-Type": "text/event-stream" } },
            )
          : new Response(
              `data: ${JSON.stringify({
                choices: [
                  { index: 0, delta: { content: "OK" }, finish_reason: "stop" },
                ],
              })}\n\ndata: [DONE]\n\n`,
              { headers: { "Content-Type": "text/event-stream" } },
            ),
    )
    vi.stubGlobal("fetch", fetch)
    const result = await runContextCapacity({
      baseUrl: "https://example.invalid",
      apiKey: "test-key",
      apiType: "openai-compatible",
      modelId: "test",
      maxInputTokens: 2048,
      mode: "streaming",
      abortSignal: new AbortController().signal,
    })
    expect(result.attempts).toMatchObject([
      { targetTokens: 2048, outcome: "context-limit" },
      { targetTokens: 1024, outcome: "accepted" },
      { targetTokens: 1024, outcome: "accepted" },
    ])
    expect(result.reason).toBe("bracketed")
    expect(result.lowerBoundTokens).toBeGreaterThan(0)
    expect(result.upperBoundTokens).toBeGreaterThan(result.lowerBoundTokens)
    expect(fetch).toHaveBeenCalledTimes(4)
  })
  it.each([
    { code: 422, message: "prompt is too long", outcome: "context-limit" },
    { code: 400, message: GROQ_OUTPUT_LIMIT, outcome: "inconclusive" },
    { code: 401, message: "Invalid API key", outcome: "inconclusive" },
    { code: 403, message: "Permission denied", outcome: "inconclusive" },
    { code: 413, message: "Payload too large", outcome: "inconclusive" },
    {
      code: 429,
      message: "Rate limit reached for tokens per minute",
      outcome: "inconclusive",
    },
    { code: 500, message: "Internal server error", outcome: "inconclusive" },
    { code: 504, message: "Gateway timed out", outcome: "inconclusive" },
  ])(
    "classifies streamed provider failures: $code $message",
    async ({ code, message, outcome }) => {
      const fetch = vi.fn(async (url: unknown) =>
        String(url) === MODEL_METADATA_URL
          ? Response.json({ models: [] })
          : new Response(
              `data: ${JSON.stringify({ error: { message, code } })}\n\ndata: [DONE]\n\n`,
              { headers: { "Content-Type": "text/event-stream" } },
            ),
      )
      vi.stubGlobal("fetch", fetch)
      const result = await runContextCapacity({
        baseUrl: "https://example.invalid",
        apiKey: "test-key",
        apiType: "openai-compatible",
        modelId: "test",
        maxInputTokens: 1024,
        mode: "streaming",
        abortSignal: new AbortController().signal,
      })
      expect(result.attempts).toMatchObject([{ outcome }])
      expect(result.lowerBoundTokens).toBe(0)
      if (outcome === "context-limit") {
        expect(result.upperBoundTokens).toBeGreaterThan(0)
      } else {
        expect(result.upperBoundTokens).toBeUndefined()
      }
      expect(fetch).toHaveBeenCalledTimes(2)
    },
  )
  it("reports an upstream timeout without claiming a capacity rejection or retrying", async () => {
    const fetch = vi.fn(async (url: unknown) =>
      String(url) === MODEL_METADATA_URL
        ? Response.json({ models: [] })
        : Response.json(
            { error: { message: "Gateway timed out" } },
            { status: 504 },
          ),
    )
    vi.stubGlobal("fetch", fetch)
    const result = await runContextCapacity({
      baseUrl: "https://example.invalid",
      apiKey: "test-key",
      apiType: "openai-compatible",
      modelId: "test",
      maxInputTokens: 1024,
      abortSignal: new AbortController().signal,
    })
    expect(result).toMatchObject({
      reason: "inconclusive",
      lowerBoundTokens: 0,
      attempts: [{ outcome: "inconclusive", failureReason: "timeout" }],
    })
    expect(result.upperBoundTokens).toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it("waits for the caller to stop instead of installing a local request deadline", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout")
    const controller = new AbortController()
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (String(url) === MODEL_METADATA_URL)
          return Response.json({ models: [] })
        controller.abort()
        throw controller.signal.reason
      }),
    )
    try {
      const result = await runContextCapacity({
        baseUrl: "https://example.invalid",
        apiKey: "test-key",
        apiType: "openai-compatible",
        modelId: "test",
        maxInputTokens: 1024,
        abortSignal: controller.signal,
      })
      expect(result.reason).toBe("stopped")
      expect(result.lowerBoundTokens).toBe(0)
      expect(timeout).not.toHaveBeenCalled()
    } finally {
      timeout.mockRestore()
    }
  })
  it.each([
    { finish: "length", input: undefined },
    { finish: "stop", input: 131004 },
    { finish: "content_filter", input: 131004 },
  ])(
    "keeps an empty response without acceptance evidence inconclusive: %j",
    async ({ finish, input }) => {
      modelMetadataService.clearCache()
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: unknown) =>
          String(url) === MODEL_METADATA_URL
            ? Response.json({ models: [] })
            : Response.json({
                id: "capacity",
                object: "chat.completion",
                created: 1,
                model: "test",
                choices: [
                  {
                    index: 0,
                    message: { role: "assistant", content: "" },
                    finish_reason: finish,
                  },
                ],
                ...(input
                  ? {
                      usage: {
                        prompt_tokens: input,
                        completion_tokens: 68,
                        total_tokens: input + 68,
                      },
                    }
                  : {}),
              }),
        ),
      )
      const result = await runContextCapacity({
        baseUrl: "https://example.invalid",
        apiKey: "test-key",
        apiType: "openai-compatible",
        modelId: "test",
        maxInputTokens: 1024,
        mode: "non-streaming",
        abortSignal: new AbortController().signal,
      })
      expect(result).toMatchObject({
        reason: "inconclusive",
        lowerBoundTokens: 0,
      })
      expect(result.upperBoundTokens).toBeUndefined()
      expect(result.attempts[0]?.finishReason).toBe(
        finish === "content_filter" ? "content-filter" : finish,
      )
    },
  )
  it("accepts reasoning-only streaming output truncated at the length limit", async () => {
    modelMetadataService.clearCache()
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (String(url) === MODEL_METADATA_URL)
          return Response.json({ models: [] })
        const chunk = (choices: unknown[], usage?: unknown) =>
          `data: ${JSON.stringify({ id: "chatcmpl-capacity", object: "chat.completion.chunk", created: 1, model: "gpt-oss-20b", choices, ...(usage ? { usage } : {}) })}\n\n`
        return new Response(
          chunk([{ index: 0, delta: { role: "assistant", content: "" } }]) +
            chunk([
              { index: 0, delta: { reasoning: "Analyzing reference text" } },
            ]) +
            chunk([{ index: 0, delta: {}, finish_reason: "length" }]) +
            chunk([], {
              prompt_tokens: 131004,
              completion_tokens: 68,
              total_tokens: 131072,
            }) +
            "data: [DONE]\n\n",
          { headers: { "Content-Type": "text/event-stream" } },
        )
      }),
    )
    const result = await runContextCapacity({
      baseUrl: "https://example.invalid",
      apiKey: "test-key",
      apiType: "openai-compatible",
      modelId: "gpt-oss-20b",
      maxInputTokens: 131004,
      mode: "streaming",
      abortSignal: new AbortController().signal,
    })
    expect(result.reason).toBe("test-limit")
    expect(result.mode).toBe("streaming")
    expect(result.latencyMs).toBeGreaterThan(0)
    expect(result.lowerBoundTokens).toBeGreaterThan(0)
    expect(result.upperBoundTokens).toBeUndefined()
    expect(result.attempts[0]).toMatchObject({
      outcome: "accepted",
      inputTokens: 131004,
      outputTokens: 68,
      finishReason: "length",
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    modelMetadataService.clearCache()
  })

  it("refuses continuation when model metadata changes the token counter", async () => {
    modelMetadataService.clearCache()
    const fetch = vi.fn(async () => Response.json({ models: [] }))
    vi.stubGlobal("fetch", fetch)
    await expect(
      runContextCapacity({
        baseUrl: "https://example.invalid",
        apiKey: "test-key",
        apiType: "openai-compatible",
        modelId: "unknown-model",
        abortSignal: new AbortController().signal,
        resumeFrom: {
          reason: "budget",
          lowerBoundTokens: 0,
          attempts: [],
          inputLimit: 8192,
          counter: { encoding: "cl100k_base", estimated: true },
        },
      }),
    ).rejects.toThrow("token counter changed")
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(MODEL_METADATA_URL)
  })

  it.each([
    [{ input: 4096, context: 8192 }, 4096],
    [{ context: 8192 }, 8064],
    [{ context: 1048576 }, 1048448],
    [{}, 1048576],
    [{ input: -1, context: 0 }, 1048576],
  ])(
    "uses declared limits %j as a starting hint within the test cap",
    async (limits, initial) => {
      modelMetadataService.clearCache()
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: unknown) => {
          if (String(url) === MODEL_METADATA_URL)
            return Response.json({
              models: [{ id: "openai/gpt-4", provider_id: "openai", limits }],
            })
          return Response.json({
            id: "capacity",
            object: "chat.completion",
            created: 1,
            model: "gpt-4",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "OK" },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 1000,
              completion_tokens: 1,
              total_tokens: 1001,
            },
          })
        }),
      )
      const result = await runContextCapacity({
        baseUrl: "https://example.invalid",
        apiKey: "test-key",
        apiType: "openai-compatible",
        modelId: "openai/gpt-4",
        mode: "non-streaming",
        abortSignal: new AbortController().signal,
      })
      expect(result.attempts[0]?.targetTokens).toBe(initial)
      expect(result.upperBoundTokens).toBeUndefined()
      expect(result.reason).toBe("test-limit")
    },
  )
  it("recognizes an explicit input token count limit", () => {
    const error = new APICallError({
      message:
        "The input token count (9000) exceeds the maximum number of tokens allowed (8192).",
      statusCode: 400,
      url: "https://example.invalid",
      requestBodyValues: {},
    })
    expect(classifyContextError(error)).toBe("context-limit")
  })
  it("classifies an already-preserved nested streamed payload", () => {
    // Classification unit check; SDK payload preservation is exercised above.
    const error = new StreamProviderError({
      message: "Provider rejected input",
      code: "upstream_error",
      data: {
        error: {
          code: "upstream_error",
          innererror: { code: "context_length_exceeded" },
        },
      },
    })
    expect(classifyContextError(error)).toBe("context-limit")
  })
  it("does not treat the reported Groq output parameter limit as input overflow", () => {
    const error = new APICallError({
      message: GROQ_OUTPUT_LIMIT,
      statusCode: 400,
      url: "https://example.invalid",
      requestBodyValues: {},
    })
    expect(classifyContextError(error)).toBe("inconclusive")
  })
  it.each([
    {
      name: "Cloudflare's context-specific 413",
      statusCode: 413,
      message: "exceeded this model context window limit",
    },
    {
      name: "an upstream code retained only in the HTTP body",
      statusCode: 400,
      message: "Provider rejected input",
      responseBody: JSON.stringify({
        error: { innererror: { code: "context_length_exceeded" } },
      }),
    },
    {
      name: "an upstream code retained only in parsed HTTP data",
      statusCode: 400,
      message: "Provider rejected input",
      data: { error: { code: "model_context_window_exceeded" } },
    },
    {
      // Anthropic's byte limit is recoverable overflow in OpenCode. This bounds
      // the current connection's accepted input, not the model's token window.
      name: "a recoverable request_too_large code",
      statusCode: 413,
      message: "Request exceeds the maximum allowed number of bytes",
      data: { error: { type: "request_too_large" } },
    },
  ])("recognizes $name", ({ name: _name, ...failure }) => {
    expect(
      classifyContextError(
        new APICallError({
          ...failure,
          url: "https://example.invalid",
          requestBodyValues: {},
        }),
      ),
    ).toBe("context-limit")
  })
  it.each([
    { statusCode: 401, message: "Invalid API key" },
    { statusCode: 403, message: "Permission denied" },
    { statusCode: 413, message: "Payload too large" },
    { statusCode: 429, message: "Rate limit reached for tokens per minute" },
    { statusCode: 500, message: "Internal server error" },
    { statusCode: 400, message: "" },
    { message: "Unknown provider failure" },
    {
      statusCode: 429,
      message: "Quota exhausted",
      data: { error: { code: "insufficient_quota" } },
    },
  ])(
    "keeps other HTTP failures inconclusive: $statusCode $message",
    (failure) => {
      expect(
        classifyContextError(
          new APICallError({
            ...failure,
            url: "https://example.invalid",
            requestBodyValues: {},
          }),
        ),
      ).toBe("inconclusive")
    },
  )
  it.each([
    new Error("context_length_exceeded"),
    { message: "prompt is too long", statusCode: 400 },
    null,
  ])("does not use non-provider errors as capacity evidence", (error) => {
    expect(classifyContextError(error)).toBe("inconclusive")
  })
})

it.each([false, true])(
  "bounds explicit and resumed input by fixture ceiling: resume=%s",
  async (resume) => {
    const counters =
      await import("~/services/verification/modelQuality/contextCounter")
    const counter = await counters.createContextCounter({ state: "unmatched" })
    const preparePrompt = vi.fn(counter.preparePrompt)
    const spy = vi
      .spyOn(counters, "createContextCounter")
      .mockResolvedValue({ ...counter, maxInputTokens: 2048, preparePrompt })
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) =>
        String(url) === MODEL_METADATA_URL
          ? Response.json({ models: [] })
          : Response.json({
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: "OK" },
                  finish_reason: "stop",
                },
              ],
            }),
      ),
    )
    try {
      const result = await runContextCapacity({
        baseUrl: "https://example.invalid",
        apiKey: "test",
        apiType: "openai-compatible",
        modelId: "test",
        mode: "non-streaming",
        maxInputTokens: 8388608,
        abortSignal: new AbortController().signal,
        ...(resume
          ? {
              resumeFrom: {
                reason: "budget",
                lowerBoundTokens: 0,
                attempts: [],
                inputLimit: 8388608,
                counter: counter.info,
              },
            }
          : {}),
      })
      expect(preparePrompt).toHaveBeenCalledWith(2048, expect.any(AbortSignal))
      expect(result.inputLimit).toBe(2048)
    } finally {
      spy.mockRestore()
      vi.unstubAllGlobals()
      modelMetadataService.clearCache()
    }
  },
)

it("awaits the durable in-flight checkpoint before sending provider input", async () => {
  const calls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      if (String(url) === MODEL_METADATA_URL)
        return Response.json({ models: [] })
      calls.push("provider")
      return Response.json({
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "OK" },
            finish_reason: "stop",
          },
        ],
      })
    }),
  )
  try {
    await runContextCapacity({
      baseUrl: "https://example.invalid",
      apiKey: "test",
      apiType: "openai-compatible",
      modelId: "test",
      mode: "non-streaming",
      maxInputTokens: 1024,
      abortSignal: new AbortController().signal,
      onCheckpoint: async (checkpoint) => {
        await Promise.resolve()
        calls.push(checkpoint.inFlightTarget ? "in-flight" : "completed")
      },
    })
    expect(calls).toEqual(["in-flight", "provider", "completed", "completed"])
  } finally {
    vi.unstubAllGlobals()
    modelMetadataService.clearCache()
  }
})

it.each([0, 8388609, 1.5, Number.NaN])(
  "rejects invalid explicit input %s before resolving metadata",
  async (maxInputTokens) => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    try {
      await expect(
        runContextCapacity({
          baseUrl: "https://example.invalid",
          apiKey: "test",
          apiType: "openai",
          modelId: "test",
          maxInputTokens,
          abortSignal: new AbortController().signal,
        }),
      ).rejects.toThrow("Invalid input limit")
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  },
)
it("rejects an invalid resumed limit before sending provider input", async () => {
  const fetch = vi.fn(async () => Response.json({ models: [] }))
  vi.stubGlobal("fetch", fetch)
  try {
    await expect(
      runContextCapacity({
        baseUrl: "https://example.invalid",
        apiKey: "test",
        apiType: "openai",
        modelId: "test",
        resumeFrom: {
          reason: "budget",
          lowerBoundTokens: 0,
          attempts: [],
          inputLimit: -1,
          counter: { encoding: "o200k_base", estimated: true },
        },
        abortSignal: new AbortController().signal,
      }),
    ).rejects.toThrow("Invalid capacity continuation limit")
    expect(fetch).toHaveBeenCalledTimes(1)
  } finally {
    vi.unstubAllGlobals()
    modelMetadataService.clearCache()
  }
})

it("does not accept generation that resolves after caller cancellation", async () => {
  const generation =
    await import("~/services/verification/aiApiVerification/probes/probeGeneration")
  const controller = new AbortController()
  const run = vi
    .spyOn(generation, "runProbeGeneration")
    .mockImplementationOnce(async () => {
      controller.abort()
      return { text: "OK", finishReason: "stop", usage: {} } as never
    })
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ models: [] })),
  )
  try {
    const result = await runContextCapacity({
      baseUrl: "https://example.invalid",
      apiKey: "test",
      apiType: "openai",
      modelId: "test",
      maxInputTokens: 1024,
      abortSignal: controller.signal,
    })
    expect(result).toMatchObject({
      reason: "stopped",
      lowerBoundTokens: 0,
      attempts: [],
    })
  } finally {
    run.mockRestore()
    vi.unstubAllGlobals()
    modelMetadataService.clearCache()
  }
})
