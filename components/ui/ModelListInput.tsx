import { ArrowRight } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "~/lib/utils"

import { Input } from "./input"
import { RepeatableInput } from "./RepeatableInput"

export interface ModelListItem {
  id: string
  name: string
  alias: string
}

export interface ModelListInputStrings {
  title: string
  description: string
  addLabel: string
  namePlaceholder: string
  aliasPlaceholder: string
  dragHandleLabel: string
  removeLabel: string
}

export interface ModelListInputProps {
  value: ModelListItem[]
  onChange: (value: ModelListItem[]) => void

  title?: string
  description?: string
  addLabel?: string

  namePlaceholder?: string
  aliasPlaceholder?: string

  dragHandleLabel?: string
  removeLabel?: string
  strings?: Partial<ModelListInputStrings>

  showHeader?: boolean
  className?: string
}

/**
 * createDefaultModelListItem creates a new ModelListItem with default values
 */
function createDefaultModelListItem(): ModelListItem {
  return {
    id:
      globalThis.crypto?.randomUUID?.() ??
      `model-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: "",
    alias: "",
  }
}

/**
 * ModelListInput is a specialized repeatable input for entering model name + alias pairs.
 * UI matches the common "name → alias" pattern and supports reordering and deleting rows.
 */
export function ModelListInput({
  value,
  onChange,
  title,
  description,
  addLabel,
  namePlaceholder,
  aliasPlaceholder,
  dragHandleLabel,
  removeLabel,
  strings,
  showHeader = true,
  className,
}: ModelListInputProps) {
  const { t } = useTranslation("ui")

  const resolvedTitle = title ?? strings?.title ?? t("modelListInput.title")
  const resolvedDescription =
    description ?? strings?.description ?? t("modelListInput.description")
  const resolvedAddLabel =
    addLabel ?? strings?.addLabel ?? t("modelListInput.actions.add")
  const resolvedNamePlaceholder =
    namePlaceholder ??
    strings?.namePlaceholder ??
    t("modelListInput.placeholders.name")
  const resolvedAliasPlaceholder =
    aliasPlaceholder ??
    strings?.aliasPlaceholder ??
    t("modelListInput.placeholders.alias")
  const resolvedDragHandleLabel =
    dragHandleLabel ??
    strings?.dragHandleLabel ??
    t("modelListInput.actions.reorder")
  const resolvedRemoveLabel =
    removeLabel ?? strings?.removeLabel ?? t("modelListInput.actions.remove")

  return (
    <div className={cn("space-y-2", className)}>
      {showHeader && (
        <div className="space-y-1">
          <div className="dark:text-dark-text-primary text-sm font-medium text-gray-900">
            {resolvedTitle}
          </div>
          <div className="dark:text-dark-text-secondary text-xs text-gray-500">
            {resolvedDescription}
          </div>
        </div>
      )}

      <RepeatableInput
        items={value}
        onChange={onChange}
        createItem={createDefaultModelListItem}
        addLabel={resolvedAddLabel}
        dragHandleLabel={resolvedDragHandleLabel}
        removeLabel={resolvedRemoveLabel}
        showDragHandle={value.length > 1}
        renderItem={({ item, updateItem }) => (
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <Input
                value={item.name}
                placeholder={resolvedNamePlaceholder}
                onChange={(event) =>
                  updateItem((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
            <div className="min-w-0 flex-1">
              <Input
                value={item.alias}
                placeholder={resolvedAliasPlaceholder}
                onChange={(event) =>
                  updateItem((prev) => ({ ...prev, alias: event.target.value }))
                }
              />
            </div>
          </div>
        )}
      />
    </div>
  )
}
