/** Supported provider-neutral fact renderers. */
export const MODEL_DISPLAY_FACT_TYPES = {
  Text: "text",
  TokenQuantity: "token-quantity",
  StringList: "string-list",
} as const

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

const createTranslatedLabel = (
  translationKey: ModelDisplayTranslationKey,
  fallback: string,
): ModelDisplayLabel => ({ translationKey, fallback })

/** Canonical labels shared by provider presentation facts. */
export const MODEL_DISPLAY_FACT_LABELS = {
  ContextLimit: createTranslatedLabel(
    "displayFacts.contextLimit",
    "Context limit",
  ),
  MaximumOutputTokens: createTranslatedLabel(
    "displayFacts.maximumOutputTokens",
    "Maximum output tokens",
  ),
  OutputModalities: createTranslatedLabel(
    "displayFacts.outputModalities",
    "Output modalities",
  ),
} as const

/** Canonical section labels shared by provider presentation facts. */
export const MODEL_DISPLAY_SECTION_LABELS = {
  Specifications: createTranslatedLabel(
    "displayFacts.sections.specifications",
    "Specifications",
  ),
} as const

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
