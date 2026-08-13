import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}))

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  streamText: mocks.streamText,
}))

describe("runProbeGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects partial Anthropic output when the stream reports an error", async () => {
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
          finishReason: Promise.resolve("error"),
        }
      },
    )

    const { runProbeGeneration } = await import(
      "~/services/verification/aiApiVerification/probes/probeGeneration"
    )

    await expect(
      runProbeGeneration("anthropic", { model: {} as never, prompt: "test" }),
    ).rejects.toBe(streamError)
  })

  it("rejects an Anthropic error finish without a reported error object", async () => {
    mocks.streamText.mockReturnValueOnce({
      output: Promise.resolve(undefined),
      text: Promise.resolve("partial"),
      toolCalls: Promise.resolve([]),
      toolResults: Promise.resolve([]),
      finishReason: Promise.resolve("error"),
    })

    const { runProbeGeneration } = await import(
      "~/services/verification/aiApiVerification/probes/probeGeneration"
    )

    await expect(
      runProbeGeneration("anthropic", { model: {} as never, prompt: "test" }),
    ).rejects.toThrow("AI generation stream failed")
  })
})
