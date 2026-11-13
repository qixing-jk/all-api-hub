import { APICallError } from "ai"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SDK_GENERATION_CHUNK_TYPES } from "~/services/verification/aiApiVerification/generationTrace"

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}))

vi.mock("ai", async (importOriginal) => ({
  APICallError: (await importOriginal<typeof import("ai")>()).APICallError,
  generateText: mocks.generateText,
  streamText: mocks.streamText,
}))

describe("runProbeGeneration", () => {
  it("keeps completed non-streaming steps when a later agent request fails", async () => {
    const onProgress = vi.fn()
    const onStepEnd = vi.fn()
    mocks.generateText.mockImplementationOnce(async (options) => {
      await options.onStepEnd({
        content: [{ type: "text", text: "Completed first step" }],
      })
      throw new Error("Second request failed")
    })
    const { runProbeGeneration } =
      await import("~/services/verification/aiApiVerification/probes/probeGeneration")
    await expect(
      runProbeGeneration(
        { model: {} as never, prompt: "test", onProgress, onStepEnd },
        "non-streaming",
      ),
    ).rejects.toThrow("Second request failed")
    expect(onStepEnd).toHaveBeenCalledOnce()
    expect(onProgress.mock.calls.at(-1)![0].parts).toMatchObject([
      { type: "text", text: "Completed first step" },
      { type: "error", text: "Second request failed" },
    ])
  })

  it("retains and redacts failed tool evidence and the stream error after partial output", async () => {
    const { createSafeGenerationProgressCallback } =
      await import("~/services/verification/aiApiVerification/generationProgress")
    const onProgress = vi.fn()
    mocks.streamText.mockImplementationOnce((options) => ({
      text: Promise.resolve().then(async () => {
        await options.onChunk({
          chunk: {
            type: SDK_GENERATION_CHUNK_TYPES.TextDelta,
            id: "text",
            text: "Partial secret-key",
          },
        })
        await options.onChunk({
          chunk: {
            type: SDK_GENERATION_CHUNK_TYPES.ToolCall,
            toolCallId: "a",
            toolName: "secret-key",
            input: { value: "secret-key" },
          },
        })
        await options.onChunk({
          chunk: {
            type: SDK_GENERATION_CHUNK_TYPES.ToolError,
            toolCallId: "a",
            toolName: "secret-key",
            error: new Error("tool failed secret-key"),
          },
        })
        options.onError({ error: new Error("transport failed secret-key") })
        return "Partial secret-key"
      }),
      finishReason: Promise.resolve("error"),
    }))
    const { runProbeGeneration } =
      await import("~/services/verification/aiApiVerification/probes/probeGeneration")
    await expect(
      runProbeGeneration({
        model: {} as never,
        prompt: "test",
        onProgress: createSafeGenerationProgressCallback(onProgress, [
          "secret-key",
        ]),
      }),
    ).rejects.toThrow("transport failed")
    const progress = onProgress.mock.calls.at(-1)![0]
    expect(progress.parts).toMatchObject([
      { type: "text" },
      {
        type: "tool",
        state: "output-error",
        output: expect.stringContaining("tool failed"),
      },
      { type: "error", text: expect.stringContaining("transport failed") },
    ])
    expect(JSON.stringify(onProgress.mock.calls)).not.toContain("secret-key")
  })

  it("publishes ordered non-streaming steps including reasoning and tool results", async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: "Done",
      finishReason: "stop",
      steps: [
        {
          content: [
            { type: "reasoning", text: "Plan" },
            {
              type: SDK_GENERATION_CHUNK_TYPES.ToolCall,
              toolCallId: "a",
              toolName: "read_file",
              input: { path: "a.txt" },
            },
            {
              type: SDK_GENERATION_CHUNK_TYPES.ToolResult,
              toolCallId: "a",
              toolName: "read_file",
              output: "found",
            },
          ],
        },
        { content: [{ type: "text", text: "Done" }] },
      ],
    })
    const onProgress = vi.fn()
    const { runProbeGeneration } =
      await import("~/services/verification/aiApiVerification/probes/probeGeneration")
    await runProbeGeneration(
      { model: {} as never, prompt: "test", onProgress },
      "non-streaming",
    )
    expect(onProgress.mock.calls.at(-1)![0].parts).toMatchObject([
      { type: "reasoning", text: "Plan", step: 1 },
      {
        type: "tool",
        name: "read_file",
        output: '"found"',
        state: "output-available",
        step: 1,
      },
      { type: "text", text: "Done", step: 2 },
    ])
  })

  it("retains interleaved reasoning, text and tool evidence without moving calls when results arrive", async () => {
    let complete!: (value: string) => void
    const text = new Promise<string>((resolve) => {
      complete = resolve
    })
    let push!: (event: { chunk: Record<string, unknown> }) => Promise<void>
    mocks.streamText.mockImplementationOnce((options) => {
      push = options.onChunk
      return { text, finishReason: Promise.resolve("stop") }
    })
    const onProgress = vi.fn()
    const { runProbeGeneration } =
      await import("~/services/verification/aiApiVerification/probes/probeGeneration")
    const running = runProbeGeneration({
      model: {} as never,
      prompt: "test",
      onProgress,
    })
    await push({
      chunk: {
        type: SDK_GENERATION_CHUNK_TYPES.ReasoningDelta,
        id: "r1",
        text: "First thought",
      },
    })
    await push({
      chunk: {
        type: SDK_GENERATION_CHUNK_TYPES.TextDelta,
        id: "t1",
        text: "Checking",
      },
    })
    await push({
      chunk: {
        type: SDK_GENERATION_CHUNK_TYPES.TextDelta,
        id: "t1",
        text: " now",
      },
    })
    await push({
      chunk: {
        type: SDK_GENERATION_CHUNK_TYPES.ToolInputStart,
        id: "a",
        toolName: "lookup",
      },
    })
    await push({
      chunk: {
        type: SDK_GENERATION_CHUNK_TYPES.ToolInputDelta,
        id: "a",
        delta: '{"city":"A"}',
      },
    })
    await push({
      chunk: {
        type: SDK_GENERATION_CHUNK_TYPES.ToolCall,
        toolCallId: "a",
        toolName: "lookup",
        input: { city: "A" },
      },
    })
    await push({
      chunk: {
        type: SDK_GENERATION_CHUNK_TYPES.ToolCall,
        toolCallId: "b",
        toolName: "lookup",
        input: { city: "B" },
      },
    })
    const beforeResults = onProgress.mock.calls.at(-1)![0]
    await push({
      chunk: {
        type: SDK_GENERATION_CHUNK_TYPES.ToolResult,
        toolCallId: "b",
        toolName: "lookup",
        output: "partial",
        preliminary: true,
      },
    })
    expect(onProgress.mock.calls.at(-1)![0].parts[3]).toMatchObject({
      output: '"partial"',
      state: "input-available",
    })
    await push({
      chunk: {
        type: SDK_GENERATION_CHUNK_TYPES.ToolResult,
        toolCallId: "b",
        toolName: "lookup",
        output: false,
      },
    })
    await push({
      chunk: {
        type: SDK_GENERATION_CHUNK_TYPES.ToolResult,
        toolCallId: "a",
        toolName: "lookup",
        output: { value: 0 },
      },
    })
    await push({ chunk: { type: SDK_GENERATION_CHUNK_TYPES.StartStep } })
    await push({
      chunk: {
        type: SDK_GENERATION_CHUNK_TYPES.ReasoningDelta,
        id: "r1",
        text: "Second thought",
      },
    })
    await push({
      chunk: {
        type: SDK_GENERATION_CHUNK_TYPES.TextDelta,
        id: "t1",
        text: "Final answer",
      },
    })
    complete("Final answer")
    await running
    expect(onProgress.mock.calls.at(-1)![0].parts).toMatchObject([
      { type: "reasoning", text: "First thought", step: 1 },
      { type: "text", text: "Checking now", step: 1 },
      {
        type: "tool",
        toolCallId: "a",
        input: '{"city":"A"}',
        output: '{"value":0}',
        state: "output-available",
      },
      {
        type: "tool",
        toolCallId: "b",
        input: '{"city":"B"}',
        output: "false",
        state: "output-available",
      },
      { type: "reasoning", text: "Second thought", step: 2 },
      { type: "text", text: "Final answer", step: 2 },
    ])
    expect(beforeResults.parts[2]).not.toHaveProperty("output")
  })

  it("publishes incremental text before completion while retaining the caller's chunk callback", async () => {
    let complete!: (value: string) => void
    const text = new Promise<string>((resolve) => {
      complete = resolve
    })
    let push!: (event: {
      chunk: { type: string; text: string }
    }) => Promise<void>
    mocks.streamText.mockImplementationOnce((options) => {
      push = options.onChunk
      return { text, finishReason: Promise.resolve("stop") }
    })
    const onProgress = vi.fn()
    const onChunk = vi.fn()
    const { runProbeGeneration } =
      await import("~/services/verification/aiApiVerification/probes/probeGeneration")
    const running = runProbeGeneration({
      model: {} as never,
      prompt: "test",
      onProgress,
      onChunk,
    })
    await push({
      chunk: { type: SDK_GENERATION_CHUNK_TYPES.TextDelta, text: "Hello" },
    })
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: "Hello" }),
    )
    await push({
      chunk: { type: SDK_GENERATION_CHUNK_TYPES.TextDelta, text: " world" },
    })
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: "Hello world" }),
    )
    expect(onChunk).toHaveBeenCalledTimes(2)
    complete("Hello world")
    await expect(running).resolves.toMatchObject({ text: "Hello world" })
  })

  it("exposes SDK step metrics without replacing missing token usage with zero", async () => {
    mocks.streamText.mockReturnValueOnce({
      text: Promise.resolve("OK"),
      finishReason: Promise.resolve("stop"),
      steps: Promise.resolve([
        {
          performance: {
            responseTimeMs: 2400,
            timeToFirstOutputMs: 400,
            outputTokensPerSecond: 12.5,
            effectiveOutputTokensPerSecond: 10.4,
          },
          usage: { inputTokens: 30, outputTokens: 25 },
        },
        {
          performance: {
            responseTimeMs: 500,
            timeToFirstOutputMs: 200,
            outputTokensPerSecond: 0,
          },
          usage: {},
        },
      ]),
    })
    const { runProbeGeneration } =
      await import("~/services/verification/aiApiVerification/probes/probeGeneration")
    const result = await runProbeGeneration({
      model: {} as never,
      prompt: "test",
    })
    expect(result.metrics).toEqual([
      {
        responseTimeMs: 2400,
        timeToFirstOutputMs: 400,
        outputTokensPerSecond: 12.5,
        effectiveOutputTokensPerSecond: 10.4,
        inputTokens: 30,
        outputTokens: 25,
      },
      { responseTimeMs: 500, timeToFirstOutputMs: 200 },
    ])
  })

  it("retains usage and completion reasons for capacity measurements", async () => {
    const usage = { inputTokens: 1234, outputTokens: 2 }
    mocks.generateText.mockResolvedValueOnce({
      text: "OK",
      usage,
      finishReason: "stop",
      rawFinishReason: "end_turn",
    })
    const { runProbeGeneration } =
      await import("~/services/verification/aiApiVerification/probes/probeGeneration")
    const result = await runProbeGeneration(
      { model: {} as never, prompt: "test" },
      "non-streaming",
    )
    expect(result).toMatchObject({
      usage,
      finishReason: "stop",
      rawFinishReason: "end_turn",
    })
  })
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it.each([
    new TypeError("Failed to fetch"),
    new Error("Stream must be set to true"),
    new APICallError({
      message: "Stream must be set to true",
      url: "https://example.invalid/v1/responses",
      requestBodyValues: {},
      statusCode: 400,
    }),
  ])(
    "preserves non-streaming failures without changing the selected mode: %s",
    async (error) => {
      mocks.generateText.mockRejectedValueOnce(error)

      const { runProbeGeneration } =
        await import("~/services/verification/aiApiVerification/probes/probeGeneration")

      await expect(
        runProbeGeneration(
          { model: {} as never, prompt: "test" },
          "non-streaming",
        ),
      ).rejects.toBe(error)
      expect(mocks.streamText).not.toHaveBeenCalled()
    },
  )

  it("preserves caller cancellation when a non-streaming request is rejected", async () => {
    const controller = new AbortController()
    const abortError = new DOMException("Aborted", "AbortError")
    mocks.generateText.mockImplementationOnce(async () => {
      controller.abort(abortError)
      throw new APICallError({
        message: "Stream must be set to true",
        url: "https://example.invalid/v1/responses",
        requestBodyValues: {},
        statusCode: 400,
      })
    })

    const { runProbeGeneration } =
      await import("~/services/verification/aiApiVerification/probes/probeGeneration")

    await expect(
      runProbeGeneration(
        {
          model: {} as never,
          prompt: "test",
          abortSignal: controller.signal,
        },
        "non-streaming",
      ),
    ).rejects.toBe(abortError)
    expect(mocks.streamText).not.toHaveBeenCalled()
  })

  it("does not accept partial stream output after caller cancellation", async () => {
    const controller = new AbortController()
    const abortError = new DOMException("Aborted", "AbortError")
    mocks.streamText.mockImplementationOnce(() => ({
      output: Promise.resolve("OK"),
      text: Promise.resolve("OK").then((text) => {
        controller.abort(abortError)
        return text
      }),
      toolCalls: Promise.resolve([]),
      toolResults: Promise.resolve([]),
      sources: Promise.resolve([]),
      finishReason: Promise.resolve("other"),
    }))

    const { runProbeGeneration } =
      await import("~/services/verification/aiApiVerification/probes/probeGeneration")

    await expect(
      runProbeGeneration({
        model: {} as never,
        prompt: "test",
        abortSignal: controller.signal,
      }),
    ).rejects.toBe(abortError)
    expect(mocks.streamText).toHaveBeenCalledOnce()
  })

  it("rejects partial output when the stream reports an error", async () => {
    const streamError = new Error("synthetic stream failure")
    mocks.streamText.mockImplementationOnce(
      (options: { onError?: (event: { error: unknown }) => void }) => {
        return {
          output: Promise.resolve(undefined),
          text: Promise.resolve("partial").then((text) => {
            options.onError?.({ error: streamError })
            return text
          }),
          toolCalls: Promise.resolve([]),
          toolResults: Promise.resolve([]),
          sources: Promise.resolve([]),
          finishReason: Promise.resolve("error"),
        }
      },
    )

    const { runProbeGeneration } =
      await import("~/services/verification/aiApiVerification/probes/probeGeneration")

    await expect(
      runProbeGeneration({ model: {} as never, prompt: "test" }),
    ).rejects.toBe(streamError)
  })

  it("rejects an error finish without a reported error object", async () => {
    mocks.streamText.mockReturnValueOnce({
      output: Promise.resolve(undefined),
      text: Promise.resolve("partial"),
      toolCalls: Promise.resolve([]),
      toolResults: Promise.resolve([]),
      sources: Promise.resolve([]),
      finishReason: Promise.resolve("error"),
    })

    const { runProbeGeneration } =
      await import("~/services/verification/aiApiVerification/probes/probeGeneration")

    await expect(
      runProbeGeneration({ model: {} as never, prompt: "test" }),
    ).rejects.toThrow("AI generation stream failed")
  })
})
