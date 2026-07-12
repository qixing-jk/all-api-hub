import type { ModelMetadata } from "~/services/models/modelMetadata/types"
import { extractActualModel } from "~/services/models/modelRedirect/modelNormalization"
import { toModelTokenKey } from "~/services/models/utils/modelName"

export const MODEL_CAPABILITY_FILTER_VALUES = {
  ALL: "all",
  IMAGE_INPUT: "image_input",
  IMAGE_OUTPUT: "image_output",
  AUDIO_INPUT: "audio_input",
  AUDIO_OUTPUT: "audio_output",
  VIDEO_INPUT: "video_input",
  VIDEO_OUTPUT: "video_output",
  PDF: "pdf",
  REASONING: "reasoning",
  TOOL_CALL: "tool_call",
  STRUCTURED_OUTPUT: "structured_output",
  ATTACHMENT: "attachment",
} as const

export type ModelCapabilityFilterValue =
  (typeof MODEL_CAPABILITY_FILTER_VALUES)[keyof typeof MODEL_CAPABILITY_FILTER_VALUES]
export type ModelCapabilitySelectionValue = Exclude<
  ModelCapabilityFilterValue,
  typeof MODEL_CAPABILITY_FILTER_VALUES.ALL
>

/**
 * Counts metadata matches after other active filters but before capability filters.
 */
export interface ModelCapabilityMetadataCoverage {
  matched: number
  total: number
  unmatched: number
}

export const MODEL_CAPABILITY_FILTER_LABEL_KEYS: Record<
  ModelCapabilityFilterValue,
  string
> = {
  [MODEL_CAPABILITY_FILTER_VALUES.ALL]: "modelCapabilityFilter.options.all",
  [MODEL_CAPABILITY_FILTER_VALUES.IMAGE_INPUT]:
    "modelCapabilityFilter.options.imageInput",
  [MODEL_CAPABILITY_FILTER_VALUES.IMAGE_OUTPUT]:
    "modelCapabilityFilter.options.imageOutput",
  [MODEL_CAPABILITY_FILTER_VALUES.AUDIO_INPUT]:
    "modelCapabilityFilter.options.audioInput",
  [MODEL_CAPABILITY_FILTER_VALUES.AUDIO_OUTPUT]:
    "modelCapabilityFilter.options.audioOutput",
  [MODEL_CAPABILITY_FILTER_VALUES.VIDEO_INPUT]:
    "modelCapabilityFilter.options.videoInput",
  [MODEL_CAPABILITY_FILTER_VALUES.VIDEO_OUTPUT]:
    "modelCapabilityFilter.options.videoOutput",
  [MODEL_CAPABILITY_FILTER_VALUES.PDF]: "modelCapabilityFilter.options.pdf",
  [MODEL_CAPABILITY_FILTER_VALUES.REASONING]:
    "modelCapabilityFilter.options.reasoning",
  [MODEL_CAPABILITY_FILTER_VALUES.TOOL_CALL]:
    "modelCapabilityFilter.options.toolCall",
  [MODEL_CAPABILITY_FILTER_VALUES.STRUCTURED_OUTPUT]:
    "modelCapabilityFilter.options.structuredOutput",
  [MODEL_CAPABILITY_FILTER_VALUES.ATTACHMENT]:
    "modelCapabilityFilter.options.attachment",
}

type ModelCapabilityMatchInput = {
  metadata: ModelMetadata | undefined
  filter: ModelCapabilitySelectionValue
}

const MODEL_METADATA_TOKEN_KEY_PREFIX = "token:"

/**
 * Normalizes model ids and names for metadata lookup.
 */
function normalizeModelKey(value: string) {
  return value.trim().toLowerCase()
}

/**
 * Builds a deterministic token lookup key without fuzzy model-name matching.
 */
function toMetadataTokenLookupKey(value: string) {
  const tokenKey = toModelTokenKey(extractActualModel(value))
  return tokenKey ? `${MODEL_METADATA_TOKEN_KEY_PREFIX}${tokenKey}` : null
}

/**
 * Builds lookup keys for provider-prefixed and plain model ids.
 */
export function createModelMetadataIndex(modelMetadata: ModelMetadata[]) {
  const index = new Map<string, ModelMetadata>()
  const tokenIndex = new Map<string, ModelMetadata | null>()

  modelMetadata.forEach((metadata) => {
    const candidateKeys = [
      metadata.id,
      metadata.name,
      extractActualModel(metadata.id),
      extractActualModel(metadata.name),
    ]

    candidateKeys.forEach((key) => {
      const normalized = normalizeModelKey(key)
      if (normalized && !index.has(normalized)) {
        index.set(normalized, metadata)
      }

      const tokenLookupKey = toMetadataTokenLookupKey(key)
      if (!tokenLookupKey) return

      const existingTokenMatch = tokenIndex.get(tokenLookupKey)
      if (existingTokenMatch === undefined) {
        tokenIndex.set(tokenLookupKey, metadata)
      } else if (existingTokenMatch !== metadata) {
        tokenIndex.set(tokenLookupKey, null)
      }
    })
  })

  tokenIndex.forEach((metadata, key) => {
    if (metadata && !index.has(key)) {
      index.set(key, metadata)
    }
  })

  return index
}

/**
 * Finds metadata for a displayed model name using exact and normalized keys.
 */
export function resolveModelMetadata(
  index: Map<string, ModelMetadata>,
  modelName: string,
) {
  const normalized = normalizeModelKey(modelName)
  return (
    index.get(normalized) ??
    index.get(normalizeModelKey(extractActualModel(modelName))) ??
    index.get(toMetadataTokenLookupKey(modelName) ?? "")
  )
}

/**
 * Checks whether one model metadata record satisfies a capability filter.
 */
function matchesModelCapabilityFilter({
  metadata,
  filter,
}: ModelCapabilityMatchInput) {
  if (!metadata) {
    return false
  }

  if (filter === MODEL_CAPABILITY_FILTER_VALUES.IMAGE_INPUT) {
    return metadata.modalities?.input.includes("image") === true
  }

  if (filter === MODEL_CAPABILITY_FILTER_VALUES.IMAGE_OUTPUT) {
    return metadata.modalities?.output.includes("image") === true
  }

  if (filter === MODEL_CAPABILITY_FILTER_VALUES.AUDIO_INPUT) {
    return metadata.modalities?.input.includes("audio") === true
  }

  if (filter === MODEL_CAPABILITY_FILTER_VALUES.AUDIO_OUTPUT) {
    return metadata.modalities?.output.includes("audio") === true
  }

  if (filter === MODEL_CAPABILITY_FILTER_VALUES.VIDEO_INPUT) {
    return metadata.modalities?.input.includes("video") === true
  }

  if (filter === MODEL_CAPABILITY_FILTER_VALUES.VIDEO_OUTPUT) {
    return metadata.modalities?.output.includes("video") === true
  }

  if (filter === MODEL_CAPABILITY_FILTER_VALUES.PDF) {
    return metadata.modalities?.input.includes("pdf") === true
  }

  if (filter === MODEL_CAPABILITY_FILTER_VALUES.REASONING) {
    return metadata.capabilities?.reasoning === true
  }

  if (filter === MODEL_CAPABILITY_FILTER_VALUES.TOOL_CALL) {
    return metadata.capabilities?.toolCall === true
  }

  if (filter === MODEL_CAPABILITY_FILTER_VALUES.STRUCTURED_OUTPUT) {
    return metadata.capabilities?.structuredOutput === true
  }

  return metadata.capabilities?.attachment === true
}

/**
 * Applies selected capability filters as an intersection.
 */
export function matchesModelCapabilityFilters({
  metadata,
  filters,
}: {
  metadata: ModelMetadata | undefined
  filters: ModelCapabilitySelectionValue[]
}) {
  if (filters.length === 0) {
    return true
  }

  return filters.every((filter) =>
    matchesModelCapabilityFilter({ metadata, filter }),
  )
}

/**
 * Detects whether loaded metadata can safely drive capability filtering.
 */
export function hasFilterableModelCapabilityMetadata(
  modelMetadata: ModelMetadata[],
) {
  return modelMetadata.some(
    (metadata) => getModelCapabilityBadges(metadata).length > 0,
  )
}

/**
 * Returns the capability badges that should be shown for one model row.
 */
export function getModelCapabilityBadges(metadata?: ModelMetadata) {
  if (!metadata) {
    return []
  }

  return [
    MODEL_CAPABILITY_FILTER_VALUES.IMAGE_INPUT,
    MODEL_CAPABILITY_FILTER_VALUES.IMAGE_OUTPUT,
    MODEL_CAPABILITY_FILTER_VALUES.AUDIO_INPUT,
    MODEL_CAPABILITY_FILTER_VALUES.AUDIO_OUTPUT,
    MODEL_CAPABILITY_FILTER_VALUES.VIDEO_INPUT,
    MODEL_CAPABILITY_FILTER_VALUES.VIDEO_OUTPUT,
    MODEL_CAPABILITY_FILTER_VALUES.PDF,
    MODEL_CAPABILITY_FILTER_VALUES.REASONING,
    MODEL_CAPABILITY_FILTER_VALUES.TOOL_CALL,
    MODEL_CAPABILITY_FILTER_VALUES.STRUCTURED_OUTPUT,
    MODEL_CAPABILITY_FILTER_VALUES.ATTACHMENT,
  ].filter((filter) =>
    matchesModelCapabilityFilter({
      metadata,
      filter,
    }),
  )
}
