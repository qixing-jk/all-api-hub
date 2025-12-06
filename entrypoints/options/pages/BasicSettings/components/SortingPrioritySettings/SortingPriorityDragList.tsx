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
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"

import type { SortingFieldConfig } from "~/types/sorting"

import { SortingCriteriaItem } from "./SortingCriteriaItem"

export interface AugmentedSortingFieldConfig extends SortingFieldConfig {
  label: string
  description?: string
}

interface SortingPriorityDragListProps {
  items: AugmentedSortingFieldConfig[]
  onDragEnd: (event: DragEndEvent) => void
  onToggleEnabled?: (id: string, enabled: boolean) => void
}

/**
 * Drag-and-drop list for sorting priority criteria using @dnd-kit.
 */
export function SortingPriorityDragList({
  items,
  onDragEnd,
  onToggleEnabled,
}: SortingPriorityDragListProps) {
  // 自定义传感器配置，优化移动端体验
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 需要移动8px才触发拖动，避免误触
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250, // 250ms后触发拖动，避免与点击事件冲突
        tolerance: 5, // 允许5px的移动容差
      },
    }),
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        {items.map((item) => (
          <SortingCriteriaItem
            key={item.id}
            item={item}
            onToggleEnabled={onToggleEnabled}
          />
        ))}
      </SortableContext>
    </DndContext>
  )
}
