import { modelMetadataService } from "~/services/models/modelMetadata"
import { extractCoreModelIdentity } from "~/services/models/modelMetadata/modelIdentityIndex"

import { getDeclaredVerificationApiType } from "./apiTypeResolution"
import { getApiVerificationProbeDefinitions } from "./probes"
import type { ApiVerificationProbeDefinition } from "./probes"
import {
  API_TYPES,
  API_VERIFICATION_PROBE_IDS,
  type ApiVerificationApiType,
} from "./types"

export const MODEL_TEST_MODALITIES = {
  Text: "text",
  Embedding: "embedding",
  Rerank: "rerank",
  Image: "image",
  Video: "video",
  Decision: "decision",
} as const

export type ModelTestModality =
  (typeof MODEL_TEST_MODALITIES)[keyof typeof MODEL_TEST_MODALITIES]

export interface ModelModalityResolutionContext {
  modelId: string
  supportedEndpointTypes?: string[]
  presentationKind?: string
  modalities?: { input?: string[]; output?: string[] }
}

const EMBEDDING_PATTERNS = [
  /(?:^|[-_.])(?:embeddings?|embed)(?:[-_.]|$)/i,
  /^embeddinggemma(?:[-_.]|$)/i,
  /^bge[-_.]/i,
  /(?:^|[-_.])e5(?:[-_.]|$)/i,
  /^gte[-_.]/i,
  /^jina[-_.]clip(?:[-_.]|$)/i,
  /^voyage[-_.]/i,
]

const RERANK_PATTERNS = [/(?:^|[-_.])rerank(?:er)?(?:[-_.]|$)/i]

const IMAGE_PATTERNS = [
  /^gpt[-_.]image(?:[-_.]|$)/i,
  /^gemini[-_.].*[-_.]image(?:[-_.]|$)/i,
  /^qwen[-_.]image(?:[-_.]|$)/i,
  /^wanx?\d*(?:[._]\d+)*[-_.](?:t2i|image)(?:[-_.]|$)/i,
  /^wanx[-_.]v\d+(?:[-_.]|$)/i,
  /^dall[-_.]e(?:[-_.]|$)/i,
  /^flux(?:[-_.]|$)/i,
  /^midjourney(?:[-_.]|$)/i,
  /^stable[-_.]diffusion(?:[-_.]|$)/i,
  /^sdxl(?:[-_.]|$)/i,
  /^recraft(?:[-_.]v?\d|$)/i,
  /^imagen(?:[-_.]|$)/i,
  /^ideogram(?:[-_.]|$)/i,
  /^kolors(?:[-_.]|$)/i,
]

const VIDEO_PATTERNS = [
  /^veo(?:[-_.]|$)/i,
  /^wanx?\d*(?:[._]\d+)*[-_.](?:t2v|i2v|v2v)(?:[-_.]|$)/i,
  /^sora(?:[-_.]|$)/i,
  /^kling(?:[-_.]|$)/i,
  /^runway(?:[-_.]|$)/i,
  /^luma(?:[-_.]|$)/i,
  /^cogvideox?(?:[-_.]|$)/i,
  /^hailuo(?:[-_.]|$)/i,
  /^minimax[-_.]video(?:[-_.]|$)/i,
  /^minimax[-_.]hailuo(?:[-_.]|$)/i,
  /^doubao[-_.]video(?:[-_.]|$)/i,
  /^pika(?:[-_.]|$)/i,
]

const DECISION_PATTERNS = [
  /(?:^|[-_.])decision(?:[-_.]|$)/i,
  /^clef(?:[-_.]|$)/i,
  /^jev(?:[-_.]|$)/i,
  /^cloudflare[-_.]clef(?:[-_.]|$)/i,
  /^typesafe[-_.]jev(?:[-_.]|$)/i,
]

/**
 * Resolves the primary test modality for a model by checking explicit
 * provider endpoint facts, catalog presentation metadata, centralized models.dev
 * modalities, and finally naming pattern heuristics.
 */
export function resolveModelTestModality(
  context: ModelModalityResolutionContext,
  metadataLookup = (modelId: string) =>
    modelMetadataService.resolveModelIdentity(modelId),
): ModelTestModality {
  const { modelId, supportedEndpointTypes, presentationKind, modalities } =
    context

  // 1. Explicit endpoint facts (e.g. from adapter or site catalog)
  if (supportedEndpointTypes && supportedEndpointTypes.length > 0) {
    const endpoints = supportedEndpointTypes.map((ep) => ep.toLowerCase())
    if (
      endpoints.some(
        (ep) =>
          ep.includes("embedding") ||
          /:(?:embedcontent|batchembedcontents)$/.test(ep),
      )
    ) {
      return MODEL_TEST_MODALITIES.Embedding
    }
    if (endpoints.some((ep) => ep.includes("rerank"))) {
      return MODEL_TEST_MODALITIES.Rerank
    }
    if (endpoints.some((ep) => ep.includes("images") || ep.includes("image"))) {
      return MODEL_TEST_MODALITIES.Image
    }
    if (endpoints.some((ep) => ep.includes("video"))) {
      return MODEL_TEST_MODALITIES.Video
    }
    if (endpoints.some((ep) => ep.includes("decision"))) {
      return MODEL_TEST_MODALITIES.Decision
    }
  }

  // 2. Presentation kind / specification facts
  if (presentationKind) {
    const kind = presentationKind.toLowerCase()
    if (kind.includes("embedding")) return MODEL_TEST_MODALITIES.Embedding
    if (kind.includes("rerank")) return MODEL_TEST_MODALITIES.Rerank
    if (kind.includes("image")) return MODEL_TEST_MODALITIES.Image
    if (kind.includes("video")) return MODEL_TEST_MODALITIES.Video
    if (kind.includes("decision")) return MODEL_TEST_MODALITIES.Decision
    if (kind === "text" || kind === "chat") return MODEL_TEST_MODALITIES.Text
  }

  const trimmed = modelId.trim()

  // 3. Centralized modalities (explicit or models.dev metadata lookup)
  let effectiveModalities = modalities
  let metadataType: string | undefined
  let metadataOutputLimit: number | undefined
  if (!effectiveModalities && trimmed) {
    const lookup = metadataLookup(trimmed)
    if (lookup.state === "resolved") {
      if (lookup.metadata.modalities) {
        effectiveModalities = lookup.metadata.modalities
      }
      metadataType = lookup.metadata.type
      metadataOutputLimit = lookup.metadata.limits?.output
    }
  }

  if (metadataType) {
    const type = metadataType.toLowerCase()
    if (type.includes("embedding")) return MODEL_TEST_MODALITIES.Embedding
    if (type.includes("rerank")) return MODEL_TEST_MODALITIES.Rerank
    if (type.includes("image")) return MODEL_TEST_MODALITIES.Image
    if (type.includes("video")) return MODEL_TEST_MODALITIES.Video
    if (type.includes("decision")) return MODEL_TEST_MODALITIES.Decision
  }

  if (effectiveModalities?.output) {
    const outputs = effectiveModalities.output.map((o) => o.toLowerCase())
    if (outputs.includes("embedding")) return MODEL_TEST_MODALITIES.Embedding
    if (outputs.includes("rerank")) return MODEL_TEST_MODALITIES.Rerank
    if (outputs.includes("video")) return MODEL_TEST_MODALITIES.Video
    if (outputs.includes("decision")) return MODEL_TEST_MODALITIES.Decision
    // Image output is generation; image input alone is ordinary multimodal chat.
    if (outputs.includes("image")) {
      return MODEL_TEST_MODALITIES.Image
    }
    if (outputs.includes("text") && (modalities || metadataOutputLimit !== 0)) {
      if (modalities) {
        return MODEL_TEST_MODALITIES.Text
      }
    }
  }

  // Generic text endpoints also serve multimodal generation; output facts win.
  if (getDeclaredVerificationApiType(supportedEndpointTypes))
    return MODEL_TEST_MODALITIES.Text

  // 4. Model ID / family pattern heuristics using core model identity
  if (trimmed) {
    const coreModelId = extractCoreModelIdentity(trimmed)

    const matches = (patterns: readonly RegExp[]) =>
      patterns.some((pattern) => pattern.test(coreModelId))

    if (matches(RERANK_PATTERNS)) {
      return MODEL_TEST_MODALITIES.Rerank
    }
    if (matches(EMBEDDING_PATTERNS)) {
      return MODEL_TEST_MODALITIES.Embedding
    }
    if (matches(IMAGE_PATTERNS)) {
      return MODEL_TEST_MODALITIES.Image
    }
    if (matches(VIDEO_PATTERNS)) {
      return MODEL_TEST_MODALITIES.Video
    }
    if (matches(DECISION_PATTERNS)) {
      return MODEL_TEST_MODALITIES.Decision
    }
  }

  // 5. Default fallback to standard Text / Chat
  return MODEL_TEST_MODALITIES.Text
}

/** Preserve upstream order among text-capable candidates; non-text-only lists keep their first model. */
export function pickDefaultVerificationModelId(
  modelIds: string[],
): string | undefined {
  return (
    modelIds.find(
      (modelId) =>
        resolveModelTestModality({ modelId }) === MODEL_TEST_MODALITIES.Text,
    ) ?? modelIds[0]
  )
}

const MODALITY_PROBE_IDS: Record<
  ModelTestModality,
  ApiVerificationProbeDefinition["id"] | undefined
> = {
  [MODEL_TEST_MODALITIES.Text]: undefined,
  [MODEL_TEST_MODALITIES.Embedding]: API_VERIFICATION_PROBE_IDS.Embedding,
  [MODEL_TEST_MODALITIES.Rerank]: API_VERIFICATION_PROBE_IDS.Rerank,
  [MODEL_TEST_MODALITIES.Image]: API_VERIFICATION_PROBE_IDS.ImageGeneration,
  [MODEL_TEST_MODALITIES.Video]: API_VERIFICATION_PROBE_IDS.VideoGeneration,
  [MODEL_TEST_MODALITIES.Decision]: API_VERIFICATION_PROBE_IDS.Decision,
}

/**
 * Returns the probe definitions appropriate for the model's test modality.
 */
export function getProbesForModality(
  modality: ModelTestModality = MODEL_TEST_MODALITIES.Text,
  apiType: ApiVerificationApiType = API_TYPES.OPENAI_COMPATIBLE,
): ApiVerificationProbeDefinition[] {
  const probeId = MODALITY_PROBE_IDS[modality]
  return probeId
    ? [
        { id: API_VERIFICATION_PROBE_IDS.Models, requiresModelId: false },
        { id: probeId, requiresModelId: true },
      ]
    : getApiVerificationProbeDefinitions(apiType)
}
