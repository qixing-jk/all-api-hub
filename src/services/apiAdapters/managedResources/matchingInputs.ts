import type { ManagedSiteType } from "~/constants/siteType"
import { requireManagedResourceChannelId } from "~/services/apiAdapters/managedResources/resourceIds"
import { createManagedChannelResourceRef } from "~/services/managedSites/managedResourceIdentity"
import type {
  ManagedResourceMatchCandidate,
  ManagedResourceMatchList,
} from "~/types/managedResourceMatching"

type MatchingTarget = { siteType: ManagedSiteType; config: { baseUrl: string } }
type NativeMatchCandidate = Omit<ManagedResourceMatchCandidate, "ref"> & {
  id: number | string
}

/** Projects protocol records into scoped matching facts. */
export const toManagedResourceMatchCandidate = (
  channel: NativeMatchCandidate,
  target: MatchingTarget,
): ManagedResourceMatchCandidate => ({
  ref: createManagedChannelResourceRef(
    target.siteType,
    target.config.baseUrl,
    channel.id,
  ),
  name: channel.name,
  type: channel.type,
  base_url: channel.base_url,
  models: channel.models,
  key: channel.key,
})
export const toManagedResourceMatchList = (
  list: {
    items: NativeMatchCandidate[]
    total: number
    type_counts: Record<string, number>
  } | null,
  target: MatchingTarget,
): ManagedResourceMatchList | null =>
  list && {
    items: list.items.map((channel) =>
      toManagedResourceMatchCandidate(channel, target),
    ),
    total: list.total,
    type_counts: list.type_counts,
  }
/** Validates the entire selection before a provider starts resolving any secret. */
export function toNativeNumericMatchCandidates(
  candidates: ManagedResourceMatchCandidate[],
  target: MatchingTarget,
) {
  return candidates.map(({ ref, ...candidate }) => ({
    ...candidate,
    id: requireManagedResourceChannelId(target.siteType, target.config, ref),
  }))
}
