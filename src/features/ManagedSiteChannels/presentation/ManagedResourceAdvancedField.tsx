import type { TFunction } from "i18next"
import { useId } from "react"

import { Button, CompactMultiSelect, Label } from "~/components/ui"
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "~/components/ui/combobox"
import {
  readResourceList,
  readResourceString,
} from "~/features/ResourceEditor/resourceEditorProjection"
import { ResourceJsonField } from "~/features/ResourceEditor/ResourceJsonField"
import type {
  EditableResourceProjection,
  ResourceFieldValue,
} from "~/services/apiAdapters/contracts/managedResourceNative"

import type { ManagedResourceFieldPresentation } from "./managedResourceFieldPolicy"

/** Reuses structured JSON and model suggestion controls selected by presentation policy. */
export function ManagedResourceAdvancedField({
  t,
  presentation,
  values,
  disabled,
  errorMessage,
  onValueChange,
}: {
  t: TFunction
  presentation: ManagedResourceFieldPresentation
  values: EditableResourceProjection
  disabled: boolean
  errorMessage?: string
  onValueChange: (fieldId: string, value: ResourceFieldValue) => void
}) {
  const id = useId()
  const fieldId = presentation.fieldId
  const label = presentation.resolveLabel(t)
  const help = presentation.resolveHelp?.(t)
  const value = readResourceString(values, fieldId)
  const suggestions = presentation.suggestionSourceFieldId
    ? readResourceList(values, presentation.suggestionSourceFieldId)
    : []
  const describedBy = `${id}-help${errorMessage ? ` ${id}-error` : ""}`
  if (
    presentation.advancedControl === "string-map" ||
    presentation.advancedControl === "json"
  ) {
    const targetFieldId = presentation.mapKeysTargetFieldId
    const currentModels = targetFieldId
      ? readResourceList(values, targetFieldId)
      : []
    let missingModels: string[] = []
    if (targetFieldId) {
      try {
        const mapping: unknown = JSON.parse(value || "{}")
        if (mapping && typeof mapping === "object" && !Array.isArray(mapping)) {
          missingModels = Object.entries(mapping)
            .filter(
              ([key, mapped]) =>
                key.trim() &&
                typeof mapped === "string" &&
                !currentModels.includes(key),
            )
            .map(([key]) => key)
        }
      } catch {
        /* Invalid JSON is explained by the adapter's field validation. */
      }
    }
    return (
      <ResourceJsonField
        t={t}
        label={label}
        help={help}
        placeholder={presentation.resolvePlaceholder?.(t)}
        value={value}
        onChange={(next) => onValueChange(fieldId, next)}
        disabled={disabled}
        stringMap={presentation.advancedControl === "string-map"}
        errorMessage={errorMessage}
        actions={
          targetFieldId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || missingModels.length === 0}
              onClick={() =>
                onValueChange(targetFieldId, [
                  ...new Set([...currentModels, ...missingModels]),
                ])
              }
            >
              {t("managedSiteChannels:editor.doneHub.modelMapping.addModels")}
            </Button>
          )
        }
      />
    )
  }
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {presentation.advancedControl === "model-input" ? (
        <Combobox
          items={[...new Set([...suggestions, ...(value ? [value] : [])])]}
          value={value || null}
          inputValue={value}
          onInputValueChange={(next, details) => {
            // This is a free-form model name. Closing the suggestion popup
            // must not clear text that was not selected from the inventory.
            if (
              details.reason === "input-change" ||
              details.reason === "item-press"
            )
              onValueChange(fieldId, next)
            else details.cancel()
          }}
          onValueChange={(next, details) => {
            if (details.reason === "item-press" && next !== null)
              onValueChange(fieldId, next)
          }}
          disabled={disabled}
        >
          <ComboboxInput
            id={id}
            className="w-full"
            placeholder={presentation.resolvePlaceholder?.(t)}
            aria-describedby={describedBy}
            aria-invalid={Boolean(errorMessage)}
            disabled={disabled}
          />
          <ComboboxContent>
            <ComboboxList>
              {(item: string) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      ) : (
        <CompactMultiSelect
          id={id}
          aria-label={label}
          aria-describedby={describedBy}
          aria-invalid={Boolean(errorMessage)}
          displayMode="chips"
          options={suggestions.map((model) => ({ value: model, label: model }))}
          selected={readResourceList(values, fieldId)}
          onChange={(next) => onValueChange(fieldId, next)}
          disabled={disabled}
          allowCustom
          parseCommaStrings
        />
      )}
      <p
        id={`${id}-help`}
        className="text-muted-foreground text-xs leading-relaxed"
      >
        {help}
      </p>
      {errorMessage && (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-xs text-red-600 dark:text-red-400"
        >
          {errorMessage}
        </p>
      )}
    </div>
  )
}
