import {
  CompactMultiSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import { ResourceFieldLabel } from "~/features/ResourceEditor/components/ResourceFieldLabel"
import { ResourceAutomaticOptionFeedback } from "~/features/ResourceEditor/components/ResourceOptionLoadFeedback"
import type {
  NativeResourceFieldContext,
  NativeResourceFieldDecoration,
  NativeResourceResolvedField,
} from "~/features/ResourceEditor/model/nativeResourceEditorContracts"
import {
  normalizeResourceList,
  readResourceList,
} from "~/features/ResourceEditor/model/resourceEditorProjection"
import { getResourceFieldOptionLabel } from "~/features/ResourceEditor/model/resourceFieldPolicy"
import { RESOURCE_OPTION_LOAD_STATUSES } from "~/features/ResourceEditor/options/useLoadedResourceOptions"
import type { ResourceFieldOption } from "~/services/apiAdapters/contracts/resourceNative"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"

/** Renders selection tokens, dynamic option feedback and multi-value controls. */
export function NativeResourceChoiceField<TSection extends string>({
  field,
  context,
  decoration,
}: {
  field: NativeResourceResolvedField<TSection>
  context: NativeResourceFieldContext<TSection>
  decoration: NativeResourceFieldDecoration
}) {
  const { descriptor, presentation } = field
  const {
    t,
    values,
    disabled,
    onValueChange,
    onRetryControlledOptions,
    optionLoading,
    selection,
  } = context
  const { retry } = optionLoading
  const {
    selectOptionsByFieldId,
    selectTokenRegistriesByFieldId,
    resolveSelectValue,
  } = selection

  const {
    id,
    label,
    describedBy,
    fieldDisabled,
    errorMessage,
    help,
    error,
    optionControl,
    isManualOptionLoader,
    optionState,
    controlledOptionState,
    resolvedOptions,
  } = decoration
  if (
    descriptor.type !== RESOURCE_FIELD_TYPES.Select &&
    descriptor.type !== RESOURCE_FIELD_TYPES.MultiSelect
  )
    return null

  const loadedOptions = resolvedOptions ?? descriptor.options
  const controlledOptionUnavailable =
    controlledOptionState !== undefined &&
    (controlledOptionState.status !== RESOURCE_OPTION_LOAD_STATUSES.Ready ||
      controlledOptionState.options.length === 0)
  const optionValues =
    descriptor.type === RESOURCE_FIELD_TYPES.Select
      ? selectOptionsByFieldId.get(descriptor.fieldId) ?? []
      : loadedOptions.map((option) => option.value)
  const optionsByValue = new Map<string, ResourceFieldOption>()
  // Dynamic providers occasionally repeat an option. Retaining the first
  // entry gives one deterministic label and selection target for that value.
  for (const option of loadedOptions) {
    if (!optionsByValue.has(option.value)) {
      optionsByValue.set(option.value, option)
    }
  }
  if (descriptor.type === RESOURCE_FIELD_TYPES.Select) {
    const resourceValue = values[descriptor.fieldId]
    const selectedValue =
      typeof resourceValue === "string" ? resourceValue : null
    type SelectOption = {
      uiValue: string
      resourceValue: string | null
      displayLabel?: string
      secondaryLabel?: string
    }
    const resourceOptions: Array<
      Omit<SelectOption, "uiValue" | "resourceValue"> & {
        resourceValue: string
      }
    > = [
      ...(selectedValue && !optionValues.includes(selectedValue)
        ? [{ resourceValue: selectedValue }]
        : []),
      ...optionValues.map((value) => {
        const option = optionsByValue.get(value)
        return {
          resourceValue: value,
          displayLabel: option?.displayLabel,
          secondaryLabel: option?.secondaryLabel,
        }
      }),
    ]
    const tokenRegistry = selectTokenRegistriesByFieldId.get(descriptor.fieldId)
    if (!tokenRegistry) return null
    const selectOptions: SelectOption[] = [
      ...(descriptor.nullable && presentation.resolveNullableOptionLabel
        ? [
            {
              uiValue: tokenRegistry.nullToken,
              resourceValue: null,
              displayLabel: presentation.resolveNullableOptionLabel(t),
            },
          ]
        : []),
      ...resourceOptions.map((option) => ({
        ...option,
        uiValue: tokenRegistry.tokenByResourceValue.get(option.resourceValue)!,
      })),
    ]
    const selectedUiValue =
      selectedValue === null
        ? descriptor.nullable && presentation.resolveNullableOptionLabel
          ? tokenRegistry.nullToken
          : undefined
        : tokenRegistry.tokenByResourceValue.get(selectedValue)
    return (
      <div key={descriptor.fieldId}>
        <ResourceFieldLabel htmlFor={id} required={descriptor.required}>
          {label}
        </ResourceFieldLabel>
        <Select
          value={selectedUiValue ?? ""}
          onValueChange={(nextUiValue) => {
            const selection = resolveSelectValue(
              descriptor.fieldId,
              nextUiValue,
            )
            if (!selection.active) return
            onValueChange(descriptor.fieldId, selection.value)
          }}
          disabled={
            fieldDisabled ||
            controlledOptionUnavailable ||
            (presentation.optionSourceFieldIds !== undefined &&
              optionValues.length === 0)
          }
          required={descriptor.required}
        >
          <SelectTrigger
            id={id}
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={describedBy}
          >
            <SelectValue placeholder={presentation.resolvePlaceholder?.(t)} />
          </SelectTrigger>
          <SelectContent>
            {selectOptions.map((option) => (
              <SelectItem key={option.uiValue} value={option.uiValue}>
                <span>
                  {option.displayLabel ??
                    getResourceFieldOptionLabel(
                      presentation,
                      option.resourceValue ?? "",
                      t,
                    )}
                </span>
                {option.secondaryLabel ? (
                  <span className="text-muted-foreground ml-2 text-xs">
                    {option.secondaryLabel}
                  </span>
                ) : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ResourceAutomaticOptionFeedback
          t={t}
          label={label}
          disabled={disabled}
          state={isManualOptionLoader ? undefined : optionState}
          emptyMessage={controlledOptionState?.emptyMessage}
          optionCount={optionValues.length}
          announceControlledEmpty
          onRetry={() =>
            controlledOptionState
              ? onRetryControlledOptions?.(descriptor.fieldId)
              : retry(descriptor.fieldId)
          }
        />
        {optionControl && <div className="mt-density-2">{optionControl}</div>}
        {help}
        {error}
      </div>
    )
  }
  return (
    <div key={descriptor.fieldId}>
      <ResourceFieldLabel required={descriptor.required}>
        {label}
      </ResourceFieldLabel>
      <CompactMultiSelect
        options={loadedOptions.map((option) => ({
          value: option.value,
          label: option.displayLabel ?? option.value,
        }))}
        selected={readResourceList(values, descriptor.fieldId)}
        onChange={(nextValue) =>
          onValueChange(descriptor.fieldId, normalizeResourceList(nextValue))
        }
        disabled={fieldDisabled || controlledOptionUnavailable}
        allowCustom
        placeholder={presentation.resolvePlaceholder?.(t)}
        aria-label={label}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={describedBy}
        aria-required={descriptor.required}
      />
      <ResourceAutomaticOptionFeedback
        t={t}
        label={label}
        disabled={disabled}
        state={isManualOptionLoader ? undefined : optionState}
        emptyMessage={controlledOptionState?.emptyMessage}
        optionCount={loadedOptions.length}
        onRetry={() =>
          controlledOptionState
            ? onRetryControlledOptions?.(descriptor.fieldId)
            : retry(descriptor.fieldId)
        }
      />
      {optionControl && <div className="mt-density-2">{optionControl}</div>}
      {help}
      {error}
    </div>
  )
}
