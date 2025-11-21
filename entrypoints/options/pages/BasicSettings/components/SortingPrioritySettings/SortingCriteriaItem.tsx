import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Bars2Icon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Badge, Card, CardContent, Switch } from "~/components/ui"

import type { AugmentedSortingFieldConfig } from "./SortingPriorityDragList"

interface SortingCriteriaItemProps {
  item: AugmentedSortingFieldConfig
  onToggleEnabled?: (id: string, enabled: boolean) => void
}

export function SortingCriteriaItem({
  item,
  onToggleEnabled
}: SortingCriteriaItemProps) {
  const { t } = useTranslation("settings")
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      variant="default"
      padding="none"
      className="dark:hover:bg-dark-bg-secondary mb-2 transition-colors hover:bg-gray-100">
      <CardContent padding="sm">
        <div className="flex items-center gap-2">
          <div
            {...attributes}
            {...listeners}
            className="dark:text-dark-text-tertiary dark:hover:text-dark-text-secondary mr-1 flex cursor-move touch-none items-center text-gray-400 hover:text-gray-600">
            <Bars2Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 grow">
            <div className="dark:text-dark-text-primary truncate text-sm font-medium text-gray-900">
              {item.label}
            </div>
            <div className="dark:text-dark-text-secondary truncate text-xs text-gray-500">
              {item.description}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="default" size="sm">
              {t(`sorting.priority`)}: {item.priority + 1}
            </Badge>
            <Switch
              checked={item.enabled}
              onChange={(checked) => onToggleEnabled?.(item.id, checked)}
              size="sm"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
