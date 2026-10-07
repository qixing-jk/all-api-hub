export interface SyncRequestToken {
  generation: number
  requestId: number
}

export interface ManagedSiteModelSyncProps {
  refreshKey?: number
  routeParams?: Record<string, string>
}
