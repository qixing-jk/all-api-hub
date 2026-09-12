import type { TFunction } from "i18next"
import { Plus, Trash2 } from "lucide-react"
import { useId } from "react"
import { useTranslation } from "react-i18next"

import { Button, Input, Label } from "~/components/ui"
import { readResourceList } from "~/features/ResourceEditor/resourceEditorProjection"
import type {
  EditableResourceProjection,
  ResourceFieldDescriptor,
  ResourceFieldValue,
} from "~/services/apiAdapters/contracts/resourceNative"

import type { ManagedResourceFieldPresentation } from "./managedResourceFieldPolicy"

/** Renders reusable advanced channel controls without provider protocol knowledge. */
export function ManagedResourceAdvancedProjectionField({
  t,
  descriptor,
  presentation,
  values,
  disabled,
  errorMessage,
  onValueChange,
}: {
  t: TFunction
  descriptor: ResourceFieldDescriptor
  presentation: ManagedResourceFieldPresentation
  values: EditableResourceProjection
  disabled: boolean
  errorMessage?: string
  onValueChange: (id: string, value: ResourceFieldValue) => void
}) {
  const id = useId()
  const { i18n } = useTranslation()
  const label = presentation.resolveLabel(t)
  const fieldId = descriptor.fieldId
  const role = presentation.channelFieldRole
  const list = readResourceList(values, fieldId)
  const suggestions = presentation.suggestionFieldId
    ? readResourceList(values, presentation.suggestionFieldId)
    : []
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const describedBy = [helpId, errorMessage ? errorId : undefined]
    .filter(Boolean)
    .join(" ")
  const help = (
    <p id={helpId} className="text-muted-foreground mt-1 text-xs">
      {presentation.resolveHelp?.(t)}
    </p>
  )
  const error = errorMessage ? (
    <p id={errorId} role="alert" className="mt-1 text-xs text-red-600">
      {errorMessage}
    </p>
  ) : null
  if (role === "timestamp" || role === "model-summary") {
    const timestamp = values[fieldId]
    const text =
      role === "timestamp"
        ? typeof timestamp === "number" &&
          timestamp > 0 &&
          Number.isFinite(new Date(timestamp * 1000).getTime())
          ? new Date(timestamp * 1000).toLocaleString(i18n.language)
          : t("managedSiteChannels:editor.advanced.neverChecked")
        : list.length
          ? list.join(", ")
          : t("managedSiteChannels:editor.advanced.noModels")
    return (
      <div className="text-muted-foreground text-xs">
        <span className="font-medium">{label}: </span>
        <span className="break-all">{text}</span>
      </div>
    )
  }
  if (role !== "string-mapping") return null
  const change = (index: number, value: string) => {
    const next = [...list]
    next[index] = value
    onValueChange(fieldId, next)
  }
  return (
    <div>
      <Label>{label}</Label>
      {help}
      {descriptor.readOnly ? (
        <p role="alert" className="text-muted-foreground text-xs">
          {t("managedSiteChannels:editor.advanced.invalidExisting")}
        </p>
      ) : null}
      <datalist id={`${id}-models`}>
        {suggestions.map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>
      <div className="mt-2 space-y-2">
        {list.flatMap((source, index) =>
          index % 2
            ? []
            : [
                <div key={index} className="flex min-w-0 items-start gap-2">
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <Label
                        htmlFor={`${id}-source-${index}`}
                        className="text-xs"
                      >
                        {t(
                          "managedSiteChannels:editor.advanced.mapping.sourcePlaceholder",
                        )}
                      </Label>
                      <Input
                        id={`${id}-source-${index}`}
                        value={source}
                        list={`${id}-models`}
                        disabled={disabled}
                        aria-label={t(
                          "managedSiteChannels:editor.advanced.mapping.source",
                          { index: index / 2 + 1 },
                        )}
                        placeholder={t(
                          "managedSiteChannels:editor.advanced.mapping.sourcePlaceholder",
                        )}
                        onChange={(e) => change(index, e.target.value)}
                        aria-invalid={Boolean(errorMessage)}
                        aria-describedby={describedBy}
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor={`${id}-target-${index}`}
                        className="text-xs"
                      >
                        {t(
                          "managedSiteChannels:editor.advanced.mapping.targetPlaceholder",
                        )}
                      </Label>
                      <Input
                        id={`${id}-target-${index}`}
                        value={list[index + 1] ?? ""}
                        list={`${id}-models`}
                        disabled={disabled}
                        aria-label={t(
                          "managedSiteChannels:editor.advanced.mapping.target",
                          { index: index / 2 + 1 },
                        )}
                        placeholder={t(
                          "managedSiteChannels:editor.advanced.mapping.targetPlaceholder",
                        )}
                        onChange={(e) => change(index + 1, e.target.value)}
                        aria-invalid={Boolean(errorMessage)}
                        aria-describedby={describedBy}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-5"
                    disabled={disabled}
                    aria-label={t(
                      "managedSiteChannels:editor.advanced.mapping.remove",
                      { index: index / 2 + 1 },
                    )}
                    onClick={() =>
                      onValueChange(
                        fieldId,
                        list.filter((_, i) => i !== index && i !== index + 1),
                      )
                    }
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>,
              ],
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        disabled={disabled}
        onClick={() => onValueChange(fieldId, [...list, "", ""])}
      >
        <Plus className="mr-1 size-4" aria-hidden />
        {t("managedSiteChannels:editor.advanced.mapping.add")}
      </Button>
      {error}
    </div>
  )
}
