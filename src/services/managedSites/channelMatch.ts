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

export type ManagedSiteChannelKeyMatchReasonValue =
  (typeof MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS)[keyof typeof MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS]

export type ManagedSiteChannelModelsMatchReasonValue =
  (typeof MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS)[keyof typeof MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS]

export const MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS = {
  VERIFICATION_REQUIRED: "verification-required",
} as const

type ManagedSiteChannelMatchUnresolvedReason =
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

interface RecoverableManagedSiteChannelAssessment<TChannel> {
  url: {
    channel?: TChannel | null | undefined
    candidateCount: number
  }
  models: {
    channel?: TChannel | null | undefined
    reason: ManagedSiteChannelModelsMatchReasonValue
  }
}

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

export const getRecoverableManagedSiteChannelCandidate = <TChannel>(
  assessment?: RecoverableManagedSiteChannelAssessment<TChannel> | null,
): TChannel | null => {
  if (!assessment) {
    return null
  }

  const exactModelsChannel = assessment.models.channel

  if (
    exactModelsChannel &&
    assessment.models.reason === MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT
  ) {
    return exactModelsChannel
  }

  const urlChannel = assessment.url.channel

  if (urlChannel && assessment.url.candidateCount === 1) {
    return urlChannel
  }

  return null
}
