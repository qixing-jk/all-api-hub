import type { TFunction } from "i18next"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  ChannelBaseUrlField,
  ChannelModelsField,
  ChannelNameField,
  ChannelSecretField,
  ChannelStatusField,
  ChannelTypeField,
} from "~/components/dialogs/ChannelDialog/components/ChannelCommonFieldsBody"
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
import {
  MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS,
  type EditableResourceProjection,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type ResourceFieldValue,
  type ResourceOperationOptions,
  type ResourceSecretReplacementBlockReason,
  type SecretEditIntent,
} from "~/services/apiAdapters/contracts/managedResourceNative"

import {
  getManagedResourceFieldOptionLabel,
  MANAGED_RESOURCE_COMMON_CHANNEL_FIELD_IDS,
  MANAGED_RESOURCE_SECTIONS,
  resolveManagedResourceFieldPolicy,
  type ManagedResourceEditorFieldPolicy,
  type ManagedResourceSection,
  type ManagedResourceTextResolver,
} from "./managedResourceFieldPolicy"

type ManagedResourceEditorBodyProps = {
  t: TFunction
  mode: "create" | "edit"
  descriptors: readonly ResourceFieldDescriptor[]
  policy: ManagedResourceEditorFieldPolicy
  values: EditableResourceProjection
  fieldIssues?: readonly ResourceFieldIssue[]
  disabled?: boolean
  onValueChange: (fieldId: string, value: ResourceFieldValue) => void
  onLoadSecret?: (
    fieldId: string,
    options?: ResourceOperationOptions,
  ) => Promise<string>
}

const SECTION_LABEL_RESOLVERS = {
  [MANAGED_RESOURCE_SECTIONS.Basic]: (t: TFunction) =>
    t("managedSiteChannels:editor.sections.basic"),
  [MANAGED_RESOURCE_SECTIONS.Connection]: (t: TFunction) =>
    t("managedSiteChannels:editor.sections.connection"),
  [MANAGED_RESOURCE_SECTIONS.Models]: (t: TFunction) =>
    t("managedSiteChannels:editor.sections.models"),
  [MANAGED_RESOURCE_SECTIONS.Sync]: (t: TFunction) =>
    t("managedSiteChannels:editor.sections.sync"),
  [MANAGED_RESOURCE_SECTIONS.Routing]: (t: TFunction) =>
    t("managedSiteChannels:editor.sections.routing"),
  [MANAGED_RESOURCE_SECTIONS.Metadata]: (t: TFunction) =>
    t("managedSiteChannels:editor.sections.metadata"),
  [MANAGED_RESOURCE_SECTIONS.Advanced]: (t: TFunction) =>
    t("managedSiteChannels:editor.sections.advanced"),
} as const satisfies Record<ManagedResourceSection, ManagedResourceTextResolver>

const ISSUE_LABEL_RESOLVERS = {
  required: (t: TFunction) =>
    t("managedSiteChannels:editor.validation.required"),
  invalid_value: (t: TFunction) =>
    t("managedSiteChannels:editor.validation.invalidValue"),
  out_of_range: (t: TFunction) =>
    t("managedSiteChannels:editor.validation.outOfRange"),
  unsupported_option: (t: TFunction) =>
    t("managedSiteChannels:editor.validation.unsupportedOption"),
  inconsistent_value: (t: TFunction) =>
    t("managedSiteChannels:editor.validation.inconsistentValue"),
} as const satisfies Record<
  ResourceFieldIssue["code"],
  ManagedResourceTextResolver
>

const SECRET_STATE_LABEL_RESOLVERS = {
  available: (t: TFunction) =>
    t("managedSiteChannels:editor.secret.state.available"),
  masked: (t: TFunction) => t("managedSiteChannels:editor.secret.state.masked"),
  unavailable: (t: TFunction) =>
    t("managedSiteChannels:editor.secret.state.unavailable"),
  "permission-hidden": (t: TFunction) =>
    t("managedSiteChannels:editor.secret.state.permissionHidden"),
} as const

const SECRET_REPLACEMENT_BLOCK_LABEL_RESOLVERS = {
  [MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS.MultipleCredentials]: (
    t: TFunction,
  ) =>
    t(
      "managedSiteChannels:editor.secret.replacementBlocked.multipleCredentials",
    ),
} as const satisfies Record<
  ResourceSecretReplacementBlockReason,
  ManagedResourceTextResolver
>

const fieldDomId = (fieldId: string) =>
  `managed-resource-editor-${fieldId.replace(/[^a-zA-Z0-9_-]/g, "-")}`

const readString = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "string" ? values[fieldId] : ""

const readNumber = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "number" || values[fieldId] === ""
    ? values[fieldId]
    : 0

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

const resolveSelectOptionValues = (
  descriptorOptions: readonly { value: string }[],
  optionSourceFieldIds: readonly string[] | undefined,
  values: EditableResourceProjection,
) => {
  const candidates = [
    ...descriptorOptions.map(({ value }) => value),
    ...(optionSourceFieldIds ?? []).flatMap((fieldId) =>
      readList(values, fieldId),
    ),
  ]
  const seen = new Set<string>()
  return candidates.flatMap((candidate) => {
    const value = candidate.trim()
    if (!value || seen.has(value)) return []
    seen.add(value)
    return [value]
  })
}

const readSecretIntent = (
  values: EditableResourceProjection,
  fieldId: string,
): SecretEditIntent => {
  const value = values[fieldId]
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { kind: "unchanged" }
  }
  if (!Object.prototype.hasOwnProperty.call(value, "kind")) {
    return { kind: "unchanged" }
  }
  const candidate = value as Record<PropertyKey, unknown>
  if (candidate.kind === "unchanged") return { kind: "unchanged" }
  if (candidate.kind === "clear") return { kind: "clear" }
  if (
    candidate.kind === "replace" &&
    Object.prototype.hasOwnProperty.call(candidate, "value") &&
    typeof candidate.value === "string"
  ) {
    return { kind: "replace", value: candidate.value }
  }
  return { kind: "unchanged" }
}

/** Renders an accessible controlled validation message for native-only fields. */
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

/** Controlled resource-native fields rendered inside the shared editor shell. */
export function ManagedResourceEditorBody({
  t,
  mode,
  descriptors,
  policy,
  values,
  fieldIssues = [],
  disabled = false,
  onValueChange,
  onLoadSecret,
}: ManagedResourceEditorBodyProps) {
  const [isSecretRevealed, setIsSecretRevealed] = useState(false)
  const [loadedSecret, setLoadedSecret] = useState<{
    fieldId: string
    value: string
  }>()
  const [isSecretLoading, setIsSecretLoading] = useState(false)
  const [secretLoadFailed, setSecretLoadFailed] = useState(false)
  const secretLoadController = useRef<AbortController | undefined>(undefined)
  const pendingAutoSelections = useRef(
    new Map<string, { currentValue: string; nextValue: string }>(),
  )
  const selectOptionSnapshots = useRef(new Map<string, readonly string[]>())
  const automaticSecretFieldId = descriptors.find(
    (descriptor) =>
      descriptor.type === "secret" &&
      descriptor.secretState === "available" &&
      descriptor.canReplace,
  )?.fieldId
  const cancelSecretLoad = useCallback(() => {
    secretLoadController.current?.abort()
    secretLoadController.current = undefined
    setIsSecretLoading(false)
    setSecretLoadFailed(false)
  }, [])
  const startSecretLoad = useCallback(
    (fieldId: string) => {
      if (!onLoadSecret) return
      const controller = new AbortController()
      secretLoadController.current?.abort()
      secretLoadController.current = controller
      setIsSecretLoading(true)
      setSecretLoadFailed(false)
      void onLoadSecret(fieldId, { signal: controller.signal })
        .then((value) => {
          if (!controller.signal.aborted) {
            setLoadedSecret({ fieldId, value })
            setIsSecretRevealed(false)
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setSecretLoadFailed(true)
        })
        .finally(() => {
          if (secretLoadController.current === controller) {
            secretLoadController.current = undefined
            setIsSecretLoading(false)
          }
        })
    },
    [onLoadSecret],
  )
  useEffect(() => {
    setLoadedSecret(undefined)
    setIsSecretLoading(false)
    setSecretLoadFailed(false)
    if (!automaticSecretFieldId || !onLoadSecret) return
    startSecretLoad(automaticSecretFieldId)
    return () => {
      secretLoadController.current?.abort()
      secretLoadController.current = undefined
    }
  }, [automaticSecretFieldId, onLoadSecret, startSecretLoad])
  const issuesByFieldId = new Map(
    fieldIssues.map((issue) => [issue.fieldId, issue.code]),
  )
  const resolvedFields = useMemo(
    () => resolveManagedResourceFieldPolicy(descriptors, policy).fields,
    [descriptors, policy],
  )
  const selectOptionValuesByFieldId = useMemo(
    () =>
      new Map(
        resolvedFields.flatMap(({ descriptor, presentation }) =>
          descriptor.type === "select"
            ? [
                [
                  descriptor.fieldId,
                  resolveSelectOptionValues(
                    descriptor.options,
                    presentation.optionSourceFieldIds,
                    values,
                  ),
                ] as const,
              ]
            : [],
        ),
      ),
    [resolvedFields, values],
  )
  useEffect(() => {
    for (const { descriptor, presentation } of resolvedFields) {
      if (descriptor.type !== "select" || !presentation.autoSelectFirstOption) {
        continue
      }
      const optionValues =
        selectOptionValuesByFieldId.get(descriptor.fieldId) ?? []
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
      // Preserve an authoritative stale value until the user changes the
      // source list; this avoids rewriting legacy data on editor mount.
      if (currentValue && !optionsChanged) {
        pendingAutoSelections.current.delete(descriptor.fieldId)
        continue
      }
      const nextValue = optionValues[0]
      const pendingSelection = pendingAutoSelections.current.get(
        descriptor.fieldId,
      )
      if (
        pendingSelection?.currentValue === currentValue &&
        pendingSelection.nextValue === nextValue
      ) {
        continue
      }
      pendingAutoSelections.current.set(descriptor.fieldId, {
        currentValue,
        nextValue,
      })
      onValueChange(descriptor.fieldId, nextValue)
    }
  }, [onValueChange, resolvedFields, selectOptionValuesByFieldId, values])
  const fields = resolvedFields.filter(
    ({ presentation }) => presentation.visibleWhen?.(values) ?? true,
  )
  const fieldsBySection = new Map<string, typeof fields>()
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
      ? (
          presentation.issueLabelResolvers?.[issueCode] ??
          ISSUE_LABEL_RESOLVERS[issueCode]
        )(t)
      : undefined
    const id = fieldDomId(descriptor.fieldId)
    const errorId = errorMessage ? `${id}-error` : undefined
    const helpId = presentation.resolveHelp ? `${id}-help` : undefined
    const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined
    const label = presentation.resolveLabel(t)
    const selectOptionValues =
      descriptor.type === "select"
        ? selectOptionValuesByFieldId.get(descriptor.fieldId) ?? []
        : []
    const staticOptionValues =
      descriptor.type === "select"
        ? new Set(descriptor.options.map(({ value }) => value.trim()))
        : new Set<string>()
    const currentSelectValue = readString(values, descriptor.fieldId)
    const selectOptions = [
      ...(currentSelectValue && !selectOptionValues.includes(currentSelectValue)
        ? [{ value: currentSelectValue, label: currentSelectValue }]
        : []),
      ...selectOptionValues.map((value) => ({
        value,
        label: staticOptionValues.has(value)
          ? getManagedResourceFieldOptionLabel(presentation, value, t)
          : value,
      })),
    ]
    const renderedSelectValue = currentSelectValue

    if (descriptor.fieldId === MANAGED_RESOURCE_COMMON_CHANNEL_FIELD_IDS.Name) {
      return (
        <ChannelNameField
          key={descriptor.fieldId}
          t={t}
          value={readString(values, descriptor.fieldId)}
          onChange={(value) => onValueChange(descriptor.fieldId, value)}
          disabled={disabled}
          required={descriptor.required}
          errorMessage={errorMessage}
        />
      )
    }

    if (
      descriptor.fieldId === MANAGED_RESOURCE_COMMON_CHANNEL_FIELD_IDS.Type &&
      descriptor.type === "select"
    ) {
      return (
        <ChannelTypeField
          key={descriptor.fieldId}
          t={t}
          value={renderedSelectValue}
          options={selectOptions}
          onChange={(value) => onValueChange(descriptor.fieldId, value)}
          disabled={disabled}
          required={descriptor.required}
          errorMessage={errorMessage}
        />
      )
    }

    if (
      descriptor.fieldId === MANAGED_RESOURCE_COMMON_CHANNEL_FIELD_IDS.Status &&
      descriptor.type === "select"
    ) {
      return (
        <ChannelStatusField
          key={descriptor.fieldId}
          t={t}
          value={renderedSelectValue}
          options={selectOptions}
          onChange={(value) => onValueChange(descriptor.fieldId, value)}
          disabled={disabled}
          required={descriptor.required}
          errorMessage={errorMessage}
        />
      )
    }

    if (
      descriptor.fieldId === MANAGED_RESOURCE_COMMON_CHANNEL_FIELD_IDS.BaseUrl
    ) {
      return (
        <ChannelBaseUrlField
          key={descriptor.fieldId}
          t={t}
          value={readString(values, descriptor.fieldId)}
          onChange={(value) => onValueChange(descriptor.fieldId, value)}
          disabled={disabled}
          required={descriptor.required}
          errorMessage={errorMessage}
        />
      )
    }

    if (
      descriptor.fieldId === MANAGED_RESOURCE_COMMON_CHANNEL_FIELD_IDS.Secret &&
      descriptor.type === "secret"
    ) {
      const intent = readSecretIntent(values, descriptor.fieldId)
      const inputValue =
        descriptor.canReplace && intent.kind === "replace"
          ? intent.value
          : loadedSecret?.fieldId === descriptor.fieldId
            ? loadedSecret.value
            : ""
      const stateDescription =
        SECRET_STATE_LABEL_RESOLVERS[descriptor.secretState](t)
      const description = descriptor.replacementBlockReason ? (
        SECRET_REPLACEMENT_BLOCK_LABEL_RESOLVERS[
          descriptor.replacementBlockReason
        ](t)
      ) : mode === "create" ? (
        t("managedSiteChannels:editor.secret.createHint")
      ) : isSecretLoading ? (
        <span aria-live="polite">
          {t("managedSiteChannels:editor.secret.loading")}
        </span>
      ) : descriptor.canReplace && descriptor.secretState !== "unavailable" ? (
        <>
          {stateDescription}{" "}
          {t("managedSiteChannels:editor.secret.keepExistingHint")}
        </>
      ) : (
        <>
          {stateDescription}
          {!descriptor.canReplace
            ? ` ${t("managedSiteChannels:editor.secret.replacementDisabled")}`
            : ""}
        </>
      )
      return (
        <ChannelSecretField
          key={descriptor.fieldId}
          t={t}
          value={inputValue}
          onChange={(value) =>
            (() => {
              cancelSecretLoad()
              setLoadedSecret(undefined)
              onValueChange(
                descriptor.fieldId,
                value ? { kind: "replace", value } : { kind: "unchanged" },
              )
            })()
          }
          disabled={disabled || !descriptor.canReplace}
          required={descriptor.required}
          revealed={isSecretRevealed}
          onRevealedChange={setIsSecretRevealed}
          placeholder={t("managedSiteChannels:editor.secret.placeholder")}
          description={description}
          errorMessage={errorMessage}
          actions={
            descriptor.allowClear || secretLoadFailed ? (
              <>
                {descriptor.allowClear ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      onValueChange(
                        descriptor.fieldId,
                        intent.kind === "clear"
                          ? { kind: "unchanged" }
                          : { kind: "clear" },
                      )
                    }
                  >
                    {intent.kind === "clear"
                      ? t("managedSiteChannels:editor.secret.actions.restore")
                      : t("managedSiteChannels:editor.secret.actions.clear")}
                  </Button>
                ) : null}
                {secretLoadFailed ? (
                  <div className="flex items-center gap-2">
                    <p role="alert" className="text-xs text-red-600">
                      {t("managedSiteChannels:editor.secret.loadError")}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => startSecretLoad(descriptor.fieldId)}
                    >
                      {t("managedSiteChannels:editor.secret.actions.retry")}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : undefined
          }
        />
      )
    }

    if (
      descriptor.fieldId === MANAGED_RESOURCE_COMMON_CHANNEL_FIELD_IDS.Models &&
      descriptor.type === "multi-select"
    ) {
      return (
        <ChannelModelsField
          key={descriptor.fieldId}
          t={t}
          options={descriptor.options.map((option) => ({
            value: option.value,
            label: option.value,
          }))}
          selected={normalizeEditorList(readList(values, descriptor.fieldId))}
          onChange={(value) => {
            const normalizedValue = normalizeEditorList(value)
            const mirrorFieldId = presentation.customValuesMirrorFieldId
            if (mirrorFieldId) {
              const previousValues = normalizeEditorList(
                readList(values, descriptor.fieldId),
              )
              const knownValues = new Set(
                descriptor.options.map(({ value: optionValue }) => optionValue),
              )
              const retainedManualValues = normalizeEditorList(
                readList(values, mirrorFieldId),
              ).filter((model) => normalizedValue.includes(model))
              const addedCustomValues = normalizedValue.filter(
                (model) =>
                  !previousValues.includes(model) && !knownValues.has(model),
              )
              onValueChange(mirrorFieldId, [
                ...new Set([...retainedManualValues, ...addedCustomValues]),
              ])
            }
            onValueChange(descriptor.fieldId, normalizedValue)
          }}
          disabled={disabled}
          required={descriptor.required}
          description={presentation.resolveHelp?.(t)}
          errorMessage={errorMessage}
        />
      )
    }

    const error =
      errorMessage && errorId ? (
        <FieldMessage id={errorId} message={errorMessage} />
      ) : null
    const help =
      presentation.resolveHelp && helpId ? (
        <p id={helpId} className="text-muted-foreground mt-1 text-xs">
          {presentation.resolveHelp(t)}
        </p>
      ) : null

    if (descriptor.type === "text") {
      return (
        <div key={descriptor.fieldId}>
          <Label htmlFor={id} required={descriptor.required}>
            {label}
          </Label>
          <Input
            id={id}
            value={readString(values, descriptor.fieldId)}
            onChange={(event) =>
              onValueChange(descriptor.fieldId, event.target.value)
            }
            disabled={disabled}
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
            disabled={disabled}
            required={descriptor.required}
            rows={presentation.rows}
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
            disabled={disabled}
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
              disabled={disabled}
              aria-invalid={Boolean(errorMessage)}
              aria-describedby={describedBy}
            />
          </div>
          {help}
          {error}
        </div>
      )
    }

    if (descriptor.type === "select") {
      return (
        <div key={descriptor.fieldId}>
          <Label htmlFor={id} required={descriptor.required}>
            {label}
          </Label>
          <Select
            value={renderedSelectValue}
            onValueChange={(value) => onValueChange(descriptor.fieldId, value)}
            disabled={
              disabled ||
              (presentation.optionSourceFieldIds !== undefined &&
                selectOptionValues.length === 0)
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
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {help}
          {error}
        </div>
      )
    }

    if (descriptor.type === "multi-select") {
      return (
        <div key={descriptor.fieldId}>
          <Label required={descriptor.required}>{label}</Label>
          <CompactMultiSelect
            options={descriptor.options.map((option) => ({
              value: option.value,
              label: option.value,
            }))}
            selected={readList(values, descriptor.fieldId)}
            onChange={(value) => onValueChange(descriptor.fieldId, value)}
            disabled={disabled}
            allowCustom
            placeholder={presentation.resolvePlaceholder?.(t)}
            aria-label={label}
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={describedBy}
            aria-required={descriptor.required}
          />
          {help}
          {error}
        </div>
      )
    }

    return null
  }

  return (
    <div className="space-y-5">
      {[...fieldsBySection.entries()].map(([section, sectionFields]) => (
        <fieldset key={section} className="space-y-4">
          <legend className="text-foreground mb-3 text-sm font-semibold">
            {SECTION_LABEL_RESOLVERS[
              section as keyof typeof SECTION_LABEL_RESOLVERS
            ](t)}
          </legend>
          {sectionFields.map(renderField)}
        </fieldset>
      ))}
    </div>
  )
}
