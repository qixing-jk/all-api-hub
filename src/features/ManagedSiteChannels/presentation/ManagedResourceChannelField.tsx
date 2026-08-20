import type { TFunction } from "i18next"
import type { ReactNode } from "react"

import {
  ChannelBaseUrlField,
  ChannelModelsField,
  ChannelNameField,
  ChannelSecretField,
  ChannelStatusField,
  ChannelTypeField,
} from "~/components/dialogs/ChannelDialog/components/ChannelCommonFieldsBody"
import { Button } from "~/components/ui"
import {
  normalizeResourceList,
  readResourceList,
  readResourceString,
} from "~/features/ResourceEditor/resourceEditorProjection"
import type {
  EditableResourceProjection,
  ResourceFieldDescriptor,
  ResourceFieldOption,
  ResourceFieldValue,
  ResourceSecretReplacementBlockReason,
  SecretEditIntent,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  MANAGED_RESOURCE_FIELD_TYPES,
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
  MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS,
  MANAGED_RESOURCE_SECRET_STATES,
} from "~/services/apiAdapters/contracts/managedResourceNative"

import {
  getManagedResourceFieldOptionLabel,
  MANAGED_RESOURCE_CHANNEL_FIELD_ROLES,
  MANAGED_RESOURCE_EDITOR_MODES,
  type ManagedResourceEditorMode,
  type ManagedResourceFieldPresentation,
  type ManagedResourceTextResolver,
} from "./managedResourceFieldPolicy"

const SECRET_STATE_LABEL_RESOLVERS = {
  [MANAGED_RESOURCE_SECRET_STATES.Available]: (t: TFunction) =>
    t("managedSiteChannels:editor.secret.state.available"),
  [MANAGED_RESOURCE_SECRET_STATES.Masked]: (t: TFunction) =>
    t("managedSiteChannels:editor.secret.state.masked"),
  [MANAGED_RESOURCE_SECRET_STATES.Unavailable]: (t: TFunction) =>
    t("managedSiteChannels:editor.secret.state.unavailable"),
  [MANAGED_RESOURCE_SECRET_STATES.PermissionHidden]: (t: TFunction) =>
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

const readSecretIntent = (
  values: EditableResourceProjection,
  fieldId: string,
): SecretEditIntent => {
  const value = values[fieldId]
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged }
  const candidate = value as Record<PropertyKey, unknown>
  if (
    candidate.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear ||
    candidate.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged
  )
    return { kind: candidate.kind }
  return candidate.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace &&
    typeof candidate.value === "string"
    ? {
        kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
        value: candidate.value,
      }
    : { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged }
}

type ManagedResourceChannelFieldProps = {
  t: TFunction
  mode: ManagedResourceEditorMode
  descriptor: ResourceFieldDescriptor
  presentation: ManagedResourceFieldPresentation
  values: EditableResourceProjection
  errorMessage?: string
  options?: readonly ResourceFieldOption[]
  optionControl?: ReactNode
  disabled: boolean
  showModelPrefillWarning: boolean
  onValueChange: (fieldId: string, value: ResourceFieldValue) => void
  loadedSecret?: { fieldId: string; value: string }
  isSecretRevealed: boolean
  isSecretLoading: boolean
  secretLoadFailed: boolean
  canLoadSecret: boolean
  onSecretRevealedChange: (revealed: boolean) => void
  onSecretLoadStart: (fieldId: string) => void
  onSecretLoadCancel: () => void
  onSecretInput: (fieldId: string, value: string) => void
}

/** Renders channel-semantic field roles while the parent owns secret lifecycle state. */
export function ManagedResourceChannelField({
  t,
  mode,
  descriptor,
  presentation,
  values,
  errorMessage,
  options,
  optionControl,
  disabled,
  showModelPrefillWarning,
  onValueChange,
  loadedSecret,
  isSecretRevealed,
  isSecretLoading,
  secretLoadFailed,
  canLoadSecret,
  onSecretRevealedChange,
  onSecretLoadStart,
  onSecretLoadCancel,
  onSecretInput,
}: ManagedResourceChannelFieldProps) {
  const fieldId = descriptor.fieldId
  const currentValue = readResourceString(values, fieldId)
  const selectOptions =
    descriptor.type === MANAGED_RESOURCE_FIELD_TYPES.Select
      ? [
          ...(currentValue &&
          !descriptor.options.some((option) => option.value === currentValue)
            ? [{ value: currentValue, displayLabel: currentValue }]
            : []),
          ...descriptor.options,
        ].map((option) => ({
          value: option.value,
          label:
            option.displayLabel ??
            getManagedResourceFieldOptionLabel(presentation, option.value, t),
        }))
      : []

  switch (presentation.channelFieldRole) {
    case MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Name:
      return (
        <ChannelNameField
          t={t}
          value={currentValue}
          onChange={(value) => onValueChange(fieldId, value)}
          disabled={disabled}
          required={descriptor.required}
          errorMessage={errorMessage}
        />
      )
    case MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Type:
      return descriptor.type === MANAGED_RESOURCE_FIELD_TYPES.Select ? (
        <ChannelTypeField
          t={t}
          value={currentValue}
          options={selectOptions}
          onChange={(value) => onValueChange(fieldId, value)}
          disabled={disabled}
          required={descriptor.required}
          errorMessage={errorMessage}
        />
      ) : undefined
    case MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Status:
      return descriptor.type === MANAGED_RESOURCE_FIELD_TYPES.Select ? (
        <ChannelStatusField
          t={t}
          value={currentValue}
          options={selectOptions}
          onChange={(value) => onValueChange(fieldId, value)}
          disabled={disabled}
          required={descriptor.required}
          errorMessage={errorMessage}
        />
      ) : undefined
    case MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.BaseUrl:
      return (
        <ChannelBaseUrlField
          t={t}
          value={currentValue}
          onChange={(value) => onValueChange(fieldId, value)}
          disabled={disabled}
          required={descriptor.required}
          errorMessage={errorMessage}
        />
      )
    case MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Models:
      if (descriptor.type !== MANAGED_RESOURCE_FIELD_TYPES.MultiSelect)
        return undefined
      return (
        <ChannelModelsField
          t={t}
          options={(options ?? descriptor.options).map((option) => ({
            value: option.value,
            label: option.displayLabel ?? option.value,
          }))}
          selected={normalizeResourceList(readResourceList(values, fieldId))}
          onChange={(value) => {
            const normalizedValue = normalizeResourceList(value)
            const mirrorFieldId = presentation.customValuesMirrorFieldId
            if (mirrorFieldId) {
              const previousValues = normalizeResourceList(
                readResourceList(values, fieldId),
              )
              const knownValues = new Set(
                descriptor.options.map((option) => option.value),
              )
              const retainedManualValues = normalizeResourceList(
                readResourceList(values, mirrorFieldId),
              ).filter((model) => normalizedValue.includes(model))
              const addedCustomValues = normalizedValue.filter(
                (model) =>
                  !previousValues.includes(model) && !knownValues.has(model),
              )
              onValueChange(mirrorFieldId, [
                ...new Set([...retainedManualValues, ...addedCustomValues]),
              ])
            }
            onValueChange(fieldId, normalizedValue)
          }}
          disabled={disabled}
          required={descriptor.required}
          showPrefillWarning={showModelPrefillWarning}
          description={presentation.resolveHelp?.(t)}
          errorMessage={errorMessage}
          actions={optionControl}
        />
      )
    case MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Secret:
      break
    default:
      return undefined
  }

  if (descriptor.type !== MANAGED_RESOURCE_FIELD_TYPES.Secret) return undefined
  const intent = readSecretIntent(values, fieldId)
  const inputValue =
    descriptor.canReplace &&
    intent.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace
      ? intent.value
      : loadedSecret?.fieldId === fieldId
        ? loadedSecret.value
        : ""
  const stateDescription =
    SECRET_STATE_LABEL_RESOLVERS[descriptor.secretState](t)
  const canLoadSavedSecret =
    canLoadSecret &&
    (descriptor.canLoadSecret ??
      descriptor.secretState === MANAGED_RESOURCE_SECRET_STATES.Available) &&
    descriptor.canReplace &&
    intent.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged &&
    loadedSecret?.fieldId !== fieldId
  const showLoadSavedSecretControl = canLoadSavedSecret && !secretLoadFailed
  const description = descriptor.replacementBlockReason ? (
    SECRET_REPLACEMENT_BLOCK_LABEL_RESOLVERS[descriptor.replacementBlockReason](
      t,
    )
  ) : mode === MANAGED_RESOURCE_EDITOR_MODES.Create ? (
    t("managedSiteChannels:editor.secret.createHint")
  ) : showLoadSavedSecretControl ? undefined : descriptor.canReplace ? (
    presentation.resolveHelp?.(t) ?? (
      <>
        {stateDescription}{" "}
        {t("managedSiteChannels:editor.secret.keepExistingHint")}
      </>
    )
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
      t={t}
      value={inputValue}
      onChange={(value) => onSecretInput(fieldId, value)}
      disabled={disabled || !descriptor.canReplace}
      required={descriptor.required}
      revealed={isSecretRevealed}
      onRevealedChange={onSecretRevealedChange}
      placeholder={t(
        mode === MANAGED_RESOURCE_EDITOR_MODES.Create
          ? "managedSiteChannels:editor.secret.placeholder"
          : "managedSiteChannels:editor.secret.replacePlaceholder",
      )}
      description={description}
      errorMessage={errorMessage}
      canLoadRealKey={showLoadSavedSecretControl}
      isLoadingRealKey={isSecretLoading}
      onLoadRealKey={() => onSecretLoadStart(fieldId)}
      onCancelLoadRealKey={onSecretLoadCancel}
      loadRealKeyLabel={t("managedSiteChannels:editor.secret.actions.view")}
      loadingRealKeyLabel={t("managedSiteChannels:editor.secret.loading")}
      cancelLoadRealKeyLabel={t(
        "managedSiteChannels:editor.secret.actions.cancelLoad",
      )}
      realKeyHint={t("managedSiteChannels:editor.secret.loadableHint")}
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
                    fieldId,
                    intent.kind ===
                      MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear
                      ? {
                          kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged,
                        }
                      : {
                          kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear,
                        },
                  )
                }
              >
                {intent.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear
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
                  onClick={() => onSecretLoadStart(fieldId)}
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
