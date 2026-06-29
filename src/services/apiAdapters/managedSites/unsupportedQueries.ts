import type { ManagedSiteQueriesCapability } from "~/services/apiAdapters/contracts/managedSiteCapabilities"

export const emptyManagedSiteQueries: ManagedSiteQueriesCapability = {
  fetchSiteUserGroups: async () => [],
  fetchAccountAvailableModels: async () => [],
}
