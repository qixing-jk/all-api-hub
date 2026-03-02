import { Ellipsis } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"

import type { ChannelRow, RowActionsLabels } from "../types"

interface RowActionsProps {
  channel: ChannelRow
  onEdit: (channel: ChannelRow) => void
  onDelete: (ids: number[]) => void
  onSync: (channelIds: number[]) => void
  onOpenSync: (channelId: number) => Promise<void>
  onFilters: (channel: ChannelRow) => void
  isSyncing: boolean
  labels: RowActionsLabels
}

/**
 * Dropdown actions available for each channel row (edit, filters, sync, delete).
 */
export default function RowActions({
  channel,
  onEdit,
  onDelete,
  onSync,
  onOpenSync,
  onFilters,
  isSyncing,
  labels,
}: RowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8">
          <Ellipsis className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => onEdit(channel)}>
          {labels.edit}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onFilters(channel)}>
          {labels.filters}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void onOpenSync(channel.id)}>
          {labels.openSync}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSync([channel.id])}
          disabled={isSyncing}
        >
          {isSyncing ? labels.syncing : labels.sync}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onDelete([channel.id])}
        >
          {labels.delete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
