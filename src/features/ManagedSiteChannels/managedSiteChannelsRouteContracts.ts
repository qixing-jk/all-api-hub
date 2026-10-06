import type { ManagedSiteType } from "~/constants/siteType"

export type ManagedSiteChannelsRouteProps = {
  siteType: ManagedSiteType
  refreshKey?: number
  routeParams?: Record<string, string>
  onReplaceRouteQuery: (query: Record<string, string | undefined>) => void
}
