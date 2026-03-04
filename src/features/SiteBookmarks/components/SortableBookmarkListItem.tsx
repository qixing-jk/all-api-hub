import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Bars3Icon } from "@heroicons/react/24/outline"

import { IconButton } from "~/components/ui"
import { cn } from "~/lib/utils"
import type { SiteBookmark } from "~/types"

import BookmarkListItem from "./BookmarkListItem"

interface SortableBookmarkListItemProps {
  bookmark: SiteBookmark & { tags?: string[] }
  isPinned: boolean
  onOpen: () => void
  onCopyUrl: () => void
  onEdit: () => void
  onDelete: () => void
  onTogglePin: () => void
  isDragDisabled: boolean
  handleLabel: string
  showHandle: boolean
  className?: string
}

/**
 * Sortable wrapper around BookmarkListItem that adds drag handle controls and DnDKit bindings.
 */
export default function SortableBookmarkListItem({
  bookmark,
  isPinned,
  onOpen,
  onCopyUrl,
  onEdit,
  onDelete,
  onTogglePin,
  isDragDisabled,
  handleLabel,
  showHandle,
  className,
}: SortableBookmarkListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: bookmark.id,
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
      <div className={cn("flex items-center gap-2", className)}>
        {showHandle && (
          <div className="pl-2 sm:pl-3">
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
          </div>
        )}
        <div className="min-w-0 flex-1">
          <BookmarkListItem
            bookmark={bookmark}
            isPinned={isPinned}
            onOpen={onOpen}
            onCopyUrl={onCopyUrl}
            onEdit={onEdit}
            onDelete={onDelete}
            onTogglePin={onTogglePin}
          />
        </div>
      </div>
    </div>
  )
}
