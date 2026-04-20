import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Bars3Icon } from "@heroicons/react/24/outline"

import { IconButton } from "~/components/ui"
import type { SearchResultWithHighlight } from "~/features/AccountManagement/hooks/useAccountSearch"
import { cn } from "~/lib/utils"
import type { DisplaySiteData } from "~/types"

import AccountListItem from "./AccountListItem"

interface SortableAccountListItemProps {
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
function AccountListItemRowLayout({
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

interface NonSortableAccountListItemProps extends SortableAccountListItemProps {
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
            onTouchStart={handleActivateDnd}
            onMouseEnter={handleActivateDnd}
          >
            <Bars3Icon className="h-4 w-4" />
          </IconButton>
        ) : null
      }
    />
  )
}

/**
 * Sortable wrapper around AccountListItem that adds drag handle controls and DnDKit bindings.
 */
function SortableAccountListItem({
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
}: SortableAccountListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: site.id,
    disabled: isDragDisabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "relative z-10" : undefined}
    >
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
              ref={setActivatorNodeRef}
              variant="ghost"
              size="xs"
              aria-label={handleLabel}
              disabled={isDragDisabled}
              className="shrink-0 text-gray-400 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-offset-2"
              {...listeners}
              {...attributes}
            >
              <Bars3Icon className="h-4 w-4" />
            </IconButton>
          ) : null
        }
      />
    </div>
  )
}

export default SortableAccountListItem
