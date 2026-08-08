/** Supported provider-neutral fact renderers. */
export const MODEL_DISPLAY_FACT_TYPES = {
  Text: "text",
  TokenQuantity: "token-quantity",
  StringList: "string-list",
  Boolean: "boolean",
  Number: "number",
  Date: "date",
  Link: "link",
  CurrencyPrice: "currency-price",
  PriceOverrides: "price-overrides",
  BenchmarkList: "benchmark-list",
} as const

/** Meter units supported by the shared currency-price renderer. */
export const MODEL_DISPLAY_PRICE_UNITS = {
  MillionInputTokens: "million-input-tokens",
  MillionOutputTokens: "million-output-tokens",
  MillionCachedInputTokens: "million-cached-input-tokens",
  MillionCacheWriteTokens: "million-cache-write-tokens",
  MillionCacheWriteOneHourTokens: "million-cache-write-one-hour-tokens",
  MillionReasoningTokens: "million-reasoning-tokens",
  MillionImageTokens: "million-image-tokens",
  MillionAudioInputTokens: "million-audio-input-tokens",
  MillionAudioOutputTokens: "million-audio-output-tokens",
  MillionCachedAudioInputTokens: "million-cached-audio-input-tokens",
  Request: "request",
  InputImage: "input-image",
  OutputImage: "output-image",
  WebSearch: "web-search",
} as const

export type ModelDisplayPriceUnit =
  (typeof MODEL_DISPLAY_PRICE_UNITS)[keyof typeof MODEL_DISPLAY_PRICE_UNITS]

/** Translation namespace reserved for provider-neutral display facts. */
export const MODEL_DISPLAY_TRANSLATION_KEY_PREFIX = "displayFacts."

/** A statically constrained key within the display-facts translation namespace. */
export type ModelDisplayTranslationKey =
  `${typeof MODEL_DISPLAY_TRANSLATION_KEY_PREFIX}${string}`

/** Returns whether a value belongs to the display-facts translation namespace. */
export function isModelDisplayTranslationKey(
  value: string,
): value is ModelDisplayTranslationKey {
  return value.startsWith(MODEL_DISPLAY_TRANSLATION_KEY_PREFIX)
}

/** Serializable label descriptor that keeps localization out of provider DTOs. */
export interface ModelDisplayLabel {
  translationKey?: ModelDisplayTranslationKey
  fallback: string
}

export const createModelDisplayLabel = (
  translationKey: ModelDisplayTranslationKey,
  fallback: string,
): ModelDisplayLabel => ({ translationKey, fallback })

/** Canonical labels shared by provider presentation facts. */
export const MODEL_DISPLAY_FACT_LABELS = {
  ContextLimit: createModelDisplayLabel(
    "displayFacts.contextLimit",
    "Context limit",
  ),
  MaximumOutputTokens: createModelDisplayLabel(
    "displayFacts.maximumOutputTokens",
    "Maximum output tokens",
  ),
  InputModalities: createModelDisplayLabel(
    "displayFacts.inputModalities",
    "Input modalities",
  ),
  OutputModalities: createModelDisplayLabel(
    "displayFacts.outputModalities",
    "Output modalities",
  ),
} as const

/** Canonical section labels shared by provider presentation facts. */
export const MODEL_DISPLAY_SECTION_LABELS = {
  Specifications: createModelDisplayLabel(
    "displayFacts.sections.specifications",
    "Specifications",
  ),
} as const

export interface ModelDisplayPrice {
  label: ModelDisplayLabel
  amount: number
  currency: "USD"
  unit: ModelDisplayPriceUnit
}

export type ModelDisplayPriceCondition =
  | {
      type: "minimum-prompt-tokens"
      value: number
    }
  | {
      type: "utc-window"
      start: number
      end: number
    }

export interface ModelDisplayPriceOverride {
  conditions: ModelDisplayPriceCondition[]
  prices: ModelDisplayPrice[]
}

export interface ModelDisplayBenchmarkEntry {
  arena: string
  category: string
  score: number
  rank: number
  winRatePercent: number
}

/** A typed, provider-neutral fact rendered in a model detail view. */
export type ModelDisplayFact =
  | {
      type: typeof MODEL_DISPLAY_FACT_TYPES.Text
      label: ModelDisplayLabel
      value: string
    }
  | {
      type: typeof MODEL_DISPLAY_FACT_TYPES.TokenQuantity
      label: ModelDisplayLabel
      value: number
    }
  | {
      type: typeof MODEL_DISPLAY_FACT_TYPES.StringList
      label: ModelDisplayLabel
      values: string[]
    }
  | {
      type: typeof MODEL_DISPLAY_FACT_TYPES.Boolean
      label: ModelDisplayLabel
      value: boolean
    }
  | {
      type: typeof MODEL_DISPLAY_FACT_TYPES.Number
      label: ModelDisplayLabel
      value: number
    }
  | {
      type: typeof MODEL_DISPLAY_FACT_TYPES.Date
      label: ModelDisplayLabel
      value: string
    }
  | {
      type: typeof MODEL_DISPLAY_FACT_TYPES.Link
      label: ModelDisplayLabel
      href: string
      text: ModelDisplayLabel
    }
  | ({
      type: typeof MODEL_DISPLAY_FACT_TYPES.CurrencyPrice
      label: ModelDisplayLabel
    } & ModelDisplayPrice)
  | {
      type: typeof MODEL_DISPLAY_FACT_TYPES.PriceOverrides
      label: ModelDisplayLabel
      overrides: ModelDisplayPriceOverride[]
    }
  | {
      type: typeof MODEL_DISPLAY_FACT_TYPES.BenchmarkList
      label: ModelDisplayLabel
      entries: ModelDisplayBenchmarkEntry[]
    }

/** A labeled group of provider-neutral model facts. */
export interface ModelDisplaySection {
  id: string
  label: ModelDisplayLabel
  facts: ModelDisplayFact[]
}

/** Provider-neutral model presentation data exposed to shared React code. */
export interface ModelPresentation {
  summaryFacts?: ModelDisplayFact[]
  sections?: ModelDisplaySection[]
}
