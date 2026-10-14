import {
  createApiOperationContext,
  type ApiOperationContext,
} from "~/services/apiTransport/operationContext"
import {
  createManagedSiteChannelMatchRequestCache,
  type ManagedSiteChannelMatchRequestCache,
} from "~/services/managedSites/matching/channelMatchResolver"

export interface ManagedSiteDefaultChannelGroupsCache {
  resolvedGroups?: Promise<string[]>
}

export interface ManagedSiteOperationContext {
  api: ApiOperationContext
  channelMatch: ManagedSiteChannelMatchRequestCache
  defaultChannelGroups: ManagedSiteDefaultChannelGroupsCache
}

export const createManagedSiteOperationContext = (
  options: { freshChannelSearches?: boolean } = {},
): ManagedSiteOperationContext => {
  const api = createApiOperationContext()
  return {
    api,
    channelMatch: createManagedSiteChannelMatchRequestCache({
      operationContext: api,
      bypassPendingSearches: options.freshChannelSearches,
    }),
    defaultChannelGroups: {},
  }
}
