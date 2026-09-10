import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
  type ManagedSiteChannelKeyMatchReasonValue,
  type ManagedSiteChannelMatchInspection,
  type ManagedSiteChannelModelsMatchReasonValue,
} from "~/services/managedSites/channelMatch"
import { areManagedResourceRefsEqual } from "~/services/managedSites/managedResourceIdentity"
import {
  getManagedSiteChannelKeyComparisonMode,
  inspectManagedSiteChannelKeyValueMatch,
} from "~/services/managedSites/utils/channelMatching"
import type { ManagedResourceMatchCandidate } from "~/types/managedResourceMatching"

export interface ManagedSiteAssessmentChannel {
  ref: ManagedResourceRef
  name: string
}

export interface ManagedSiteVerifiedKeyAssessment<
  TChannel extends ManagedSiteAssessmentChannel,
> {
  searchBaseUrl: string
  searchCompleted: boolean
  url: {
    matched: boolean
    candidateCount: number
    channel?: TChannel
  }
  key: {
    comparable: boolean
    matched: boolean
    reason: ManagedSiteChannelKeyMatchReasonValue
    channel?: TChannel
  }
  models: {
    comparable: boolean
    matched: boolean
    reason: ManagedSiteChannelModelsMatchReasonValue
    channel?: TChannel
    similarityScore?: number
  }
}

export const toManagedSiteAssessmentChannel = (
  channel: ManagedResourceMatchCandidate,
): ManagedSiteAssessmentChannel => ({
  ref: channel.ref,
  name: channel.name,
})

const toOptionalManagedSiteAssessmentChannel = (
  channel: ManagedResourceMatchCandidate | null,
) => (channel ? toManagedSiteAssessmentChannel(channel) : undefined)

export const toManagedSiteVerifiedKeyAssessment = (
  inspection: ManagedSiteChannelMatchInspection,
): ManagedSiteVerifiedKeyAssessment<ManagedSiteAssessmentChannel> => ({
  searchBaseUrl: inspection.searchBaseUrl,
  searchCompleted: inspection.searchCompleted,
  url: {
    matched: inspection.url.matched,
    candidateCount: inspection.url.candidateCount,
    channel: toOptionalManagedSiteAssessmentChannel(inspection.url.channel),
  },
  key: {
    comparable: inspection.key.comparable,
    matched: inspection.key.matched,
    reason: inspection.key.reason,
    channel: toOptionalManagedSiteAssessmentChannel(inspection.key.channel),
  },
  models: {
    comparable: inspection.models.comparable,
    matched: inspection.models.matched,
    reason: inspection.models.reason,
    channel: toOptionalManagedSiteAssessmentChannel(inspection.models.channel),
    similarityScore: inspection.models.similarityScore,
  },
})

/**
 * Applies a verified managed-site channel key to an existing local assessment
 * without reloading channel lists or rebuilding channel drafts.
 */
export function applyVerifiedManagedSiteChannelKey<
  TChannel extends ManagedSiteAssessmentChannel,
  TAssessment extends ManagedSiteVerifiedKeyAssessment<TChannel>,
>(params: {
  assessment: TAssessment
  candidate: TChannel
  sourceKey: string
  verifiedChannelKey: string
  siteType?: string
}): {
  assessment: TAssessment
  exactMatch: boolean
  hasAnyMatch: boolean
} {
  const keyAssessment = inspectManagedSiteChannelKeyValueMatch({
    sourceKey: params.sourceKey,
    channelKey: params.verifiedChannelKey,
    keyComparisonMode: getManagedSiteChannelKeyComparisonMode(params.siteType),
  })
  const assessment = {
    ...params.assessment,
    key: {
      comparable: keyAssessment.comparable,
      matched: keyAssessment.matched,
      reason: keyAssessment.reason,
      channel: keyAssessment.matched ? params.candidate : undefined,
    },
  } as TAssessment
  const exactMatch =
    assessment.key.matched &&
    assessment.models.matched &&
    assessment.models.reason ===
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT &&
    areManagedResourceRefsEqual(
      assessment.models.channel?.ref,
      params.candidate.ref,
    )

  return {
    assessment,
    exactMatch,
    hasAnyMatch:
      assessment.url.matched ||
      assessment.key.matched ||
      assessment.models.matched,
  }
}
