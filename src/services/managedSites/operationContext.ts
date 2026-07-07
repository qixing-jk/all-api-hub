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

export const createManagedSiteOperationContext =
  (): ManagedSiteOperationContext => ({
    channelMatch: createManagedSiteChannelMatchRequestCache(),
    defaultChannelGroups: {},
  })
