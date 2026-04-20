import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"

import SortableAccountListItem from "./SortableAccountListItem"

interface AccountListDndWrapperProps {
  sortedIds: string[]
  onDragEnd: (event: DragEndEvent) => void
  children: React.ReactNode
}

/**
 *
 */
export function AccountListDndWrapper({
  sortedIds,
  onDragEnd,
  children,
}: AccountListDndWrapperProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor),
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
