import type { ManagedSiteChannel } from "~/types/managedSite"

export type ChannelRow = ManagedSiteChannel

export type CheckboxState = boolean | "indeterminate"

export type RowActionsLabels = {
  edit: string
  sync: string
  syncing: string
  openSync: string
  filters: string
  delete: string
}
