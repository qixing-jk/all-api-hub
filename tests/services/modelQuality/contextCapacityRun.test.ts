import { APICallError } from "ai"
import { afterEach, describe, expect, it, vi } from "vitest"

import { modelMetadataService } from "~/services/models/modelMetadata"
import { MODEL_METADATA_URL } from "~/services/models/modelMetadata/constants"
import {
  classifyContextError,
  runContextCapacity,
} from "~/services/verification/modelQuality/contextCapacityRun"

describe("capacity request outcomes", () => {
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
  it("does not treat a declared context size in an unrelated error as rejection", () => {
    const error = new APICallError({
      message: "Invalid setting. The maximum context length is 8192 tokens.",
      statusCode: 400,
      url: "https://example.invalid",
      requestBodyValues: {},
    })
    expect(classifyContextError(error)).toBe("inconclusive")
  })
  it("recognizes explicit capacity rejection while keeping rate limits inconclusive", () => {
    const error = (statusCode: number) =>
      new APICallError({
        message: "maximum context length exceeded",
        statusCode,
        url: "https://example.invalid",
        requestBodyValues: {},
      })
    expect(classifyContextError(error(400))).toBe("context-limit")
    expect(classifyContextError(error(429))).toBe("inconclusive")
    expect(classifyContextError(error(413))).toBe("inconclusive")
  })
})

it.each([false, true])(
  "bounds explicit and resumed input by fixture ceiling: resume=%s",
  async (resume) => {
    const counters = await import(
      "~/services/verification/modelQuality/contextCounter"
    )
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
  const generation = await import(
    "~/services/verification/aiApiVerification/probes/probeGeneration"
  )
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
