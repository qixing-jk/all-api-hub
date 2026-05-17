import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Bars2Icon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Badge, Card, CardContent, Switch } from "~/components/ui"

import { getSortingCriteriaTargetId } from "./search"
import type { AugmentedSortingFieldConfig } from "./SortingPriorityDragList"

interface SortingCriteriaItemProps {
  item: AugmentedSortingFieldConfig
  onToggleEnabled?: (id: string, enabled: boolean) => void
}

/**
 * Card row showing a sortable criteria item with drag handle, priority badge, and enable switch.
 */
export function SortingCriteriaItem({
  item,
  onToggleEnabled,
}: SortingCriteriaItemProps) {
  const { t } = useTranslation("settings")
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <Card
      id={getSortingCriteriaTargetId(item.id)}
      ref={setNodeRef}
      style={style}
      variant="default"
      padding="none"
      className="dark:hover:bg-dark-bg-secondary [container-type:inline-size] mb-2 transition-colors hover:bg-gray-100"
    >
      <CardContent padding="sm">
        <div
          data-sorting-criteria-row
          className="flex flex-col gap-3 [@container(min-width:42rem)]:flex-row [@container(min-width:42rem)]:items-center"
        >
          <div className="flex w-full min-w-0 items-start gap-2 [@container(min-width:42rem)]:w-auto [@container(min-width:42rem)]:flex-1 [@container(min-width:42rem)]:items-center">
            <div
              {...attributes}
              {...listeners}
              className="dark:text-dark-text-tertiary dark:hover:text-dark-text-secondary mt-0.5 flex shrink-0 cursor-move touch-none items-center text-gray-400 hover:text-gray-600 [@container(min-width:42rem)]:mt-0"
            >
              <Bars2Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 grow">
              <div className="dark:text-dark-text-primary text-sm font-medium break-words text-gray-900">
                {item.label}
              </div>
              <div className="dark:text-dark-text-secondary text-xs leading-relaxed break-words text-gray-500">
                {item.description}
              </div>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center justify-between gap-2 [@container(min-width:42rem)]:w-auto [@container(min-width:42rem)]:shrink-0 [@container(min-width:42rem)]:justify-end">
            <Badge variant="default" size="sm">
              {t("sorting.priority")}: {item.priority + 1}
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
