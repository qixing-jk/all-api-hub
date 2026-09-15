import { GripVertical } from "lucide-react"

import { IconButton } from "~/components/ui"
import type { SearchResultWithHighlight } from "~/features/AccountManagement/hooks/useAccountSearch"
import { cn } from "~/lib/utils"
import type { DisplaySiteData } from "~/types"

import AccountListItem from "./AccountListItem"

export interface AccountListHandleItemProps {
  site: DisplaySiteData
  highlights?: SearchResultWithHighlight["highlights"]
  onCopyKey: (site: DisplaySiteData) => void
  onDeleteWithDialog: (site: DisplaySiteData) => void
  showContextBoost?: boolean
  showCreatedAt?: boolean
  isDragDisabled: boolean
  handleLabel: string
  showHandle: boolean
  className?: string
  selectionControl?: React.ReactNode
}

interface AccountListItemRowLayoutProps {
  site: DisplaySiteData
  highlights?: SearchResultWithHighlight["highlights"]
  onCopyKey: (site: DisplaySiteData) => void
  onDeleteWithDialog: (site: DisplaySiteData) => void
  showContextBoost?: boolean
  showCreatedAt?: boolean
  className?: string
  selectionControl?: React.ReactNode
  handle?: React.ReactNode
}

/**
 * Renders the shared row layout used by account list items.
 */
export function AccountListItemRowLayout({
  site,
  highlights,
  onCopyKey,
  onDeleteWithDialog,
  showContextBoost,
  showCreatedAt,
  className,
  selectionControl,
  handle,
}: AccountListItemRowLayoutProps) {
  return (
    <div
      className={cn(
        "gap-density-2 py-density-2-5 sm:py-density-3 flex items-center px-3 transition-all sm:px-4",
        className,
      )}
    >
      {selectionControl}
      {handle}
      <div className="min-w-0 flex-1">
        <AccountListItem
          site={site}
          highlights={highlights}
          onDeleteWithDialog={onDeleteWithDialog}
          onCopyKey={onCopyKey}
          showCreatedAt={showCreatedAt}
          showContextBoost={showContextBoost}
        />
      </div>
    </div>
  )
}

interface NonSortableAccountListItemProps extends AccountListHandleItemProps {
  onActivateDnd?: () => void
}

/**
 * Renders a static account list item with an optional drag handle activator.
 */
export function NonSortableAccountListItem({
  site,
  highlights,
  onCopyKey,
  onDeleteWithDialog,
  showContextBoost,
  showCreatedAt,
  isDragDisabled,
  handleLabel,
  showHandle,
  className,
  selectionControl,
  onActivateDnd,
}: NonSortableAccountListItemProps) {
  const handleActivateDnd = () => {
    if (!showHandle || isDragDisabled || !onActivateDnd) {
      return
    }

    onActivateDnd()
  }

  return (
    <AccountListItemRowLayout
      site={site}
      highlights={highlights}
      onDeleteWithDialog={onDeleteWithDialog}
      onCopyKey={onCopyKey}
      showCreatedAt={showCreatedAt}
      showContextBoost={showContextBoost}
      className={className}
      selectionControl={selectionControl}
      handle={
        showHandle ? (
          <IconButton
            variant="ghost"
            size="xs"
            aria-label={handleLabel}
            disabled={isDragDisabled}
            className="text-faint-foreground hover:text-secondary-foreground shrink-0 focus-visible:ring-2 focus-visible:ring-offset-2"
            onClick={handleActivateDnd}
            onFocus={handleActivateDnd}
            onMouseEnter={handleActivateDnd}
            onPointerDown={handleActivateDnd}
            onTouchStart={handleActivateDnd}
          >
            <GripVertical className="h-4 w-4" />
          </IconButton>
        ) : null
      }
    />
  )
}
