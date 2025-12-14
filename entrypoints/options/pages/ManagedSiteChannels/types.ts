import type { Row } from "@tanstack/react-table"

import type { ManagedSiteChannel } from "~/types/managedSite"

export type ChannelRow = ManagedSiteChannel
export type CheckboxState = boolean | "indeterminate"

export type RowActionsLabels = {
  edit: string
  sync: string
  syncing: string
  delete: string
}

export interface RowActionsProps {
  row: Row<ChannelRow>
  onEdit: () => void
  onDelete: () => void
  onSync: () => void
  isSyncing: boolean
  labels: RowActionsLabels
}
