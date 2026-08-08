export const OPENROUTER_MODEL_FIELD_CATEGORIES = {
  ProductCanonicalModel: "product-canonical-model",
  NativeSummary: "native-summary",
  NativeDetail: "native-detail",
  IntentionallyHidden: "intentionally-hidden",
} as const

/**
 * Stable documented OpenRouter model leaf fields pinned on 2026-08-08.
 *
 * Sources:
 * - https://openrouter.ai/docs/client-sdks/typescript/models/model
 * - https://openrouter.ai/docs/client-sdks/typescript/models/publicpricing
 * - https://openrouter.ai/docs/client-sdks/typescript/models/pricingoverride
 */
export const OPENROUTER_PINNED_MODEL_FIELD_PATHS = [
  "alias_target.name",
  "alias_target.slug",
  "architecture.input_modalities",
  "architecture.instruct_type",
  "architecture.modality",
  "architecture.output_modalities",
  "architecture.tokenizer",
  "benchmarks.artificial_analysis.agentic_index",
  "benchmarks.artificial_analysis.coding_index",
  "benchmarks.artificial_analysis.intelligence_index",
  "benchmarks.design_arena[].arena",
  "benchmarks.design_arena[].category",
  "benchmarks.design_arena[].elo",
  "benchmarks.design_arena[].rank",
  "benchmarks.design_arena[].win_rate",
  "canonical_slug",
  "context_length",
  "created",
  "default_parameters.frequency_penalty",
  "default_parameters.presence_penalty",
  "default_parameters.repetition_penalty",
  "default_parameters.temperature",
  "default_parameters.top_k",
  "default_parameters.top_p",
  "description",
  "expiration_date",
  "hugging_face_id",
  "id",
  "knowledge_cutoff",
  "links.details",
  "name",
  "per_request_limits.completion_tokens",
  "per_request_limits.prompt_tokens",
  "pricing.audio",
  "pricing.audio_output",
  "pricing.completion",
  "pricing.discount",
  "pricing.image",
  "pricing.image_output",
  "pricing.image_token",
  "pricing.input_audio_cache",
  "pricing.input_cache_read",
  "pricing.input_cache_write",
  "pricing.input_cache_write_1h",
  "pricing.internal_reasoning",
  "pricing.overrides[].audio",
  "pricing.overrides[].completion",
  "pricing.overrides[].input_audio_cache",
  "pricing.overrides[].input_cache_read",
  "pricing.overrides[].input_cache_write",
  "pricing.overrides[].input_cache_write_1h",
  "pricing.overrides[].min_prompt_tokens",
  "pricing.overrides[].prompt",
  "pricing.overrides[].utc_end",
  "pricing.overrides[].utc_start",
  "pricing.prompt",
  "pricing.request",
  "pricing.web_search",
  "reasoning.default_effort",
  "reasoning.default_enabled",
  "reasoning.mandatory",
  "reasoning.supported_efforts",
  "reasoning.supports_max_tokens",
  "supported_parameters",
  "supported_voices",
  "top_provider.context_length",
  "top_provider.is_moderated",
  "top_provider.max_completion_tokens",
] as const

type OpenRouterPinnedModelFieldPath =
  (typeof OPENROUTER_PINNED_MODEL_FIELD_PATHS)[number]

type VisibleFieldClassification = {
  category:
    | typeof OPENROUTER_MODEL_FIELD_CATEGORIES.ProductCanonicalModel
    | typeof OPENROUTER_MODEL_FIELD_CATEGORIES.NativeSummary
    | typeof OPENROUTER_MODEL_FIELD_CATEGORIES.NativeDetail
}

type HiddenFieldClassification = {
  category: typeof OPENROUTER_MODEL_FIELD_CATEGORIES.IntentionallyHidden
  reason: string
}

type OpenRouterModelFieldClassification =
  | VisibleFieldClassification
  | HiddenFieldClassification

const canonical = {
  category: OPENROUTER_MODEL_FIELD_CATEGORIES.ProductCanonicalModel,
} as const
const summary = {
  category: OPENROUTER_MODEL_FIELD_CATEGORIES.NativeSummary,
} as const
const detail = {
  category: OPENROUTER_MODEL_FIELD_CATEGORIES.NativeDetail,
} as const

/** Exhaustive product disposition for the pinned documented field inventory. */
export const OPENROUTER_MODEL_FIELD_CLASSIFICATIONS = {
  "alias_target.name": detail,
  "alias_target.slug": detail,
  "architecture.input_modalities": summary,
  "architecture.instruct_type": detail,
  "architecture.modality": detail,
  "architecture.output_modalities": summary,
  "architecture.tokenizer": detail,
  "benchmarks.artificial_analysis.agentic_index": detail,
  "benchmarks.artificial_analysis.coding_index": detail,
  "benchmarks.artificial_analysis.intelligence_index": detail,
  "benchmarks.design_arena[].arena": detail,
  "benchmarks.design_arena[].category": detail,
  "benchmarks.design_arena[].elo": detail,
  "benchmarks.design_arena[].rank": detail,
  "benchmarks.design_arena[].win_rate": detail,
  canonical_slug: detail,
  context_length: summary,
  created: detail,
  "default_parameters.frequency_penalty": detail,
  "default_parameters.presence_penalty": detail,
  "default_parameters.repetition_penalty": detail,
  "default_parameters.temperature": detail,
  "default_parameters.top_k": detail,
  "default_parameters.top_p": detail,
  description: canonical,
  expiration_date: detail,
  hugging_face_id: detail,
  id: canonical,
  knowledge_cutoff: detail,
  "links.details": detail,
  name: canonical,
  "per_request_limits.completion_tokens": detail,
  "per_request_limits.prompt_tokens": detail,
  "pricing.audio": detail,
  "pricing.audio_output": detail,
  "pricing.completion": canonical,
  "pricing.discount": {
    category: OPENROUTER_MODEL_FIELD_CATEGORIES.IntentionallyHidden,
    reason:
      "Endpoint discount metadata is not safely comparable at the provider-model level.",
  },
  "pricing.image": detail,
  "pricing.image_output": detail,
  "pricing.image_token": detail,
  "pricing.input_audio_cache": detail,
  "pricing.input_cache_read": detail,
  "pricing.input_cache_write": detail,
  "pricing.input_cache_write_1h": detail,
  "pricing.internal_reasoning": detail,
  "pricing.overrides[].audio": detail,
  "pricing.overrides[].completion": detail,
  "pricing.overrides[].input_audio_cache": detail,
  "pricing.overrides[].input_cache_read": detail,
  "pricing.overrides[].input_cache_write": detail,
  "pricing.overrides[].input_cache_write_1h": detail,
  "pricing.overrides[].min_prompt_tokens": detail,
  "pricing.overrides[].prompt": detail,
  "pricing.overrides[].utc_end": detail,
  "pricing.overrides[].utc_start": detail,
  "pricing.prompt": canonical,
  "pricing.request": detail,
  "pricing.web_search": detail,
  "reasoning.default_effort": detail,
  "reasoning.default_enabled": detail,
  "reasoning.mandatory": detail,
  "reasoning.supported_efforts": detail,
  "reasoning.supports_max_tokens": detail,
  supported_parameters: detail,
  supported_voices: detail,
  "top_provider.context_length": detail,
  "top_provider.is_moderated": detail,
  "top_provider.max_completion_tokens": detail,
} satisfies Record<
  OpenRouterPinnedModelFieldPath,
  OpenRouterModelFieldClassification
>
