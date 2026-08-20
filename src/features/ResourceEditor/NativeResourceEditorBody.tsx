import type { TFunction } from "i18next"
import { Fragment, useMemo, type ReactNode } from "react"

import {
  CompactMultiSelect,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "~/components/ui"
import type {
  EditableResourceProjection,
  ResourceFieldDescriptor,
  ResourceFieldIssue,
  ResourceFieldOption,
  ResourceFieldValue,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/resourceNative"
import {
  RESOURCE_FIELD_OPTION_LOAD_TRIGGERS,
  RESOURCE_FIELD_TYPES,
} from "~/services/apiAdapters/contracts/resourceNative"

import {
  normalizeResourceList,
  readResourceBoolean,
  readResourceList,
  readResourceNumber,
  readResourceString,
} from "./resourceEditorProjection"
import {
  getResourceFieldOptionLabel,
  resolveResourceFieldPolicy,
  RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS,
  type ResourceEditorFieldPolicy,
  type ResourceFieldPresentation,
} from "./resourceFieldPolicy"
import {
  ResourceAutomaticOptionFeedback,
  ResourceManualOptionControl,
} from "./ResourceOptionLoadFeedback"
import {
  isDynamicOptionField,
  RESOURCE_OPTION_LOAD_STATUSES,
  useLoadedResourceOptions,
  type ResourceEditorControlledOptionState,
} from "./useLoadedResourceOptions"
import { useResourceSelectFieldState } from "./useResourceSelectFieldState"

export {
  createSelectOptionTokenRegistry,
  createSelectOptionTokenSnapshot,
  reconcileSelectOptionTokenRegistry,
} from "./selectOptionTokenRegistry"
export type { ResourceEditorControlledOptionState } from "./useLoadedResourceOptions"

export type ResourceFieldRenderOverride<TSection extends string = string> =
  (field: {
    descriptor: ResourceFieldDescriptor
    presentation: ResourceFieldPresentation<TSection>
    label: string
    errorMessage?: string
    describedBy?: string
    disabled: boolean
    options?: readonly ResourceFieldOption[]
    optionControl?: ReactNode
  }) => ReactNode | undefined

export type ResourceEditorSectionRenderOverride<TSection extends string> = (
  section: TSection,
  label: string,
  children: ReactNode,
) => ReactNode | undefined

export type NativeResourceEditorBodyProps<TSection extends string> = {
  t: TFunction
  descriptors: readonly ResourceFieldDescriptor[]
  policy: ResourceEditorFieldPolicy<TSection>
  sectionOrder: Readonly<Record<TSection, number>>
  sectionLabelResolvers: Readonly<Record<TSection, (t: TFunction) => string>>
  values: EditableResourceProjection
  fieldIssues?: readonly ResourceFieldIssue[]
  disabled?: boolean
  onValueChange: (fieldId: string, value: ResourceFieldValue) => void
  onLoadOptions?: (
    fieldId: string,
    values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ) => Promise<readonly ResourceFieldOption[]>
  controlledOptionStates?: Readonly<
    Record<string, ResourceEditorControlledOptionState | undefined>
  >
  onRetryControlledOptions?: (fieldId: string) => void
  renderFieldOverride?: ResourceFieldRenderOverride<TSection>
  renderSectionOverride?: ResourceEditorSectionRenderOverride<TSection>
}

const fieldDomId = (fieldId: string) =>
  `resource-editor-${fieldId.replace(/[^a-zA-Z0-9_-]/g, "-")}`

/** Announces a field-specific validation message to assistive technology. */
function FieldMessage({ id, message }: { id: string; message: string }) {
  return (
    <p
      id={id}
      role="alert"
      className="mt-1 text-xs text-red-600 dark:text-red-400"
    >
      {message}
    </p>
  )
}

/** Renders fact-driven native fields while leaving provider-specific controls to an override. */
export function NativeResourceEditorBody<TSection extends string>({
  t,
  descriptors,
  policy,
  sectionOrder,
  sectionLabelResolvers,
  values,
  fieldIssues = [],
  disabled = false,
  onValueChange,
  onLoadOptions,
  controlledOptionStates,
  onRetryControlledOptions,
  renderFieldOverride,
  renderSectionOverride,
}: NativeResourceEditorBodyProps<TSection>) {
  const resolvedFields = useMemo(
    () => resolveResourceFieldPolicy(descriptors, policy, sectionOrder).fields,
    [descriptors, policy, sectionOrder],
  )
  const fields = useMemo(
    () =>
      resolvedFields.filter(
        ({ presentation }) => presentation.visibleWhen?.(values) ?? true,
      ),
    [resolvedFields, values],
  )
  const activeDescriptors = useMemo(
    () => fields.map(({ descriptor }) => descriptor),
    [fields],
  )
  const {
    states: optionStates,
    load,
    retry,
  } = useLoadedResourceOptions(activeDescriptors, values, onLoadOptions)
  const {
    selectOptionsByFieldId,
    selectTokenRegistriesByFieldId,
    resolveSelectValue,
  } = useResourceSelectFieldState({
    fields,
    values,
    optionStates,
    controlledOptionStates,
    canLoadOptions: Boolean(onLoadOptions),
    onValueChange,
  })

  const issuesByFieldId = new Map(
    fieldIssues.map((issue) => [issue.fieldId, issue.code]),
  )
  const fieldsBySection = new Map<TSection, typeof fields>()
  for (const field of fields) {
    const sectionFields = fieldsBySection.get(field.presentation.section) ?? []
    sectionFields.push(field)
    fieldsBySection.set(field.presentation.section, sectionFields)
  }

  const renderField = ({
    descriptor,
    presentation,
  }: (typeof fields)[number]) => {
    const issueCode = issuesByFieldId.get(descriptor.fieldId)
    const errorMessage = issueCode
      ? presentation.issueLabelResolvers?.[issueCode]?.(t) ??
        RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.error(t)
      : undefined
    const id = fieldDomId(descriptor.fieldId)
    const helpId = presentation.resolveHelp ? `${id}-help` : undefined
    const errorId = errorMessage ? `${id}-error` : undefined
    const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined
    const label = presentation.resolveLabel(t)
    const controlledOptionState = controlledOptionStates?.[descriptor.fieldId]
    const optionState =
      controlledOptionState ??
      (onLoadOptions && isDynamicOptionField(descriptor)
        ? optionStates.get(descriptor.fieldId)
        : undefined)
    const resolvedOptions =
      descriptor.type === RESOURCE_FIELD_TYPES.Select ||
      descriptor.type === RESOURCE_FIELD_TYPES.MultiSelect
        ? optionState?.options ?? descriptor.options
        : undefined
    const isManualOptionLoader =
      isDynamicOptionField(descriptor) &&
      descriptor.optionLoader?.trigger ===
        RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual &&
      Boolean(onLoadOptions || onRetryControlledOptions)
    const optionControl = isManualOptionLoader ? (
      <ResourceManualOptionControl
        t={t}
        label={label}
        disabled={disabled}
        state={optionState}
        emptyMessage={controlledOptionState?.emptyMessage}
        optionCount={resolvedOptions?.length ?? 0}
        onLoad={() =>
          controlledOptionState
            ? onRetryControlledOptions?.(descriptor.fieldId)
            : load(descriptor.fieldId)
        }
      />
    ) : undefined
    const override = renderFieldOverride?.({
      descriptor,
      presentation,
      label,
      errorMessage,
      describedBy,
      disabled,
      options: resolvedOptions,
      optionControl,
    })
    if (override !== undefined) {
      return <Fragment key={descriptor.fieldId}>{override}</Fragment>
    }
    const help =
      presentation.resolveHelp && helpId ? (
        <p id={helpId} className="text-muted-foreground mt-1 text-xs">
          {presentation.resolveHelp(t)}
        </p>
      ) : null
    const error =
      errorMessage && errorId ? (
        <FieldMessage id={errorId} message={errorMessage} />
      ) : null
    const fieldDisabled = disabled || descriptor.readOnly

    if (
      descriptor.type === RESOURCE_FIELD_TYPES.Text ||
      descriptor.type === RESOURCE_FIELD_TYPES.DateTime
    ) {
      return (
        <div key={descriptor.fieldId}>
          <Label htmlFor={id} required={descriptor.required}>
            {label}
          </Label>
          <Input
            id={id}
            type={
              descriptor.type === RESOURCE_FIELD_TYPES.DateTime
                ? "datetime-local"
                : "text"
            }
            value={readResourceString(values, descriptor.fieldId)}
            onChange={(event) =>
              onValueChange(descriptor.fieldId, event.target.value)
            }
            disabled={fieldDisabled}
            readOnly={descriptor.readOnly}
            required={descriptor.required}
            placeholder={presentation.resolvePlaceholder?.(t)}
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={describedBy}
          />
          {help}
          {error}
        </div>
      )
    }
    if (descriptor.type === RESOURCE_FIELD_TYPES.Textarea) {
      return (
        <div key={descriptor.fieldId}>
          <Label htmlFor={id} required={descriptor.required}>
            {label}
          </Label>
          <Textarea
            id={id}
            value={readResourceString(values, descriptor.fieldId)}
            onChange={(event) =>
              onValueChange(descriptor.fieldId, event.target.value)
            }
            disabled={fieldDisabled}
            readOnly={descriptor.readOnly}
            required={descriptor.required}
            rows={presentation.rows}
            placeholder={presentation.resolvePlaceholder?.(t)}
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={describedBy}
          />
          {help}
          {error}
        </div>
      )
    }
    if (descriptor.type === RESOURCE_FIELD_TYPES.Number) {
      return (
        <div key={descriptor.fieldId}>
          <Label htmlFor={id} required={descriptor.required}>
            {label}
          </Label>
          <Input
            id={id}
            type="number"
            value={readResourceNumber(values, descriptor.fieldId)}
            onChange={(event) =>
              onValueChange(
                descriptor.fieldId,
                Number.isNaN(event.target.valueAsNumber)
                  ? ""
                  : event.target.valueAsNumber,
              )
            }
            disabled={fieldDisabled}
            readOnly={descriptor.readOnly}
            required={descriptor.required}
            min={descriptor.min}
            max={descriptor.max}
            step={descriptor.step}
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={describedBy}
          />
          {help}
          {error}
        </div>
      )
    }
    if (descriptor.type === RESOURCE_FIELD_TYPES.Boolean) {
      return (
        <div key={descriptor.fieldId}>
          <Label htmlFor={id}>{label}</Label>
          <div className="mt-2">
            <Switch
              id={id}
              checked={readResourceBoolean(values, descriptor.fieldId)}
              onChange={(value) => onValueChange(descriptor.fieldId, value)}
              disabled={fieldDisabled}
              aria-invalid={Boolean(errorMessage)}
              aria-describedby={describedBy}
            />
          </div>
          {help}
          {error}
        </div>
      )
    }
    if (
      descriptor.type === RESOURCE_FIELD_TYPES.Select ||
      descriptor.type === RESOURCE_FIELD_TYPES.MultiSelect
    ) {
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
        const tokenRegistry = selectTokenRegistriesByFieldId.get(
          descriptor.fieldId,
        )
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
            uiValue: tokenRegistry.tokenByResourceValue.get(
              option.resourceValue,
            )!,
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
            <Label htmlFor={id} required={descriptor.required}>
              {label}
            </Label>
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
                <SelectValue
                  placeholder={presentation.resolvePlaceholder?.(t)}
                />
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
            {optionControl}
            {help}
            {error}
          </div>
        )
      }
      return (
        <div key={descriptor.fieldId}>
          <Label required={descriptor.required}>{label}</Label>
          <CompactMultiSelect
            options={loadedOptions.map((option) => ({
              value: option.value,
              label: option.displayLabel ?? option.value,
            }))}
            selected={readResourceList(values, descriptor.fieldId)}
            onChange={(nextValue) =>
              onValueChange(
                descriptor.fieldId,
                normalizeResourceList(nextValue),
              )
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
          {optionControl}
          {help}
          {error}
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-5">
      {[...fieldsBySection.entries()].map(([section, sectionFields]) => {
        const label = sectionLabelResolvers[section](t)
        const content = sectionFields.map(renderField)
        const override = renderSectionOverride?.(section, label, content)
        return override !== undefined ? (
          <Fragment key={section}>{override}</Fragment>
        ) : (
          <fieldset key={section} className="space-y-4">
            <legend className="text-foreground mb-3 text-sm font-semibold">
              {label}
            </legend>
            {content}
          </fieldset>
        )
      })}
    </div>
  )
}
