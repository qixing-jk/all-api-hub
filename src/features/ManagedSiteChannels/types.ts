import type { ManagedSiteChannel } from "~/types/managedSite"
import type { ManagedUpstreamResourceRef } from "~/types/managedUpstreamResource"

export type ChannelRow = ManagedSiteChannel & {
  resourceRef?: ManagedUpstreamResourceRef
}
