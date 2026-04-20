import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Bars3Icon } from "@heroicons/react/24/outline"

import { IconButton } from "~/components/ui"

import {
  AccountListItemRowLayout,
  type AccountListHandleItemProps,
} from "./AccountListBaseItem"

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
}: AccountListHandleItemProps) {
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
