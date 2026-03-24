import type {
  ManagedSiteChannelKeyMatchReasonValue,
  ManagedSiteChannelMatchInspection,
  ManagedSiteChannelModelsMatchReasonValue,
} from "~/services/managedSites/channelMatch"

export interface ManagedSiteChannelAssessmentSignalChannel {
  id?: number
  name: string
}

export interface ManagedSiteChannelAssessmentSignals {
  url: {
    matched: boolean
    candidateCount: number
    channel?: ManagedSiteChannelAssessmentSignalChannel
  }
  key: {
    comparable?: boolean
    matched: boolean
    reason: ManagedSiteChannelKeyMatchReasonValue
    channel?: ManagedSiteChannelAssessmentSignalChannel
  }
  models: {
    comparable?: boolean
    matched: boolean
    reason: ManagedSiteChannelModelsMatchReasonValue
    channel?: ManagedSiteChannelAssessmentSignalChannel
    similarityScore?: number
  }
}

const toOptionalSignalChannel = (
  channel: ManagedSiteChannelMatchInspection["url"]["channel"],
): ManagedSiteChannelAssessmentSignalChannel | undefined =>
  channel
    ? {
        id: channel.id,
        name: channel.name,
      }
    : undefined

/**
 * Converts a managed-site match inspection into the lightweight signal shape
 * used by UI surfaces that only need the URL / key / models indicators.
 */
export function toManagedSiteChannelAssessmentSignals(
  inspection: ManagedSiteChannelMatchInspection,
): ManagedSiteChannelAssessmentSignals {
  return {
    url: {
      matched: inspection.url.matched,
      candidateCount: inspection.url.candidateCount,
      channel: toOptionalSignalChannel(inspection.url.channel),
    },
    key: {
      comparable: inspection.key.comparable,
      matched: inspection.key.matched,
      reason: inspection.key.reason,
      channel: toOptionalSignalChannel(inspection.key.channel),
    },
    models: {
      comparable: inspection.models.comparable,
      matched: inspection.models.matched,
      reason: inspection.models.reason,
      channel: toOptionalSignalChannel(inspection.models.channel),
      similarityScore: inspection.models.similarityScore,
    },
  }
}
