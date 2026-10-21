import {
  CompactMultiSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "~/components/ui"
import { OrderedResourceSelection } from "~/features/ResourceEditor/components/OrderedResourceSelection"
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
  const isAutomaticallyLoadingOptions =
    !isManualOptionLoader &&
    optionState?.status === RESOURCE_OPTION_LOAD_STATUSES.Loading
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
    const selectionDisabled =
      fieldDisabled ||
      controlledOptionUnavailable ||
      (presentation.optionSourceFieldIds !== undefined &&
        optionValues.length === 0)
    const changeSelection = (nextUiValue: string) => {
      const selection = resolveSelectValue(descriptor.fieldId, nextUiValue)
      if (selection.active) onValueChange(descriptor.fieldId, selection.value)
    }
    const optionFeedback = (
      <>
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
      </>
    )
    if (
      presentation.renderer === RESOURCE_FIELD_TYPES.Select &&
      presentation.selectLayout === "cards"
    ) {
      return (
        <div className="@container">
          <ResourceFieldLabel required={descriptor.required}>
            {label}
            {isAutomaticallyLoadingOptions && (
              <Spinner
                size="sm"
                className="shrink-0"
                aria-label={t("common:status.loadingField", { field: label })}
              />
            )}
          </ResourceFieldLabel>
          <div
            id={id}
            role="radiogroup"
            aria-label={label}
            aria-describedby={describedBy}
            aria-invalid={Boolean(errorMessage)}
            aria-busy={isAutomaticallyLoadingOptions}
            className="grid grid-cols-2 gap-2 @min-[34rem]:grid-cols-4"
          >
            {selectOptions.map((option) => {
              const optionLabel =
                option.displayLabel ??
                getResourceFieldOptionLabel(
                  presentation,
                  option.resourceValue ?? "",
                  t,
                )
              const badge = presentation.resolveOptionBadge?.(
                t,
                option.resourceValue ?? "",
                values,
              )
              return (
                <label
                  key={option.uiValue}
                  className="border-border bg-background text-foreground has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-ring flex min-h-14 min-w-0 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium has-focus-visible:ring-2 has-disabled:cursor-not-allowed has-disabled:opacity-50"
                >
                  <input
                    type="radio"
                    name={id}
                    value={option.uiValue}
                    checked={selectedUiValue === option.uiValue}
                    disabled={selectionDisabled}
                    aria-label={optionLabel}
                    className="accent-primary size-3.5 shrink-0"
                    onChange={() => changeSelection(option.uiValue)}
                  />
                  <span className="min-w-0">
                    <span className="block break-words">{optionLabel}</span>
                    {badge && (
                      <span className="text-muted-foreground mt-1 text-xs font-normal">
                        {badge}
                      </span>
                    )}
                  </span>
                </label>
              )
            })}
          </div>
          {optionFeedback}
          {help}
          {error}
        </div>
      )
    }
    return (
      <div key={descriptor.fieldId}>
        <ResourceFieldLabel htmlFor={id} required={descriptor.required}>
          {label}
        </ResourceFieldLabel>
        <Select
          value={selectedUiValue ?? ""}
          onValueChange={changeSelection}
          disabled={selectionDisabled}
          required={descriptor.required}
        >
          <SelectTrigger
            id={id}
            loading={isAutomaticallyLoadingOptions}
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
        {optionFeedback}
        {help}
        {error}
      </div>
    )
  }
  const selectedValues = normalizeResourceList(
    readResourceList(values, descriptor.fieldId),
  )
  // Before the first loader effect runs, options have no state yet. Keep the
  // saved draft intact while withholding unresolved fallback labels from view.
  const waitingForSelectedLabels =
    !isManualOptionLoader &&
    (isAutomaticallyLoadingOptions ||
      (optionState === undefined &&
        descriptor.optionLoader !== undefined &&
        context.onLoadOptions !== undefined)) &&
    selectedValues.some((value) => !optionsByValue.has(value))

  return (
    <div key={descriptor.fieldId}>
      <ResourceFieldLabel required={descriptor.required}>
        {label}
      </ResourceFieldLabel>
      {presentation.multiSelectLayout === "cards" ? (
        <div
          id={id}
          role="group"
          aria-label={label}
          aria-describedby={describedBy}
          aria-invalid={Boolean(errorMessage)}
          aria-busy={isAutomaticallyLoadingOptions || waitingForSelectedLabels}
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {[...optionsByValue.values()].map((option, index) => (
            <label
              key={option.value}
              className="border-border bg-background text-foreground has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-ring flex min-w-0 cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm has-focus-visible:ring-2 has-disabled:cursor-not-allowed has-disabled:opacity-50"
            >
              <input
                type="checkbox"
                checked={selectedValues.includes(option.value)}
                disabled={
                  fieldDisabled ||
                  controlledOptionUnavailable ||
                  waitingForSelectedLabels
                }
                aria-label={option.displayLabel ?? option.value}
                aria-describedby={
                  option.description ? `${id}-option-${index}` : undefined
                }
                className="accent-primary mt-1 size-3.5 shrink-0"
                onChange={(event) =>
                  onValueChange(
                    descriptor.fieldId,
                    event.target.checked
                      ? [...selectedValues, option.value]
                      : selectedValues.filter(
                          (value) => value !== option.value,
                        ),
                  )
                }
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium break-words">
                    {option.displayLabel ?? option.value}
                  </span>
                  {option.secondaryLabel && (
                    <span className="text-muted-foreground text-xs">
                      {option.secondaryLabel}
                    </span>
                  )}
                </span>
                {option.description && (
                  <span
                    id={`${id}-option-${index}`}
                    className="text-muted-foreground mt-1 block text-xs break-words"
                  >
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          ))}
          {isAutomaticallyLoadingOptions && (
            <Spinner
              size="sm"
              aria-label={t("common:status.loadingField", { field: label })}
            />
          )}
        </div>
      ) : (
        <CompactMultiSelect
          loading={isAutomaticallyLoadingOptions || waitingForSelectedLabels}
          options={loadedOptions.map((option) => ({
            value: option.value,
            label: option.displayLabel ?? option.value,
          }))}
          selected={waitingForSelectedLabels ? [] : selectedValues}
          onChange={(nextValue) =>
            onValueChange(descriptor.fieldId, normalizeResourceList(nextValue))
          }
          disabled={
            fieldDisabled ||
            controlledOptionUnavailable ||
            waitingForSelectedLabels
          }
          allowCustom
          placeholder={
            waitingForSelectedLabels
              ? t("common:status.loadingField", { field: label })
              : presentation.resolvePlaceholder?.(t)
          }
          aria-label={label}
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={describedBy}
          aria-required={descriptor.required}
        />
      )}
      {presentation.ordered &&
        !waitingForSelectedLabels &&
        selectedValues.length > 0 && (
          <OrderedResourceSelection
            t={t}
            selectedValues={selectedValues}
            optionsByValue={optionsByValue}
            disabled={fieldDisabled || controlledOptionUnavailable}
            onChange={(next) => onValueChange(descriptor.fieldId, next)}
          />
        )}
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
