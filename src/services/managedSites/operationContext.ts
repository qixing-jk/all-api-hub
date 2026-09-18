import {
  createManagedSiteChannelMatchRequestCache,
  type ManagedSiteChannelMatchRequestCache,
} from "~/services/managedSites/channelMatchResolver"

export interface ManagedSiteDefaultChannelGroupsCache {
  resolvedGroups?: Promise<string[]>
}

export interface ManagedSiteOperationContext {
  channelMatch: ManagedSiteChannelMatchRequestCache
  defaultChannelGroups: ManagedSiteDefaultChannelGroupsCache
}

export const createManagedSiteOperationContext = (
  options: { freshChannelSearches?: boolean } = {},
): ManagedSiteOperationContext => ({
  channelMatch: createManagedSiteChannelMatchRequestCache({
    bypassPendingSearches: options.freshChannelSearches,
  }),
  defaultChannelGroups: {},
})
