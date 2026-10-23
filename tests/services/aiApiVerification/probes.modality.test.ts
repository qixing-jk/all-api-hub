import { beforeEach, describe, expect, it, vi } from "vitest"

import { runDecisionProbe } from "~/services/verification/aiApiVerification/probes/decisionProbe"
import { runEmbeddingProbe } from "~/services/verification/aiApiVerification/probes/embeddingProbe"
import { runImageGenerationProbe } from "~/services/verification/aiApiVerification/probes/imageGenerationProbe"
import { runRerankProbe } from "~/services/verification/aiApiVerification/probes/rerankProbe"
import { runVideoGenerationProbe } from "~/services/verification/aiApiVerification/probes/videoGenerationProbe"
import {
  API_TYPES,
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
} from "~/services/verification/aiApiVerification/types"

const mockEmbed = vi.fn()

describe("probes without native Google provider support", () => {
  it.each([
    ["image", runImageGenerationProbe],
    ["rerank", runRerankProbe],
    ["decision", runDecisionProbe],
  ] as const)(
    "does not send an OpenAI-style %s request to a native Google API",
    async (_, run) => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("{}", { status: 404 }))
      try {
        const result = await run({
          baseUrl: "https://generativelanguage.googleapis.com",
          apiKey: "test",
          apiType: API_TYPES.GOOGLE,
          modelId: "test",
        })
        expect(result.status).toBe(API_VERIFICATION_PROBE_STATUSES.Unsupported)
        expect(fetchSpy).not.toHaveBeenCalled()
      } finally {
        fetchSpy.mockRestore()
      }
    },
  )
})

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  embed: (...args: any[]) => mockEmbed(...args),
}))

vi.mock(
  "~/services/verification/aiApiVerification/providers",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/verification/aiApiVerification/providers")
    >()),
    createEmbeddingModel: vi.fn(() => ({ modelId: "test-model" })),
  }),
)

describe("Embedding probe", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("succeeds with valid vector output", async () => {
    mockEmbed.mockResolvedValueOnce({
      embedding: [0.1, 0.2, 0.3, 0.4],
      usage: { tokens: 1 },
    })

    const result = await runEmbeddingProbe({
      baseUrl: "https://example.com/v1",
      apiKey: "sk-test",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      modelId: "bge-large-zh",
    })

    expect(result.id).toBe(API_VERIFICATION_PROBE_IDS.Embedding)
    expect(result.status).toBe(API_VERIFICATION_PROBE_STATUSES.Pass)
    expect(result.summaryKey).toBe("verifyDialog.summaries.embeddingSucceeded")
    expect(result.summaryParams).toEqual({ dimension: 4 })
    expect(result.output).toEqual({ dimension: 4, tokens: 1 })
  })

  it("marks Anthropic as unsupported", async () => {
    const result = await runEmbeddingProbe({
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant",
      apiType: API_TYPES.ANTHROPIC,
      modelId: "voyage-3",
    })

    expect(result.status).toBe(API_VERIFICATION_PROBE_STATUSES.Unsupported)
  })

  it("handles failure and redacts secrets", async () => {
    mockEmbed.mockRejectedValueOnce(
      new Error("API rate limit exceeded with sk-test-secret"),
    )

    const result = await runEmbeddingProbe({
      baseUrl: "https://example.com/v1",
      apiKey: "sk-test-secret",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      modelId: "bge-large-zh",
    })

    expect(result.status).toBe(API_VERIFICATION_PROBE_STATUSES.Fail)
    expect(result.summary).not.toContain("sk-test-secret")
  })
})

describe("Rerank probe", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("succeeds when rerank returns sorted results", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [{ index: 0, relevance_score: 0.98 }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )

    const result = await runRerankProbe({
      baseUrl: "https://example.com/v1",
      apiKey: "sk-test",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      modelId: "bge-reranker-large",
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/v1/rerank",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "bge-reranker-large",
          query: "ping",
          documents: ["ping", "pong"],
        }),
      }),
    )
    expect(result.status).toBe(API_VERIFICATION_PROBE_STATUSES.Pass)
    expect(result.summaryKey).toBe("verifyDialog.summaries.rerankSucceeded")
  })
})

describe("Image generation probe", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("recognizes JPEG base64 when the compatible response omits output_format", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ b64_json: "/9j/2Q==" }] })),
    )
    const result = await runImageGenerationProbe({
      baseUrl: "https://example.com",
      apiKey: "test",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      modelId: "image-model",
    })
    expect(result).toMatchObject({
      media: { type: "image", url: "data:image/jpeg;base64,/9j/2Q==" },
    })
  })

  it.each(["gpt-image-1", "openai/gpt-image-1:free"])(
    "uses a supported low-quality request for %s",
    async (modelId) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ b64_json: "aW1hZ2U=" }] }), {
          status: 200,
        }),
      )
      const result = await runImageGenerationProbe({
        baseUrl: "https://example.com/v1",
        apiKey: "test",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        modelId,
      })
      const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string)
      expect(body).toMatchObject({
        model: modelId,
        size: "1024x1024",
        quality: "low",
        n: 1,
      })
      expect(result.status).toBe(API_VERIFICATION_PROBE_STATUSES.Pass)
      expect(result).toMatchObject({
        media: { type: "image", url: "data:image/png;base64,aW1hZ2U=" },
      })
    },
  )

  it("leaves sizing to the provider for other image model families", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [{ b64_json: "iVBORw0KGgo=" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )

    const result = await runImageGenerationProbe({
      baseUrl: "https://example.com/v1",
      apiKey: "sk-test",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      modelId: "flux-schnell",
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "flux-schnell",
          prompt: "a red dot",
          n: 1,
        }),
      }),
    )
    expect(result.status).toBe(API_VERIFICATION_PROBE_STATUSES.Pass)
    expect(result.summaryKey).toBe(
      "verifyDialog.summaries.imageGenerationSucceeded",
    )
  })

  it("uses 1024x1024 for dall-e-3 models", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [{ b64_json: "iVBORw0KGgo=" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )

    await runImageGenerationProbe({
      baseUrl: "https://example.com/v1",
      apiKey: "sk-test",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      modelId: "dall-e-3",
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/v1/images/generations",
      expect.objectContaining({
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: "a red dot",
          n: 1,
          size: "1024x1024",
          quality: "standard",
        }),
      }),
    )
  })
})

describe("Video generation probe", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    { id: "task-1", status: "failed", error: { message: "Model unavailable" } },
    { status: "failed" },
    { id: "task-1", status: "cancelled" },
    { id: "task-1", error: { message: "Task rejected" } },
    { status: "ok" },
  ])("rejects an unsuccessful or unidentifiable task: %j", async (payload) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(payload), { status: 200 }),
    )
    const result = await runVideoGenerationProbe({
      baseUrl: "https://example.com",
      apiKey: "test",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      modelId: "sora-1",
    })
    expect(result.status).toBe(API_VERIFICATION_PROBE_STATUSES.Fail)
  })

  it("waits for the submitted video task and returns its playable result", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "task_video_123",
            status: "submitted",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            task_id: "task_video_123",
            status: "completed",
            url: "https://example.com/result.mp4",
          }),
          { status: 200 },
        ),
      )

    const result = await runVideoGenerationProbe({
      baseUrl: "https://example.com/v1",
      apiKey: "sk-test",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      modelId: "sora-1",
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/v1/video/generations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "sora-1",
          prompt: "test",
        }),
      }),
    )
    expect(result.status).toBe(API_VERIFICATION_PROBE_STATUSES.Pass)
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "https://example.com/v1/video/generations/task_video_123",
      expect.objectContaining({ method: "GET" }),
    )
    expect(result.summaryKey).toBe(
      "verifyDialog.summaries.videoGenerationSucceeded",
    )
    expect(result).toMatchObject({
      media: { type: "video", url: "https://example.com/result.mp4" },
    })
  })
})

describe("Decision probe", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    { model: "clef" },
    { answers: {} },
    { answers: { ping: null } },
    { result: "" },
    { model: "clef", error: { message: "No answer generated" } },
    { answers: { ping: { noul: 0.9 } }, error: { message: "Rejected" } },
  ])(
    "requires nonempty decision output without an error: %j",
    async (payload) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(payload), { status: 200 }),
      )
      const result = await runDecisionProbe({
        baseUrl: "https://example.com",
        apiKey: "test",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        modelId: "clef",
      })
      expect(result.status).toBe(API_VERIFICATION_PROBE_STATUSES.Fail)
    },
  )

  it("submits minimal ping question to /v1/decisions and passes on answers payload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: "cloudflare/clef",
          answers: {
            ping: {
              type: "noul",
              noul: 0.99,
            },
          },
          usage: { input_tokens: 4 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )

    const result = await runDecisionProbe({
      baseUrl: "https://example.com/v1",
      apiKey: "sk-test",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      modelId: "cloudflare/clef",
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/v1/decisions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          model: "cloudflare/clef",
          state: "ping",
          questions: {
            ping: {
              type: "noul",
              instructions: "Is this a verification test?",
            },
          },
        }),
      }),
    )
    expect(result.id).toBe(API_VERIFICATION_PROBE_IDS.Decision)
    expect(result.status).toBe(API_VERIFICATION_PROBE_STATUSES.Pass)
    expect(result.summaryKey).toBe("verifyDialog.summaries.decisionSucceeded")
    expect(result.output).toBeDefined()
  })

  it("passes on alternative decisions/decision property structure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          decisions: {
            urgent: { yes: 0.95, no: 0.05 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )

    const result = await runDecisionProbe({
      baseUrl: "https://example.com/v1",
      apiKey: "sk-test",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      modelId: "@cf/cloudflare/clef",
    })

    expect(result.status).toBe(API_VERIFICATION_PROBE_STATUSES.Pass)
    expect(result.summaryKey).toBe("verifyDialog.summaries.decisionSucceeded")
  })

  it("fails and redacts secrets when endpoint returns error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: "Invalid model with secret-token sk-super-secret" },
        }),
        { status: 400, statusText: "Bad Request" },
      ),
    )

    const result = await runDecisionProbe({
      baseUrl: "https://example.com/v1",
      apiKey: "sk-super-secret",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      modelId: "cloudflare/clef",
    })

    expect(result.status).toBe(API_VERIFICATION_PROBE_STATUSES.Fail)
    expect(result.summary).not.toContain("sk-super-secret")
  })
})
