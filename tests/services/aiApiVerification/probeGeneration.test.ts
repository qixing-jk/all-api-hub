import { APICallError } from "ai"
import { beforeEach, describe, expect, it, vi } from "vitest"

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

      const { runProbeGeneration } = await import(
        "~/services/verification/aiApiVerification/probes/probeGeneration"
      )

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

    const { runProbeGeneration } = await import(
      "~/services/verification/aiApiVerification/probes/probeGeneration"
    )

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

    const { runProbeGeneration } = await import(
      "~/services/verification/aiApiVerification/probes/probeGeneration"
    )

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

    const { runProbeGeneration } = await import(
      "~/services/verification/aiApiVerification/probes/probeGeneration"
    )

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

    const { runProbeGeneration } = await import(
      "~/services/verification/aiApiVerification/probes/probeGeneration"
    )

    await expect(
      runProbeGeneration({ model: {} as never, prompt: "test" }),
    ).rejects.toThrow("AI generation stream failed")
  })
})
