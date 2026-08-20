import { Ellipsis } from "lucide-react"
import { useRef, useState } from "react"

import { IconButton } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"

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

export type RowActionsProps = {
  rowKey: string
  capabilities: {
    canEdit?: boolean
    canView?: boolean
    canDelete?: boolean
    canMigrate?: boolean
    canSync?: boolean
    canOpenSync?: boolean
    canFilter?: boolean
  }
  showMigrationAction: boolean
  isSyncing: boolean
  onEdit?: (rowKey: string) => void
  onView?: (rowKey: string) => void
  onMigrate?: (rowKey: string) => void
  onDelete?: (rowKey: string) => void
  onSync?: (rowKey: string) => Promise<void>
  onOpenSync?: (rowKey: string) => Promise<void>
  onFilters?: (rowKey: string) => void
  labels: RowActionsLabels
  testIds: {
    trigger: string
    edit: string
    delete: string
  }
}

/** Pure row-action presentation. Domain resolution and analytics stay upstream. */
export default function RowActions({
  rowKey,
  capabilities,
  showMigrationAction,
  isSyncing,
  onEdit,
  onView,
  onMigrate,
  onDelete,
  onSync,
  onOpenSync,
  onFilters,
  labels,
  testIds,
}: RowActionsProps) {
  const [isActionPending, setIsActionPending] = useState(false)
  const isActionPendingRef = useRef(false)

  const handleSync = async () => {
    if (!onSync || isActionPendingRef.current) return

    isActionPendingRef.current = true
    setIsActionPending(true)
    try {
      await onSync(rowKey)
    } finally {
      isActionPendingRef.current = false
      setIsActionPending(false)
    }
  }

  const canView = capabilities.canView && onView
  const canMigrate = capabilities.canMigrate && onMigrate
  const canEdit = capabilities.canEdit && onEdit
  const canFilter = capabilities.canFilter && onFilters
  const canOpenSync = capabilities.canOpenSync && onOpenSync
  const canSync = capabilities.canSync && onSync
  const canDelete = capabilities.canDelete && onDelete

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          size="default"
          variant="ghost"
          className="h-8 w-8"
          aria-label={labels.trigger}
          disableAutoTooltip
          disableAutoTitle
          data-testid={testIds.trigger}
          disabled={isSyncing}
          loading={isActionPending}
        >
          <Ellipsis className="h-4 w-4" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {showMigrationAction ? (
          <>
            {canView ? (
              <DropdownMenuItem onClick={() => onView(rowKey)}>
                {labels.view}
              </DropdownMenuItem>
            ) : null}
            {canView && canMigrate ? <DropdownMenuSeparator /> : null}
            {canMigrate ? (
              <DropdownMenuItem onClick={() => onMigrate(rowKey)}>
                {labels.migrate}
              </DropdownMenuItem>
            ) : null}
          </>
        ) : (
          <>
            {canEdit ? (
              <DropdownMenuItem
                data-testid={testIds.edit}
                onClick={() => onEdit(rowKey)}
              >
                {labels.edit}
              </DropdownMenuItem>
            ) : null}
            {(canFilter || canOpenSync || canSync) && canEdit ? (
              <DropdownMenuSeparator />
            ) : null}
            {canFilter ? (
              <DropdownMenuItem onClick={() => onFilters(rowKey)}>
                {labels.filters}
              </DropdownMenuItem>
            ) : null}
            {canOpenSync ? (
              <DropdownMenuItem onClick={() => void onOpenSync(rowKey)}>
                {labels.openSync}
              </DropdownMenuItem>
            ) : null}
            {canSync ? (
              <DropdownMenuItem
                onClick={() => void handleSync()}
                disabled={isSyncing}
              >
                {isSyncing ? labels.syncing : labels.sync}
              </DropdownMenuItem>
            ) : null}
            {canDelete && (canEdit || canFilter || canOpenSync || canSync) ? (
              <DropdownMenuSeparator />
            ) : null}
            {canDelete ? (
              <DropdownMenuItem
                data-testid={testIds.delete}
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(rowKey)}
              >
                {labels.delete}
              </DropdownMenuItem>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
