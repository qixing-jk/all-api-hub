import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  restrictToVerticalAxis,
  restrictToWindowEdges,
} from "@dnd-kit/modifiers"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, X } from "lucide-react"
import React from "react"

import { cn } from "~/lib/utils"

import { Button } from "./button"
import { IconButton } from "./IconButton"

export interface RepeatableInputItem {
  id: string
}

export interface RepeatableInputProps<TItem extends RepeatableInputItem> {
  items: TItem[]
  onChange: (items: TItem[]) => void
  renderItem: (params: {
    item: TItem
    index: number
    updateItem: (updater: (prev: TItem) => TItem) => void
  }) => React.ReactNode

  className?: string
  itemClassName?: string

  isDragDisabled?: boolean
  showDragHandle?: boolean
  dragHandleLabel?: string

  isDeleteDisabled?: (item: TItem, index: number) => boolean
  onRemove?: (item: TItem, index: number) => void
  removeLabel?: string

  createItem?: () => TItem
  onAdd?: () => void
  addLabel?: string
  addButtonProps?: Omit<
    React.ComponentProps<typeof Button>,
    "type" | "onClick" | "children"
  >
}

/**
 * SortableRepeatableItem is a single item row within RepeatableInput that supports drag-and-drop sorting
 */
function SortableRepeatableItem<TItem extends RepeatableInputItem>({
  item,
  index,
  renderItem,
  updateItem,
  removeItem,
  isDeleteDisabled,
  isDragDisabled,
  showDragHandle,
  dragHandleLabel,
  removeLabel,
  itemClassName,
}: {
  item: TItem
  index: number
  renderItem: RepeatableInputProps<TItem>["renderItem"]
  updateItem: (updater: (prev: TItem) => TItem) => void
  removeItem: () => void
  isDeleteDisabled?: (item: TItem, index: number) => boolean
  isDragDisabled?: boolean
  showDragHandle?: boolean
  dragHandleLabel: string
  removeLabel: string
  itemClassName?: string
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: isDragDisabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "z-10" : ""}>
      <div
        className={cn(
          "border-input bg-background flex items-center gap-2 rounded-md border px-2 py-2 shadow-xs",
          isDragging && "opacity-50",
          itemClassName,
        )}
      >
        {showDragHandle && (
          <IconButton
            ref={setActivatorNodeRef}
            variant="ghost"
            size="xs"
            aria-label={dragHandleLabel}
            disabled={isDragDisabled}
            className="shrink-0 text-gray-400 hover:text-gray-700"
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-4 w-4" />
          </IconButton>
        )}
        <div className="min-w-0 flex-1">
          {renderItem({ item, index, updateItem })}
        </div>
        <IconButton
          variant="ghost"
          size="xs"
          aria-label={removeLabel}
          onClick={removeItem}
          disabled={isDeleteDisabled?.(item, index)}
          className="shrink-0 text-gray-400 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  )
}

/**
 * RepeatableInput renders a vertically stacked list of repeatable "rows" that can be:
 * - Reordered via drag-and-drop (dnd-kit)
 * - Edited via a render prop
 * - Removed, and optionally appended via an Add button
 */
export function RepeatableInput<TItem extends RepeatableInputItem>({
  items,
  onChange,
  renderItem,
  className,
  itemClassName,
  isDragDisabled = false,
  showDragHandle = true,
  dragHandleLabel = "Drag to reorder",
  isDeleteDisabled,
  onRemove,
  removeLabel = "Remove",
  createItem,
  onAdd,
  addLabel = "Add",
  addButtonProps,
}: RepeatableInputProps<TItem>) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return
    if (active.id === over.id) return

    const oldIndex = items.findIndex((item) => item.id === active.id)
    const newIndex = items.findIndex((item) => item.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return
    onChange(arrayMove(items, oldIndex, newIndex))
  }

  const handleAdd = () => {
    if (onAdd) return onAdd()
    if (!createItem) return
    onChange([...items, createItem()])
  }

  const showAddButton = !!(onAdd || createItem)

  return (
    <div className={cn("space-y-2", className)}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
      >
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item, index) => (
            <SortableRepeatableItem
              key={item.id}
              item={item}
              index={index}
              itemClassName={itemClassName}
              isDragDisabled={isDragDisabled}
              showDragHandle={showDragHandle}
              dragHandleLabel={dragHandleLabel}
              removeLabel={removeLabel}
              isDeleteDisabled={isDeleteDisabled}
              removeItem={() => {
                onRemove?.(item, index)
                onChange(items.filter((candidate) => candidate.id !== item.id))
              }}
              updateItem={(updater) => {
                onChange(
                  items.map((candidate) =>
                    candidate.id === item.id ? updater(candidate) : candidate,
                  ),
                )
              }}
              renderItem={renderItem}
            />
          ))}
        </SortableContext>
      </DndContext>

      {showAddButton && (
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAdd}
            {...addButtonProps}
          >
            {addLabel}
          </Button>
        </div>
      )}
    </div>
  )
}
