import { describe, expect, it, vi } from "vitest"

import { modelMetadataService } from "~/services/models/modelMetadata"
import {
  getProbesForModality,
  MODEL_TEST_MODALITIES,
  resolveModelTestModality,
  type ModelModalityResolutionContext,
} from "~/services/verification/aiApiVerification/modelModality"
import { API_VERIFICATION_PROBE_IDS } from "~/services/verification/aiApiVerification/types"

describe("modelModality resolution", () => {
  it.each([":embedContent", ":batchEmbedContents"])(
    "recognizes Google's published %s operation without model-name rules",
    (operation) => {
      expect(
        resolveModelTestModality({
          modelId: "custom-deployment",
          supportedEndpointTypes: [`/v1beta/models/custom${operation}`],
        }),
      ).toBe("embedding")
    },
  )

  it.each(["chat", "responses", "openai", "anthropic", "gemini"])(
    "uses the published %s endpoint ahead of model-name guesses",
    (endpoint) => {
      expect(
        resolveModelTestModality({
          modelId: "bge-chat-deployment",
          supportedEndpointTypes: [endpoint],
        }),
      ).toBe("text")
    },
  )

  it("uses output capabilities to distinguish image generation on a shared chat endpoint", () => {
    expect(
      resolveModelTestModality({
        modelId: "future-deployment",
        supportedEndpointTypes: ["/v1/chat/completions"],
        modalities: { output: ["image"] },
      }),
    ).toBe("image")
  })

  it.each<ModelModalityResolutionContext & { expected: string }>([
    {
      modelId: "embedding-chat-alias",
      supportedEndpointTypes: ["/v1/chat/completions"],
      expected: "text",
    },
    { modelId: "image-alias", presentationKind: "chat", expected: "text" },
    {
      modelId: "bge-chat-alias",
      modalities: { input: ["text"], output: ["text"] },
      expected: "text",
    },
    {
      modelId: "gemini-2.5-flash-image",
      modalities: { input: ["text", "image"], output: ["text", "image"] },
      expected: "image",
    },
    {
      modelId: "remote-sorter",
      modalities: { output: ["rerank"] },
      expected: "rerank",
    },
  ])(
    "prefers explicit output capability over family heuristics: $modelId",
    ({ expected, ...context }) => {
      expect(resolveModelTestModality(context)).toBe(expected)
    },
  )

  it.each([
    ["openai/gpt-image-1:free", "image"],
    ["GPT_IMAGE_1_MINI", "image"],
    ["google/gemini-2.5-flash-image", "image"],
    ["gemini-2.0-flash-preview-image-generation", "image"],
    ["Qwen/Qwen-Image", "image"],
    ["google/embeddinggemma-300m", "embedding"],
    ["MiniMax-Hailuo-02", "video"],
    ["minimax-m2", "text"],
    ["qwen2.5-vl-72b-instruct", "text"],
    ["google/veo-3.1-generate-preview", "video"],
    ["Snowflake/snowflake-arctic-embed-l-v2.0", "embedding"],
    ["Alibaba/wanx2.1-t2i-turbo", "image"],
    ["Alibaba/wan2.1-t2v-plus", "video"],
    ["Alibaba/wanx2.1-t2v-turbo", "video"],
    ["embedding-gateway/gpt-4o", "text"],
    ["rerank-router/claude-sonnet-4", "text"],
    ["my-embeddingless-chat", "text"],
    ["indecision-chat", "text"],
    ["recraft-chatbot", "text"],
  ] as const)(
    "classifies family names without namespace or substring leakage: %s",
    (modelId, expected) => {
      expect(resolveModelTestModality({ modelId })).toBe(expected)
    },
  )

  it("resolves by explicit supportedEndpointTypes", () => {
    expect(
      resolveModelTestModality({
        modelId: "custom-model-1",
        supportedEndpointTypes: ["/v1/embeddings"],
      }),
    ).toBe(MODEL_TEST_MODALITIES.Embedding)

    expect(
      resolveModelTestModality({
        modelId: "custom-model-2",
        supportedEndpointTypes: ["/v1/rerank"],
      }),
    ).toBe(MODEL_TEST_MODALITIES.Rerank)

    expect(
      resolveModelTestModality({
        modelId: "custom-model-3",
        supportedEndpointTypes: ["/v1/images/generations"],
      }),
    ).toBe(MODEL_TEST_MODALITIES.Image)

    expect(
      resolveModelTestModality({
        modelId: "custom-model-4",
        supportedEndpointTypes: ["/v1/video/generations"],
      }),
    ).toBe(MODEL_TEST_MODALITIES.Video)

    expect(
      resolveModelTestModality({
        modelId: "custom-model-5",
        supportedEndpointTypes: ["/v1/decisions"],
      }),
    ).toBe(MODEL_TEST_MODALITIES.Decision)
  })

  it("resolves by presentationKind", () => {
    expect(
      resolveModelTestModality({
        modelId: "model-x",
        presentationKind: "Embedding",
      }),
    ).toBe(MODEL_TEST_MODALITIES.Embedding)

    expect(
      resolveModelTestModality({
        modelId: "model-y",
        presentationKind: "Reranker",
      }),
    ).toBe(MODEL_TEST_MODALITIES.Rerank)

    expect(
      resolveModelTestModality({
        modelId: "model-z",
        presentationKind: "image",
      }),
    ).toBe(MODEL_TEST_MODALITIES.Image)

    expect(
      resolveModelTestModality({
        modelId: "model-w",
        presentationKind: "Decision",
      }),
    ).toBe(MODEL_TEST_MODALITIES.Decision)
  })

  it("resolves by centralized metadata modalities", () => {
    expect(
      resolveModelTestModality({
        modelId: "remote-embed",
        modalities: { input: ["text"], output: ["embedding"] },
      }),
    ).toBe(MODEL_TEST_MODALITIES.Embedding)

    expect(
      resolveModelTestModality({
        modelId: "remote-image",
        modalities: { input: ["text"], output: ["image"] },
      }),
    ).toBe(MODEL_TEST_MODALITIES.Image)

    expect(
      resolveModelTestModality({
        modelId: "remote-video",
        modalities: { input: ["text"], output: ["video"] },
      }),
    ).toBe(MODEL_TEST_MODALITIES.Video)

    expect(
      resolveModelTestModality({
        modelId: "remote-decision",
        modalities: { input: ["text"], output: ["decision"] },
      }),
    ).toBe(MODEL_TEST_MODALITIES.Decision)

    // Multimodal chat: input has image, output has text -> Text
    expect(
      resolveModelTestModality({
        modelId: "multimodal-chat",
        modalities: { input: ["text", "image"], output: ["text"] },
      }),
    ).toBe(MODEL_TEST_MODALITIES.Text)
  })

  it("resolves by looking up modelMetadataService when modalities are omitted", () => {
    vi.spyOn(modelMetadataService, "resolveModelIdentity").mockReturnValueOnce({
      state: "resolved",
      metadata: {
        id: "mock-provider/custom-embed",
        name: "Custom Embed",
        provider_id: "custom",
        modalities: { input: ["text"], output: ["embedding"] },
      },
      match: "exact",
    })

    expect(
      resolveModelTestModality({ modelId: "mock-provider/custom-embed" }),
    ).toBe(MODEL_TEST_MODALITIES.Embedding)
  })

  it("uses remote metadata type and output limits to identify non-text models with text output modality", () => {
    vi.spyOn(modelMetadataService, "resolveModelIdentity").mockReturnValueOnce({
      state: "resolved",
      metadata: {
        id: "baai/bge-reranker-v2-m3",
        name: "BGE Reranker V2 M3",
        provider_id: "baai",
        type: "reranking",
        modalities: { input: ["text"], output: ["text"] },
        limits: { context: 8192, output: 0 },
      },
      match: "exact",
    })

    expect(
      resolveModelTestModality({ modelId: "baai/bge-reranker-v2-m3" }),
    ).toBe(MODEL_TEST_MODALITIES.Rerank)

    vi.spyOn(modelMetadataService, "resolveModelIdentity").mockReturnValueOnce({
      state: "resolved",
      metadata: {
        id: "baai/bge-m3",
        name: "BGE M3",
        provider_id: "baai",
        type: "embedding",
        modalities: { input: ["text"], output: ["text"] },
        limits: { context: 8192, output: 0 },
      },
      match: "exact",
    })

    expect(resolveModelTestModality({ modelId: "baai/bge-m3" })).toBe(
      MODEL_TEST_MODALITIES.Embedding,
    )
  })

  it("resolves by modelId pattern heuristics", () => {
    // Embedding
    expect(
      resolveModelTestModality({ modelId: "text-embedding-3-small" }),
    ).toBe(MODEL_TEST_MODALITIES.Embedding)
    expect(resolveModelTestModality({ modelId: "bge-large-zh-v1.5" })).toBe(
      MODEL_TEST_MODALITIES.Embedding,
    )
    expect(resolveModelTestModality({ modelId: "BAAI/bge-base-en-v1.5" })).toBe(
      MODEL_TEST_MODALITIES.Embedding,
    )
    expect(resolveModelTestModality({ modelId: "BAAI/bge-m3" })).toBe(
      MODEL_TEST_MODALITIES.Embedding,
    )
    expect(
      resolveModelTestModality({ modelId: "BAAI/bge-base-en-v1.5:free" }),
    ).toBe(MODEL_TEST_MODALITIES.Embedding)
    expect(
      resolveModelTestModality({ modelId: "intfloat/multilingual-e5-large" }),
    ).toBe(MODEL_TEST_MODALITIES.Embedding)
    expect(resolveModelTestModality({ modelId: "bce-embedding-base_v1" })).toBe(
      MODEL_TEST_MODALITIES.Embedding,
    )
    expect(resolveModelTestModality({ modelId: "e5-large-v2" })).toBe(
      MODEL_TEST_MODALITIES.Embedding,
    )
    expect(resolveModelTestModality({ modelId: "gte-Qwen2-7B-instruct" })).toBe(
      MODEL_TEST_MODALITIES.Embedding,
    )
    expect(resolveModelTestModality({ modelId: "nomic-embed-text-v1.5" })).toBe(
      MODEL_TEST_MODALITIES.Embedding,
    )
    expect(resolveModelTestModality({ modelId: "cohere/embed-v4.0" })).toBe(
      MODEL_TEST_MODALITIES.Embedding,
    )
    expect(resolveModelTestModality({ modelId: "embed-v4.0" })).toBe(
      MODEL_TEST_MODALITIES.Embedding,
    )

    // Rerank
    expect(resolveModelTestModality({ modelId: "bge-reranker-large" })).toBe(
      MODEL_TEST_MODALITIES.Rerank,
    )
    expect(
      resolveModelTestModality({ modelId: "BAAI/bge-reranker-large" }),
    ).toBe(MODEL_TEST_MODALITIES.Rerank)
    expect(resolveModelTestModality({ modelId: "bce-reranker-base_v1" })).toBe(
      MODEL_TEST_MODALITIES.Rerank,
    )
    expect(resolveModelTestModality({ modelId: "cohere-rerank-v3" })).toBe(
      MODEL_TEST_MODALITIES.Rerank,
    )

    // Image
    expect(resolveModelTestModality({ modelId: "dall-e-3" })).toBe(
      MODEL_TEST_MODALITIES.Image,
    )
    expect(
      resolveModelTestModality({
        modelId: "black-forest-labs/FLUX.1-schnell",
      }),
    ).toBe(MODEL_TEST_MODALITIES.Image)
    expect(resolveModelTestModality({ modelId: "flux-schnell" })).toBe(
      MODEL_TEST_MODALITIES.Image,
    )
    expect(resolveModelTestModality({ modelId: "midjourney" })).toBe(
      MODEL_TEST_MODALITIES.Image,
    )
    expect(resolveModelTestModality({ modelId: "stable-diffusion-xl" })).toBe(
      MODEL_TEST_MODALITIES.Image,
    )

    // Video
    expect(resolveModelTestModality({ modelId: "sora-1" })).toBe(
      MODEL_TEST_MODALITIES.Video,
    )
    expect(resolveModelTestModality({ modelId: "THUDM/cogvideox-5b" })).toBe(
      MODEL_TEST_MODALITIES.Video,
    )
    expect(resolveModelTestModality({ modelId: "kling-v1" })).toBe(
      MODEL_TEST_MODALITIES.Video,
    )
    expect(resolveModelTestModality({ modelId: "runway-gen3" })).toBe(
      MODEL_TEST_MODALITIES.Video,
    )

    // Decision
    expect(resolveModelTestModality({ modelId: "cloudflare/clef" })).toBe(
      MODEL_TEST_MODALITIES.Decision,
    )
    expect(resolveModelTestModality({ modelId: "@cf/cloudflare/clef" })).toBe(
      MODEL_TEST_MODALITIES.Decision,
    )
    expect(
      resolveModelTestModality({ modelId: "@cf/cloudflare/clef-flash" }),
    ).toBe(MODEL_TEST_MODALITIES.Decision)
    expect(resolveModelTestModality({ modelId: "clef-27b" })).toBe(
      MODEL_TEST_MODALITIES.Decision,
    )
    expect(resolveModelTestModality({ modelId: "cloudflare/clef:free" })).toBe(
      MODEL_TEST_MODALITIES.Decision,
    )
    expect(resolveModelTestModality({ modelId: "fast-decision-v1" })).toBe(
      MODEL_TEST_MODALITIES.Decision,
    )
    expect(resolveModelTestModality({ modelId: "typesafe/jev-1.13.0" })).toBe(
      MODEL_TEST_MODALITIES.Decision,
    )
    expect(resolveModelTestModality({ modelId: "typesafe/jev" })).toBe(
      MODEL_TEST_MODALITIES.Decision,
    )
    expect(resolveModelTestModality({ modelId: "jev-1.13.0" })).toBe(
      MODEL_TEST_MODALITIES.Decision,
    )

    // Text fallback
    expect(resolveModelTestModality({ modelId: "gpt-4o" })).toBe(
      MODEL_TEST_MODALITIES.Text,
    )
    expect(resolveModelTestModality({ modelId: "claude-3-7-sonnet" })).toBe(
      MODEL_TEST_MODALITIES.Text,
    )
    expect(resolveModelTestModality({ modelId: "deepseek-chat" })).toBe(
      MODEL_TEST_MODALITIES.Text,
    )
  })
})

describe("getProbesForModality", () => {
  it("returns embedding probes for embedding modality", () => {
    const probes = getProbesForModality(MODEL_TEST_MODALITIES.Embedding)
    expect(probes.map((p) => p.id)).toEqual([
      API_VERIFICATION_PROBE_IDS.Models,
      API_VERIFICATION_PROBE_IDS.Embedding,
    ])
  })

  it("returns rerank probes for rerank modality", () => {
    const probes = getProbesForModality(MODEL_TEST_MODALITIES.Rerank)
    expect(probes.map((p) => p.id)).toEqual([
      API_VERIFICATION_PROBE_IDS.Models,
      API_VERIFICATION_PROBE_IDS.Rerank,
    ])
  })

  it("returns image probes for image modality", () => {
    const probes = getProbesForModality(MODEL_TEST_MODALITIES.Image)
    expect(probes.map((p) => p.id)).toEqual([
      API_VERIFICATION_PROBE_IDS.Models,
      API_VERIFICATION_PROBE_IDS.ImageGeneration,
    ])
  })

  it("returns video probes for video modality", () => {
    const probes = getProbesForModality(MODEL_TEST_MODALITIES.Video)
    expect(probes.map((p) => p.id)).toEqual([
      API_VERIFICATION_PROBE_IDS.Models,
      API_VERIFICATION_PROBE_IDS.VideoGeneration,
    ])
  })

  it("returns decision probes for decision modality", () => {
    const probes = getProbesForModality(MODEL_TEST_MODALITIES.Decision)
    expect(probes.map((p) => p.id)).toEqual([
      API_VERIFICATION_PROBE_IDS.Models,
      API_VERIFICATION_PROBE_IDS.Decision,
    ])
  })

  it("returns chat generation probes for text modality", () => {
    const probes = getProbesForModality(MODEL_TEST_MODALITIES.Text)
    expect(probes.map((p) => p.id)).toEqual([
      API_VERIFICATION_PROBE_IDS.Models,
      API_VERIFICATION_PROBE_IDS.TextGeneration,
      API_VERIFICATION_PROBE_IDS.ToolCalling,
      API_VERIFICATION_PROBE_IDS.StructuredOutput,
      API_VERIFICATION_PROBE_IDS.WebSearch,
    ])
  })
})
