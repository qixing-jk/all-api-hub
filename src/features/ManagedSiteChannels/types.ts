import type { ManagedSiteChannel } from "~/types/managedSite"
import type { ManagedUpstreamResourceRef } from "~/types/managedUpstreamResource"

export type ChannelRow = ManagedSiteChannel & {
  resourceRef?: ManagedUpstreamResourceRef
}

export type CheckboxState = boolean | "indeterminate"

export type RowActionsLabels = {
  trigger: string
  edit: string
  view: string
  migrate: string
  sync: string
  syncing: string
  openSync: string
  filters: string
  delete: string
}
