import { ArrowRight } from "lucide-react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "~/lib/utils"
import { safeRandomUUID } from "~/utils/identifier"

import { Input } from "./input"
import { RepeatableInput } from "./RepeatableInput"
import { SearchableSelect } from "./SearchableSelect"

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

  /**
   * Optional upstream model identifiers used as suggestions for the `name` field.
   *
   * When provided, the name input will expose these values via an HTML `datalist`,
   * allowing users to select an existing model id while still supporting free typing.
   */
  nameSuggestions?: string[]

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
    id: safeRandomUUID("model"),
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
  nameSuggestions,
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

  const resolvedNameSuggestions = useMemo(() => {
    const candidates = nameSuggestions ?? []
    if (!candidates.length) return []
    return Array.from(
      new Set(
        candidates
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b))
  }, [nameSuggestions])
  const nameOptions = useMemo(() => {
    if (!resolvedNameSuggestions.length) return []
    return resolvedNameSuggestions.map((modelId) => ({
      value: modelId,
      label: modelId,
    }))
  }, [resolvedNameSuggestions])

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
              {nameOptions.length > 0 ? (
                <SearchableSelect
                  options={nameOptions}
                  value={item.name}
                  onChange={(nextValue) =>
                    updateItem((prev) => ({ ...prev, name: nextValue }))
                  }
                  placeholder={resolvedNamePlaceholder}
                  allowCustomValue
                />
              ) : (
                <Input
                  value={item.name}
                  placeholder={resolvedNamePlaceholder}
                  onChange={(event) =>
                    updateItem((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                />
              )}
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
