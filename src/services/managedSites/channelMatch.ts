import type { ManagedSiteChannel } from "~/types/managedSite"

export const MANAGED_SITE_CHANNEL_MATCH_LEVELS = {
  EXACT: "exact",
  SECONDARY: "secondary",
  FUZZY: "fuzzy",
  NONE: "none",
} as const

export const MANAGED_SITE_CHANNEL_MATCH_REASONS = {
  URL_KEY_EXACT: "url-key-exact",
  URL_MODELS_EXACT: "url-models-exact",
  URL_MODELS_CONTAINED: "url-models-contained",
  URL_MODELS_SIMILAR: "url-models-similar",
  URL_ONLY: "url-only",
  UNRESOLVED: "unresolved",
} as const

export const MANAGED_SITE_CHANNEL_MODEL_SIMILARITY_THRESHOLD = 0.5

export const MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS = {
  MATCHED: "matched",
  NO_KEY_PROVIDED: "no-key-provided",
  COMPARISON_UNAVAILABLE: "comparison-unavailable",
  NO_MATCH: "no-match",
} as const

export const MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS = {
  EXACT: "exact",
  CONTAINED: "contained",
  SIMILAR: "similar",
  NO_MODELS_PROVIDED: "no-models-provided",
  COMPARISON_UNAVAILABLE: "comparison-unavailable",
  NO_MATCH: "no-match",
} as const

export type ManagedSiteChannelMatchLevelValue =
  (typeof MANAGED_SITE_CHANNEL_MATCH_LEVELS)[keyof typeof MANAGED_SITE_CHANNEL_MATCH_LEVELS]

export type ManagedSiteChannelMatchReasonValue =
  (typeof MANAGED_SITE_CHANNEL_MATCH_REASONS)[keyof typeof MANAGED_SITE_CHANNEL_MATCH_REASONS]

export type ManagedSiteMatchedChannelMatchLevel = Exclude<
  ManagedSiteChannelMatchLevelValue,
  typeof MANAGED_SITE_CHANNEL_MATCH_LEVELS.NONE
>

export type ManagedSiteMatchedChannelMatchReason = Exclude<
  ManagedSiteChannelMatchReasonValue,
  typeof MANAGED_SITE_CHANNEL_MATCH_REASONS.UNRESOLVED
>

export type ManagedSiteChannelKeyMatchReasonValue =
  (typeof MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS)[keyof typeof MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS]

export type ManagedSiteChannelModelsMatchReasonValue =
  (typeof MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS)[keyof typeof MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS]

export const MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS = {
  VERIFICATION_REQUIRED: "verification-required",
} as const

export type ManagedSiteChannelMatchUnresolvedReason =
  (typeof MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS)[keyof typeof MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS]

export class MatchResolutionUnresolvedError extends Error {
  constructor(public reason: ManagedSiteChannelMatchUnresolvedReason) {
    super(reason)
    this.name = "MatchResolutionUnresolvedError"
  }
}

export interface ManagedSiteChannelMatchResult {
  level: ManagedSiteChannelMatchLevelValue
  reason: ManagedSiteChannelMatchReasonValue
  channel: ManagedSiteChannel | null
  similarityScore?: number
}

export interface ManagedSiteChannelMatchResolution {
  searchBaseUrl: string
  exactKeyComparable: boolean
  searchCompleted: boolean
  match: ManagedSiteChannelMatchResult
}

export interface ManagedSiteChannelUrlAssessment {
  matched: boolean
  channel: ManagedSiteChannel | null
  candidateCount: number
}

export interface ManagedSiteChannelKeyAssessment {
  comparable: boolean
  matched: boolean
  reason: ManagedSiteChannelKeyMatchReasonValue
  channel: ManagedSiteChannel | null
}

export interface ManagedSiteChannelModelsAssessment {
  comparable: boolean
  matched: boolean
  reason: ManagedSiteChannelModelsMatchReasonValue
  channel: ManagedSiteChannel | null
  similarityScore?: number
}

export interface ManagedSiteChannelMatchInspection {
  searchBaseUrl: string
  searchCompleted: boolean
  url: ManagedSiteChannelUrlAssessment
  key: ManagedSiteChannelKeyAssessment
  models: ManagedSiteChannelModelsAssessment
}

export const hasManagedSiteChannelMatch = (
  match: ManagedSiteChannelMatchResult,
): match is ManagedSiteChannelMatchResult & {
  level: ManagedSiteMatchedChannelMatchLevel
  reason: ManagedSiteMatchedChannelMatchReason
  channel: ManagedSiteChannel
} =>
  match.level !== MANAGED_SITE_CHANNEL_MATCH_LEVELS.NONE &&
  match.reason !== MANAGED_SITE_CHANNEL_MATCH_REASONS.UNRESOLVED &&
  match.channel != null

export const getManagedSiteChannelExactMatch = (
  inspection: ManagedSiteChannelMatchInspection,
): ManagedSiteChannel | null => {
  if (
    !inspection.key.matched ||
    !inspection.models.matched ||
    inspection.models.reason !== MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT
  ) {
    return null
  }

  if (
    inspection.key.channel?.id == null ||
    inspection.models.channel?.id == null ||
    inspection.key.channel.id !== inspection.models.channel.id
  ) {
    return null
  }

  return inspection.key.channel
}
