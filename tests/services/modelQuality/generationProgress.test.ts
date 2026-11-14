import { afterEach, beforeAll, expect, it, vi } from "vitest"

import { MODEL_METADATA_URL } from "~/services/models/modelMetadata/constants"
import { runContextCapacity } from "~/services/verification/modelQuality/contextCapacityRun"
import { runNeedleTest } from "~/services/verification/modelQuality/needleRun"
import { preloadContextTokens } from "~~/tests/test-utils/contextTokens"

beforeAll(preloadContextTokens)
afterEach(() => vi.unstubAllGlobals())

it.each(["capacity", "needle"] as const)(
  "publishes %s output before the response closes",
  async (kind) => {
    let stream!: ReadableStreamDefaultController<Uint8Array>
    const encode = (text: string) => new TextEncoder().encode(text)
    const event = (
      delta: Record<string, string>,
      finish: string | null = null,
    ) =>
      `data: ${JSON.stringify({ id: "progress", object: "chat.completion.chunk", created: 1, model: "test", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (String(url) === MODEL_METADATA_URL)
          return Response.json({ models: [] })
        return new Response(
          new ReadableStream({
            start(controller) {
              stream = controller
              controller.enqueue(
                encode(event({ role: "assistant", content: "Partial answer" })),
              )
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        )
      }),
    )
    const onProgress = vi.fn()
    const request = {
      baseUrl: "https://progress.invalid",
      apiKey: "secret",
      apiType: "openai-compatible" as const,
      modelId: "test",
      maxInputTokens: 1024,
      mode: "streaming" as const,
      abortSignal: new AbortController().signal,
      onProgress,
    }
    const run =
      kind === "capacity"
        ? runContextCapacity(request)
        : runNeedleTest({
            ...request,
            seed: 123,
            quick: true,
            selection: { depth: 10 },
          })
    try {
      await vi.waitFor(() =>
        expect(JSON.stringify(onProgress.mock.calls)).toContain(
          "Partial answer",
        ),
      )
    } finally {
      stream.enqueue(encode(event({}, "stop") + "data: [DONE]\n\n"))
      stream.close()
      await run
    }
  },
)
