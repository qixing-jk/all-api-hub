import type { TFunction } from "i18next"
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import {
  Button,
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
} from "~/services/apiAdapters/contracts/managedResourceNative"

import {
  getResourceFieldOptionLabel,
  resolveResourceFieldPolicy,
  RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS,
  type ResourceEditorFieldPolicy,
  type ResourceFieldPresentation,
} from "./resourceFieldPolicy"

export type ResourceFieldRenderOverride<TSection extends string = string> =
  (field: {
    descriptor: ResourceFieldDescriptor
    presentation: ResourceFieldPresentation<TSection>
    label: string
    errorMessage?: string
    describedBy?: string
    disabled: boolean
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

const readString = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "string" ? values[fieldId] : ""

const readNumber = (values: EditableResourceProjection, fieldId: string) => {
  const value = values[fieldId]
  return typeof value === "number" || value === "" ? value : ""
}

const readBoolean = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "boolean" ? values[fieldId] : false

const readList = (values: EditableResourceProjection, fieldId: string) => {
  const value = values[fieldId]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

const normalizeEditorList = (values: readonly string[]) => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
]

const descriptorOptions = (descriptor: ResourceFieldDescriptor) =>
  descriptor.type === "select" || descriptor.type === "multi-select"
    ? descriptor.options
    : []

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

type OptionLoadState =
  | { status: "loading"; options: readonly ResourceFieldOption[] }
  | { status: "ready"; options: readonly ResourceFieldOption[] }
  | { status: "error"; options: readonly ResourceFieldOption[] }

/** Controller-owned option state for editors whose loading lifecycle is external. */
export type ResourceEditorControlledOptionState = {
  status: OptionLoadState["status"]
  options: readonly ResourceFieldOption[]
  errorMessage?: string
  emptyMessage?: string
}

type DynamicOptionFieldDescriptor = Extract<
  ResourceFieldDescriptor,
  { type: "select" | "multi-select" }
>

type ActiveOptionLoad = {
  controller: AbortController
  signature: string
  retryGeneration: number
  generation: number
}

const isDynamicOptionField = (
  descriptor: ResourceFieldDescriptor,
): descriptor is DynamicOptionFieldDescriptor =>
  (descriptor.type === "select" || descriptor.type === "multi-select") &&
  descriptor.optionLoader !== undefined

const dependencySignature = (
  descriptor: ResourceFieldDescriptor,
  values: EditableResourceProjection,
) =>
  descriptor.type === "select" || descriptor.type === "multi-select"
    ? descriptor.optionLoader?.dependsOn
        .map(
          (fieldId) => `${fieldId}:${describeDependencyValue(values[fieldId])}`,
        )
        .join("|") ?? ""
    : ""

const describeDependencyValue = (value: unknown): string => {
  if (value === undefined) return "undefined"
  if (value === null) return "null"
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "number:NaN"
    if (!Number.isFinite(value))
      return `number:${value > 0 ? "Infinity" : "-Infinity"}`
  }
  if (typeof value === "string") return `string:${JSON.stringify(value)}`
  if (typeof value === "boolean") return `boolean:${value}`
  if (Array.isArray(value)) {
    return `array:[${value.map(describeDependencyValue).join(",")}]`
  }
  if (typeof value === "object") {
    return `object:{${Object.entries(value as Record<string, unknown>)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, entry]) => `${key}:${describeDependencyValue(entry)}`)
      .join(",")}}`
  }
  return `${typeof value}:${String(value)}`
}

/** Loads descriptor-owned options while discarding work invalidated by dependencies. */
function useLoadedOptions(
  activeDescriptors: readonly ResourceFieldDescriptor[],
  values: EditableResourceProjection,
  onLoadOptions: NativeResourceEditorBodyProps<string>["onLoadOptions"],
) {
  const [states, setStates] = useState<ReadonlyMap<string, OptionLoadState>>(
    () => new Map(),
  )
  const [retryGenerations, setRetryGenerations] = useState<
    ReadonlyMap<string, number>
  >(() => new Map())
  const activeLoads = useRef(new Map<string, ActiveOptionLoad>())
  const dynamicFields = useMemo(
    () =>
      onLoadOptions
        ? activeDescriptors.filter(isDynamicOptionField).map((descriptor) => ({
            descriptor,
            signature: dependencySignature(descriptor, values),
          }))
        : [],
    [activeDescriptors, onLoadOptions, values],
  )

  useEffect(() => {
    const activeFieldIds = new Set(
      dynamicFields.map(({ descriptor }) => descriptor.fieldId),
    )
    for (const [fieldId, activeLoad] of activeLoads.current) {
      if (!activeFieldIds.has(fieldId)) {
        activeLoad.controller.abort()
        activeLoads.current.delete(fieldId)
      }
    }
    setStates((current) => {
      const next = new Map(current)
      for (const fieldId of current.keys()) {
        if (!activeFieldIds.has(fieldId)) next.delete(fieldId)
      }
      return next.size === current.size ? current : next
    })
    setRetryGenerations((current) => {
      const next = new Map(current)
      for (const fieldId of current.keys()) {
        if (!activeFieldIds.has(fieldId)) next.delete(fieldId)
      }
      return next.size === current.size ? current : next
    })
    if (!onLoadOptions) return
    for (const { descriptor, signature } of dynamicFields) {
      const retryGeneration = retryGenerations.get(descriptor.fieldId) ?? 0
      const previousLoad = activeLoads.current.get(descriptor.fieldId)
      if (
        previousLoad?.signature === signature &&
        previousLoad.retryGeneration === retryGeneration
      ) {
        continue
      }
      previousLoad?.controller.abort()
      const controller = new AbortController()
      const generation = (previousLoad?.generation ?? 0) + 1
      activeLoads.current.set(descriptor.fieldId, {
        controller,
        signature,
        retryGeneration,
        generation,
      })
      setStates((current) => {
        const next = new Map(current)
        next.set(descriptor.fieldId, {
          status: "loading",
          options:
            next.get(descriptor.fieldId)?.options ??
            descriptorOptions(descriptor),
        })
        return next
      })
      void onLoadOptions(descriptor.fieldId, values, {
        signal: controller.signal,
      })
        .then((options) => {
          if (
            controller.signal.aborted ||
            activeLoads.current.get(descriptor.fieldId)?.generation !==
              generation
          ) {
            return
          }
          setStates((current) => {
            const next = new Map(current)
            next.set(descriptor.fieldId, { status: "ready", options })
            return next
          })
        })
        .catch(() => {
          if (
            controller.signal.aborted ||
            activeLoads.current.get(descriptor.fieldId)?.generation !==
              generation
          ) {
            return
          }
          setStates((current) => {
            const next = new Map(current)
            next.set(descriptor.fieldId, {
              status: "error",
              options:
                next.get(descriptor.fieldId)?.options ??
                descriptorOptions(descriptor),
            })
            return next
          })
        })
    }
  }, [dynamicFields, onLoadOptions, retryGenerations, values])

  useEffect(
    () => () => {
      for (const { controller } of activeLoads.current.values()) {
        controller.abort()
      }
      activeLoads.current.clear()
    },
    [],
  )

  return {
    states,
    retry: (fieldId: string) =>
      setRetryGenerations((current) => {
        const next = new Map(current)
        next.set(fieldId, (next.get(fieldId) ?? 0) + 1)
        return next
      }),
  }
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
  const fields = resolvedFields.filter(
    ({ presentation }) => presentation.visibleWhen?.(values) ?? true,
  )
  const { states: optionStates, retry } = useLoadedOptions(
    fields.map(({ descriptor }) => descriptor),
    values,
    onLoadOptions,
  )
  const pendingAutoSelections = useRef(
    new Map<string, { currentValue: string; nextValue: string }>(),
  )
  const selectOptionSnapshots = useRef(new Map<string, readonly string[]>())
  const selectOptionsByFieldId = useMemo(
    () =>
      new Map(
        resolvedFields.flatMap(({ descriptor, presentation }) => {
          if (descriptor.type !== "select") return []
          const controlledOptionState =
            controlledOptionStates?.[descriptor.fieldId]
          const options =
            (controlledOptionState?.status === "ready"
              ? controlledOptionState.options
              : onLoadOptions && isDynamicOptionField(descriptor)
                ? optionStates.get(descriptor.fieldId)?.options
                : undefined) ?? descriptor.options
          const sourceValues =
            presentation.optionSourceFieldIds?.flatMap((fieldId) =>
              readList(values, fieldId),
            ) ?? []
          const optionValues = [
            ...options.map((option) => option.value),
            ...sourceValues,
          ]
            .map((value) => value.trim())
            .filter(
              (value, index, candidates) =>
                Boolean(value) && candidates.indexOf(value) === index,
            )
          return [[descriptor.fieldId, optionValues] as const]
        }),
      ),
    [
      controlledOptionStates,
      onLoadOptions,
      optionStates,
      resolvedFields,
      values,
    ],
  )
  useEffect(() => {
    for (const { descriptor, presentation } of resolvedFields) {
      if (descriptor.type !== "select" || !presentation.autoSelectFirstOption)
        continue
      const optionValues = selectOptionsByFieldId.get(descriptor.fieldId) ?? []
      const currentValue = readString(values, descriptor.fieldId)
      const previousOptionValues = selectOptionSnapshots.current.get(
        descriptor.fieldId,
      )
      const optionsChanged =
        previousOptionValues !== undefined &&
        (previousOptionValues.length !== optionValues.length ||
          previousOptionValues.some(
            (value, index) => value !== optionValues[index],
          ))
      selectOptionSnapshots.current.set(descriptor.fieldId, optionValues)
      if (optionValues.length === 0 || optionValues.includes(currentValue)) {
        pendingAutoSelections.current.delete(descriptor.fieldId)
        continue
      }
      if (currentValue && !optionsChanged) {
        pendingAutoSelections.current.delete(descriptor.fieldId)
        continue
      }
      const nextValue = optionValues[0]
      const pending = pendingAutoSelections.current.get(descriptor.fieldId)
      if (
        pending?.currentValue === currentValue &&
        pending.nextValue === nextValue
      )
        continue
      pendingAutoSelections.current.set(descriptor.fieldId, {
        currentValue,
        nextValue,
      })
      onValueChange(descriptor.fieldId, nextValue)
    }
  }, [onValueChange, resolvedFields, selectOptionsByFieldId, values])

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
    const override = renderFieldOverride?.({
      descriptor,
      presentation,
      label,
      errorMessage,
      describedBy,
      disabled,
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

    if (descriptor.type === "text" || descriptor.type === "date-time") {
      return (
        <div key={descriptor.fieldId}>
          <Label htmlFor={id} required={descriptor.required}>
            {label}
          </Label>
          <Input
            id={id}
            type={descriptor.type === "date-time" ? "datetime-local" : "text"}
            value={readString(values, descriptor.fieldId)}
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
    if (descriptor.type === "textarea") {
      return (
        <div key={descriptor.fieldId}>
          <Label htmlFor={id} required={descriptor.required}>
            {label}
          </Label>
          <Textarea
            id={id}
            value={readString(values, descriptor.fieldId)}
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
    if (descriptor.type === "number") {
      return (
        <div key={descriptor.fieldId}>
          <Label htmlFor={id} required={descriptor.required}>
            {label}
          </Label>
          <Input
            id={id}
            type="number"
            value={readNumber(values, descriptor.fieldId)}
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
    if (descriptor.type === "boolean") {
      return (
        <div key={descriptor.fieldId}>
          <Label htmlFor={id}>{label}</Label>
          <div className="mt-2">
            <Switch
              id={id}
              checked={readBoolean(values, descriptor.fieldId)}
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
    if (descriptor.type === "select" || descriptor.type === "multi-select") {
      const controlledOptionState = controlledOptionStates?.[descriptor.fieldId]
      const optionState =
        controlledOptionState ??
        (onLoadOptions && isDynamicOptionField(descriptor)
          ? optionStates.get(descriptor.fieldId)
          : undefined)
      const loadedOptions = optionState?.options ?? descriptor.options
      const controlledOptionUnavailable =
        controlledOptionState !== undefined &&
        (controlledOptionState.status !== "ready" ||
          controlledOptionState.options.length === 0)
      const optionValues =
        descriptor.type === "select"
          ? selectOptionsByFieldId.get(descriptor.fieldId) ?? []
          : loadedOptions.map((option) => option.value)
      const optionsByValue = new Map(
        loadedOptions.map((option) => [option.value, option]),
      )
      if (descriptor.type === "select") {
        const value = readString(values, descriptor.fieldId)
        const selectOptions = [
          ...(value && !optionValues.includes(value) ? [{ value }] : []),
          ...optionValues.map(
            (value) => optionsByValue.get(value) ?? { value },
          ),
        ]
        return (
          <div key={descriptor.fieldId}>
            <Label htmlFor={id} required={descriptor.required}>
              {label}
            </Label>
            <Select
              value={value}
              onValueChange={(nextValue) =>
                onValueChange(descriptor.fieldId, nextValue)
              }
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
                  <SelectItem key={option.value} value={option.value}>
                    <span>
                      {option.displayLabel ??
                        getResourceFieldOptionLabel(
                          presentation,
                          option.value,
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
            {optionState?.status === "loading" ? (
              <p
                role="status"
                aria-live="polite"
                className="text-muted-foreground mt-1 text-xs"
              >
                {RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.loading(t)}
              </p>
            ) : null}
            {optionState?.status === "ready" && optionValues.length === 0 ? (
              <p className="text-muted-foreground mt-1 text-xs">
                {controlledOptionState?.emptyMessage ??
                  RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.empty(t)}
              </p>
            ) : null}
            {optionState?.status === "error" ? (
              <div className="mt-1 flex items-center gap-2">
                <p role="alert" className="text-xs text-red-600">
                  {controlledOptionState?.errorMessage ??
                    RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.error(t)}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    controlledOptionState
                      ? onRetryControlledOptions?.(descriptor.fieldId)
                      : retry(descriptor.fieldId)
                  }
                  aria-label={`${RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.retry(t)} ${label}`}
                >
                  {RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.retry(t)}
                </Button>
              </div>
            ) : null}
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
            selected={readList(values, descriptor.fieldId)}
            onChange={(nextValue) =>
              onValueChange(descriptor.fieldId, normalizeEditorList(nextValue))
            }
            disabled={fieldDisabled || controlledOptionUnavailable}
            allowCustom
            placeholder={presentation.resolvePlaceholder?.(t)}
            aria-label={label}
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={describedBy}
            aria-required={descriptor.required}
          />
          {optionState?.status === "loading" ? (
            <p
              role="status"
              aria-live="polite"
              className="text-muted-foreground mt-1 text-xs"
            >
              {RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.loading(t)}
            </p>
          ) : null}
          {optionState?.status === "ready" && loadedOptions.length === 0 ? (
            <p className="text-muted-foreground mt-1 text-xs">
              {controlledOptionState?.emptyMessage ??
                RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.empty(t)}
            </p>
          ) : null}
          {optionState?.status === "error" ? (
            <div className="mt-1 flex items-center gap-2">
              <p role="alert" className="text-xs text-red-600">
                {controlledOptionState?.errorMessage ??
                  RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.error(t)}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  controlledOptionState
                    ? onRetryControlledOptions?.(descriptor.fieldId)
                    : retry(descriptor.fieldId)
                }
                aria-label={`${RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.retry(t)} ${label}`}
              >
                {RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.retry(t)}
              </Button>
            </div>
          ) : null}
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
