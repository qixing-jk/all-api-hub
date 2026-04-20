import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"

import SortableAccountListItem from "./SortableAccountListItem"

interface AccountListDndWrapperProps {
  sortedIds: string[]
  onDragEnd: (event: DragEndEvent) => void
  children: React.ReactNode
}

/**
 * Wraps account list children with the drag-and-drop runtime and sortable context.
 */
export function AccountListDndWrapper({
  sortedIds,
  onDragEnd,
  children,
}: AccountListDndWrapperProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

export { SortableAccountListItem }
