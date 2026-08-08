import { z } from "zod"

import { isIsoCalendarDate } from "~/services/models/isoCalendarDate"
import { createModelDisplayLabel } from "~/services/models/modelDisplayFacts"

export const nonBlankStringSchema = z.string().trim().min(1)
export const finiteNumberSchema = z.number().finite()
export const tokenQuantitySchema = z.number().int().nonnegative()
export const booleanSchema = z.boolean()
export const unknownArraySchema = z.array(z.unknown())
export const unknownRecordSchema = z.record(z.string(), z.unknown())
export const isoDateSchema = z.string().refine(isIsoCalendarDate)

/**
 * OpenRouter's documented model contract supplies per-token USD strings,
 * conditional pricing overrides, and provider-owned endpoint detail links.
 * https://openrouter.ai/docs/client-sdks/typescript/models/model
 * https://openrouter.ai/docs/client-sdks/typescript/models/publicpricing
 * https://openrouter.ai/docs/client-sdks/typescript/models/pricingoverride
 */
export const architectureSchema = z.looseObject({
  input_modalities: z.unknown().optional(),
  output_modalities: z.unknown().optional(),
  modality: z.unknown().optional(),
  tokenizer: z.unknown().optional(),
  instruct_type: z.unknown().optional(),
})

export const pricingSchema = z.looseObject({
  prompt: z.unknown().optional(),
  completion: z.unknown().optional(),
  request: z.unknown().optional(),
  image: z.unknown().optional(),
  image_output: z.unknown().optional(),
  image_token: z.unknown().optional(),
  audio: z.unknown().optional(),
  audio_output: z.unknown().optional(),
  web_search: z.unknown().optional(),
  internal_reasoning: z.unknown().optional(),
  input_audio_cache: z.unknown().optional(),
  input_cache_read: z.unknown().optional(),
  input_cache_write: z.unknown().optional(),
  input_cache_write_1h: z.unknown().optional(),
  discount: z.unknown().optional(),
  overrides: z.unknown().optional(),
})

export const topProviderSchema = z.looseObject({
  context_length: z.unknown().optional(),
  max_completion_tokens: z.unknown().optional(),
  is_moderated: z.unknown().optional(),
})

export const perRequestLimitsSchema = z.looseObject({
  prompt_tokens: z.unknown().optional(),
  completion_tokens: z.unknown().optional(),
})

export const reasoningSchema = z.looseObject({
  mandatory: z.unknown().optional(),
  default_enabled: z.unknown().optional(),
  default_effort: z.unknown().optional(),
  supported_efforts: z.unknown().optional(),
  supports_max_tokens: z.unknown().optional(),
})

export const aliasTargetSchema = z.looseObject({
  name: z.unknown().optional(),
  slug: z.unknown().optional(),
})

export const linksSchema = z.looseObject({ details: z.unknown().optional() })

export const benchmarksSchema = z.looseObject({
  artificial_analysis: z.unknown().optional(),
  design_arena: z.unknown().optional(),
})

export const artificialAnalysisSchema = z.looseObject({
  intelligence_index: z.unknown().optional(),
  coding_index: z.unknown().optional(),
  agentic_index: z.unknown().optional(),
})

export const designArenaEntrySchema = z.looseObject({
  arena: z.unknown().optional(),
  category: z.unknown().optional(),
  elo: z.unknown().optional(),
  rank: z.unknown().optional(),
  win_rate: z.unknown().optional(),
})

export const defaultParametersSchema = z.looseObject({
  temperature: z.unknown().optional(),
  top_p: z.unknown().optional(),
  top_k: z.unknown().optional(),
  frequency_penalty: z.unknown().optional(),
  presence_penalty: z.unknown().optional(),
  repetition_penalty: z.unknown().optional(),
})

const label = (key: string, fallback: string) =>
  createModelDisplayLabel(
    `displayFacts.openRouter.${key}` as `displayFacts.${string}`,
    fallback,
  )

/** Reviewed labels for provider-native OpenRouter model facts. */
export const OPENROUTER_FACT_LABELS = {
  inputPrice: label("prices.input", "Input price"),
  outputPrice: label("prices.output", "Output price"),
  requestPrice: label("prices.request", "Request price"),
  imageInputPrice: label("prices.imageInput", "Image input price"),
  imageOutputPrice: label("prices.imageOutput", "Image output price"),
  imageTokenPrice: label("prices.imageToken", "Image token price"),
  audioInputPrice: label("prices.audioInput", "Audio input price"),
  audioOutputPrice: label("prices.audioOutput", "Audio output price"),
  webSearchPrice: label("prices.webSearch", "Web search price"),
  reasoningPrice: label("prices.reasoning", "Reasoning token price"),
  cachedAudioInputPrice: label(
    "prices.cachedAudioInput",
    "Cached audio input price",
  ),
  cacheReadPrice: label("prices.cacheRead", "Cache read price"),
  cacheWritePrice: label("prices.cacheWrite", "Cache write price"),
  cacheWriteOneHourPrice: label(
    "prices.cacheWriteOneHour",
    "One-hour cache write price",
  ),
  conditionalPrices: label("prices.conditional", "Conditional prices"),
  modality: label("architecture.modality", "Primary modality"),
  tokenizer: label("architecture.tokenizer", "Tokenizer"),
  instructType: label("architecture.instructType", "Instruction format"),
  supportedParameters: label(
    "capabilities.supportedParameters",
    "Supported parameters",
  ),
  supportedVoices: label("capabilities.supportedVoices", "Supported voices"),
  reasoningMandatory: label(
    "capabilities.reasoningMandatory",
    "Reasoning required",
  ),
  reasoningDefaultEnabled: label(
    "capabilities.reasoningDefaultEnabled",
    "Reasoning enabled by default",
  ),
  reasoningDefaultEffort: label(
    "capabilities.reasoningDefaultEffort",
    "Default reasoning effort",
  ),
  reasoningSupportedEfforts: label(
    "capabilities.reasoningSupportedEfforts",
    "Supported reasoning efforts",
  ),
  reasoningSupportsMaxTokens: label(
    "capabilities.reasoningSupportsMaxTokens",
    "Reasoning token limit supported",
  ),
  defaultTemperature: label("defaults.temperature", "Default temperature"),
  defaultTopP: label("defaults.topP", "Default top-p"),
  defaultTopK: label("defaults.topK", "Default top-k"),
  defaultFrequencyPenalty: label(
    "defaults.frequencyPenalty",
    "Default frequency penalty",
  ),
  defaultPresencePenalty: label(
    "defaults.presencePenalty",
    "Default presence penalty",
  ),
  defaultRepetitionPenalty: label(
    "defaults.repetitionPenalty",
    "Default repetition penalty",
  ),
  promptTokenLimit: label("limits.promptTokens", "Prompt token limit"),
  completionTokenLimit: label(
    "limits.completionTokens",
    "Completion token limit",
  ),
  routingContextLimit: label("routing.contextLimit", "Routing context limit"),
  moderation: label("routing.moderation", "Content moderation"),
  canonicalSlug: label("lifecycle.canonicalSlug", "Canonical slug"),
  huggingFaceId: label("lifecycle.huggingFaceId", "Hugging Face ID"),
  created: label("lifecycle.created", "Model created"),
  knowledgeCutoff: label("lifecycle.knowledgeCutoff", "Knowledge cutoff"),
  expirationDate: label("lifecycle.expirationDate", "Expiration date"),
  aliasName: label("lifecycle.aliasName", "Alias target name"),
  aliasSlug: label("lifecycle.aliasSlug", "Alias target"),
  intelligenceIndex: label(
    "benchmarks.intelligenceIndex",
    "Intelligence index",
  ),
  codingIndex: label("benchmarks.codingIndex", "Coding index"),
  agenticIndex: label("benchmarks.agenticIndex", "Agentic index"),
  designArena: label("benchmarks.designArena", "Design Arena rankings"),
  providerDetails: label("links.providerDetails", "Provider details"),
  openProviderDetails: label(
    "links.openProviderDetails",
    "Open provider details",
  ),
} as const

/** Reviewed order and labels for provider-native OpenRouter sections. */
export const OPENROUTER_SECTION_LABELS = {
  pricing: label("sections.pricing", "Pricing"),
  architecture: label("sections.architecture", "Architecture"),
  capabilities: label("sections.capabilities", "Capabilities and defaults"),
  requestLimits: label("sections.requestLimits", "Per-request limits"),
  routing: label("sections.routing", "Routing provider"),
  lifecycle: label("sections.lifecycle", "Lifecycle and aliases"),
  benchmarks: label("sections.benchmarks", "Benchmarks"),
  links: label("sections.links", "Links"),
} as const
