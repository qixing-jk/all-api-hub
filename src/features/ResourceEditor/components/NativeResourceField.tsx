import { Fragment } from "react"

import { Input, Label, Switch, Textarea } from "~/components/ui"
import { NativeResourceChoiceField } from "~/features/ResourceEditor/components/NativeResourceChoiceField"
import { ResourceFieldLabel } from "~/features/ResourceEditor/components/ResourceFieldLabel"
import { ResourceManualOptionControl } from "~/features/ResourceEditor/components/ResourceOptionLoadFeedback"
import { ResourceSecretField } from "~/features/ResourceEditor/components/ResourceSecretField"
import { ResourceSecretListField } from "~/features/ResourceEditor/components/ResourceSecretListField"
import { ResourceTextEntriesField } from "~/features/ResourceEditor/components/ResourceTextEntriesField"
import type {
  NativeResourceFieldContext,
  NativeResourceResolvedField,
} from "~/features/ResourceEditor/model/nativeResourceEditorContracts"
import {
  readResourceBoolean,
  readResourceNumber,
  readResourceString,
} from "~/features/ResourceEditor/model/resourceEditorProjection"
import { RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS } from "~/features/ResourceEditor/model/resourceFieldPolicy"
import { isDynamicOptionField } from "~/features/ResourceEditor/options/useLoadedResourceOptions"
import type { SecretEditIntent } from "~/services/apiAdapters/contracts/resourceNative"
import {
  RESOURCE_FIELD_OPTION_LOAD_TRIGGERS,
  RESOURCE_FIELD_TYPES,
} from "~/services/apiAdapters/contracts/resourceNative"

const fieldDomId = (fieldId: string) =>
  `resource-editor-${fieldId.replace(/[^a-zA-Z0-9_-]/g, "-")}`

/** Announces a field-specific validation message to assistive technology. */
function FieldMessage({ id, message }: { id: string; message: string }) {
  return (
    <p
      id={id}
      role="alert"
      className="text-destructive-text mt-density-1 text-xs"
    >
      {message}
    </p>
  )
}
/** Resolves accessible field decoration and overrides before rendering its native control. */
export function NativeResourceField<TSection extends string>({
  field,
  context,
}: {
  field: NativeResourceResolvedField<TSection>
  context: NativeResourceFieldContext<TSection>
}) {
  const { descriptor, presentation } = field
  const {
    t,
    values,
    disabled,
    onValueChange,
    onLoadSecret,
    onLoadOptions,
    controlledOptionStates,
    onRetryControlledOptions,
    renderFieldOverride,
    issuesByFieldId,
    optionLoading,
  } = context
  const { states: optionStates, load } = optionLoading

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
  const fieldDisabled =
    disabled ||
    descriptor.readOnly ||
    presentation.disabledWhen?.(values) === true
  const override = renderFieldOverride?.({
    descriptor,
    presentation,
    label,
    errorMessage,
    describedBy,
    disabled: fieldDisabled,
    options: resolvedOptions,
    optionControl,
  })
  if (override !== undefined) {
    return <Fragment key={descriptor.fieldId}>{override}</Fragment>
  }
  const help =
    presentation.resolveHelp && helpId ? (
      <p id={helpId} className="text-muted-foreground mt-density-1 text-xs">
        {fieldDisabled && presentation.resolveDisabledHelp
          ? presentation.resolveDisabledHelp(t)
          : presentation.resolveHelp(t)}
      </p>
    ) : null
  const error =
    errorMessage && errorId ? (
      <FieldMessage id={errorId} message={errorMessage} />
    ) : null

  if (descriptor.type === RESOURCE_FIELD_TYPES.Secret) {
    return (
      <ResourceSecretField
        key={descriptor.fieldId}
        t={t}
        id={id}
        label={label}
        descriptor={descriptor}
        intent={values[descriptor.fieldId] as SecretEditIntent | undefined}
        disabled={fieldDisabled}
        hasErrors={Boolean(errorMessage)}
        describedBy={describedBy}
        help={help}
        error={error}
        onChange={(intent) => onValueChange(descriptor.fieldId, intent)}
      />
    )
  }
  if (descriptor.type === RESOURCE_FIELD_TYPES.SecretList) {
    return (
      <div key={descriptor.fieldId}>
        <ResourceSecretListField
          t={t}
          label={label}
          descriptor={descriptor}
          presentation={presentation}
          value={values[descriptor.fieldId]}
          disabled={fieldDisabled}
          hasErrors={Boolean(errorMessage)}
          onLoadSecret={onLoadSecret}
          onChange={(value) => onValueChange(descriptor.fieldId, value)}
        />
        {help}
        {error}
      </div>
    )
  }

  if (
    descriptor.type === RESOURCE_FIELD_TYPES.Text ||
    descriptor.type === RESOURCE_FIELD_TYPES.DateTime
  ) {
    return (
      <div key={descriptor.fieldId}>
        <ResourceFieldLabel htmlFor={id} required={descriptor.required}>
          {label}
        </ResourceFieldLabel>
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
    if (presentation.textEntries) {
      return (
        <div key={descriptor.fieldId}>
          <ResourceTextEntriesField
            t={t}
            label={label}
            value={readResourceString(values, descriptor.fieldId)}
            configuration={presentation.textEntries}
            disabled={fieldDisabled}
            invalid={Boolean(errorMessage)}
            describedBy={describedBy}
            onChange={(value) => onValueChange(descriptor.fieldId, value)}
          />
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
        <ResourceFieldLabel htmlFor={id} required={descriptor.required}>
          {label}
        </ResourceFieldLabel>
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
        <div className="gap-y-density-4 flex items-start justify-between gap-x-4">
          <div className="min-w-0">
            <Label htmlFor={id}>{label}</Label>
            {help}
          </div>
          <Switch
            id={id}
            checked={readResourceBoolean(values, descriptor.fieldId)}
            onChange={(value) => onValueChange(descriptor.fieldId, value)}
            disabled={fieldDisabled}
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={describedBy}
          />
        </div>
        {error}
      </div>
    )
  }
  if (
    descriptor.type === RESOURCE_FIELD_TYPES.Select ||
    descriptor.type === RESOURCE_FIELD_TYPES.MultiSelect
  )
    return (
      <NativeResourceChoiceField
        field={{ descriptor, presentation }}
        context={context}
        decoration={{
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
        }}
      />
    )
  return null
}
