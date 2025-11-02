/**
 * Types for Model Redirect service
 */

/**
 * Single model redirect mapping record
 * Maps a standard model name to a specific channel and model
 */
export interface ModelRedirectMapping {
  standardModel: string
  sourceModel: string
  targetChannelId: number
  targetChannelName: string
  targetModel: string
  score: number
  reason: string
}

/**
 * Metadata about when and how the mapping was generated
 */
export interface ModelMappingMetadata {
  trigger: "auto" | "manual"
  generatedAt: number
  channelCount: number
  mappingCount: number
}

/**
 * Complete model mapping result with all mappings and metadata
 */
export interface ModelMappingResult {
  mapping: Record<string, ModelRedirectMapping>
  updatedAt: number
  metadata: ModelMappingMetadata
}

/**
 * Extended channel information for scoring
 */
export interface ScoringChannel {
  id: number
  name: string
  status: number
  priority: number
  weight: number
  models: string[]
  used_quota?: number
}

/**
 * A candidate for a specific standard model
 */
export interface ModelCandidate {
  channelId: number
  channelName: string
  channelPriority: number
  channelWeight: number
  channelUsedQuota: number
  modelName: string
  normalizedModel: string
  parsedDate?: string
  normalizedTokens: string[]
}

/**
 * Scoring coefficients for candidate selection
 */
export interface ScoringCoefficients {
  priorityWeight: number
  weightWeight: number
  usedQuotaWeight: number
}

/**
 * Options for generating model mapping
 */
export interface GenerateMappingOptions {
  trigger: "auto" | "manual"
  scoringCoefficients?: Partial<ScoringCoefficients>
}
