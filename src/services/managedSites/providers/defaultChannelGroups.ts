import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import type { ManagedSiteOperationContext } from "~/services/managedSites/operationContext"
import { normalizeList } from "~/utils/core/string"

type ManagedSiteConfig = {
  baseUrl: string
  adminToken: string
  userId: string
}

type ResolveDefaultChannelGroupsParams = {
  getConfig: () => Promise<ManagedSiteConfig | null>
  fetchSiteUserGroups: (config: ManagedSiteConfig) => Promise<string[]>
  onError?: (error: unknown) => void
  operationContext?: ManagedSiteOperationContext
}

/**
 * Resolve the initial channel groups from the managed site itself.
 *
 * Source token groups are intentionally ignored here. The managed site owns the
 * valid channel group space, so we prefer its `default` group when present and
 * otherwise fall back to the first available site group.
 */
export async function resolveDefaultChannelGroups({
  getConfig,
  fetchSiteUserGroups,
  onError,
  operationContext,
}: ResolveDefaultChannelGroupsParams): Promise<string[]> {
  const requestCache = operationContext?.defaultChannelGroups

  if (requestCache?.resolvedGroups) {
    return await requestCache.resolvedGroups
  }

  const resolvedGroupsPromise = resolveDefaultChannelGroupsUncached({
    getConfig,
    fetchSiteUserGroups,
    onError,
  })
  if (requestCache) {
    requestCache.resolvedGroups = resolvedGroupsPromise
  }

  return await resolvedGroupsPromise
}

/**
 * Performs the managed-site group lookup without consulting a batch cache.
 */
async function resolveDefaultChannelGroupsUncached({
  getConfig,
  fetchSiteUserGroups,
  onError,
}: Omit<ResolveDefaultChannelGroupsParams, "operationContext">): Promise<
  string[]
> {
  const fallbackGroups = [...DEFAULT_CHANNEL_FIELDS.groups]

  try {
    const config = await getConfig()
    if (!config) {
      return fallbackGroups
    }

    const siteGroups = normalizeList(await fetchSiteUserGroups(config))
    const siteGroupsByNormalizedName = new Map<string, string>()

    for (const siteGroup of siteGroups) {
      const normalizedSiteGroup = siteGroup.toLowerCase()
      if (!siteGroupsByNormalizedName.has(normalizedSiteGroup)) {
        siteGroupsByNormalizedName.set(normalizedSiteGroup, siteGroup)
      }
    }

    const preferredDefaultGroup = fallbackGroups
      .map((group) => siteGroupsByNormalizedName.get(group.toLowerCase()))
      .find((group): group is string => Boolean(group))
    if (preferredDefaultGroup) {
      return [preferredDefaultGroup]
    }

    return siteGroups.length > 0 ? [siteGroups[0]] : fallbackGroups
  } catch (error) {
    onError?.(error)
    return fallbackGroups
  }
}
