import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/configuration/runtimeConfig"
import { assertManagedResourceRefForSite } from "~/services/managedSites/managedResourceIdentity"
import { normalizeManagedSiteChannelBaseUrl } from "~/services/managedSites/utils/channelMatching"
import type {
  ManagedResourceMatchCandidate,
  ManagedResourceMatchList,
} from "~/types/managedResourceMatching"

type UrlBuckets = Map<string, ManagedResourceMatchCandidate[]>

/** Indexes belong to one read-only operation and never establish write freshness. */
export type MatchingInventoryIndexCache = WeakMap<
  ManagedResourceMatchList,
  Map<string, UrlBuckets>
>

/** Validates and indexes a complete inventory once per target within a batch. */
export function getMatchingInventoryUrlBucket(
  inventory: ManagedResourceMatchList,
  target: { siteType: ManagedSiteType; config: ManagedSiteRuntimeConfigValue },
  baseUrl: string,
  cache: MatchingInventoryIndexCache,
): ManagedResourceMatchCandidate[] {
  const targetKey = JSON.stringify([
    target.siteType,
    Object.entries(target.config).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  ])
  let targets = cache.get(inventory)
  let buckets = targets?.get(targetKey)
  if (!buckets) {
    buckets = new Map()
    for (const candidate of Array.isArray(inventory.items)
      ? inventory.items
      : []) {
      // Validate the entire response, including entries outside the requested URL.
      assertManagedResourceRefForSite(candidate.ref, target)
      const url = normalizeManagedSiteChannelBaseUrl(candidate.base_url)
      const bucket = buckets.get(url) ?? []
      bucket.push(candidate)
      buckets.set(url, bucket)
    }
    if (!targets) {
      targets = new Map()
      cache.set(inventory, targets)
    }
    targets.set(targetKey, buckets)
  }
  return buckets.get(normalizeManagedSiteChannelBaseUrl(baseUrl)) ?? []
}
