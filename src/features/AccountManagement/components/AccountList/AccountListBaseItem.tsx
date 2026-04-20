import { Bars3Icon } from "@heroicons/react/24/outline"

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
  showCreatedAt?: boolean
  className?: string
  selectionControl?: React.ReactNode
  handle?: React.ReactNode
}

/**
 *
 */
export function AccountListItemRowLayout({
  site,
  highlights,
  onCopyKey,
  onDeleteWithDialog,
  showCreatedAt,
  className,
  selectionControl,
  handle,
}: AccountListItemRowLayoutProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2.5 transition-all sm:px-4 sm:py-3",
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
        />
      </div>
    </div>
  )
}

interface NonSortableAccountListItemProps extends AccountListHandleItemProps {
  onActivateDnd?: () => void
}

/**
 *
 */
export function NonSortableAccountListItem({
  site,
  highlights,
  onCopyKey,
  onDeleteWithDialog,
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
      className={className}
      selectionControl={selectionControl}
      handle={
        showHandle ? (
          <IconButton
            variant="ghost"
            size="xs"
            aria-label={handleLabel}
            disabled={isDragDisabled}
            className="shrink-0 text-gray-400 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-offset-2"
            onClick={handleActivateDnd}
            onFocus={handleActivateDnd}
            onMouseEnter={handleActivateDnd}
            onPointerDown={handleActivateDnd}
            onTouchStart={handleActivateDnd}
          >
            <Bars3Icon className="h-4 w-4" />
          </IconButton>
        ) : null
      }
    />
  )
}
