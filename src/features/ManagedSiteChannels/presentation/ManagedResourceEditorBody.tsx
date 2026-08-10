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
import { Button } from "~/components/ui"
import { NativeResourceEditorBody } from "~/features/ResourceEditor/NativeResourceEditorBody"
import type {
  EditableResourceProjection,
  ResourceFieldDescriptor,
  ResourceFieldIssue,
  ResourceFieldValue,
  ResourceOperationOptions,
  ResourceSecretReplacementBlockReason,
  SecretEditIntent,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS } from "~/services/apiAdapters/contracts/managedResourceNative"

import {
  getManagedResourceFieldOptionLabel,
  MANAGED_RESOURCE_COMMON_CHANNEL_FIELD_IDS,
  MANAGED_RESOURCE_SECTION_ORDER,
  MANAGED_RESOURCE_SECTIONS,
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
  showModelPrefillWarning?: boolean
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

const readString = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "string" ? values[fieldId] : ""

const readList = (values: EditableResourceProjection, fieldId: string) => {
  const value = values[fieldId]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

const normalizeEditorList = (values: readonly string[]) => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
]

const readSecretIntent = (
  values: EditableResourceProjection,
  fieldId: string,
): SecretEditIntent => {
  const value = values[fieldId]
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return { kind: "unchanged" }
  const candidate = value as Record<PropertyKey, unknown>
  if (candidate.kind === "clear" || candidate.kind === "unchanged")
    return { kind: candidate.kind }
  return candidate.kind === "replace" && typeof candidate.value === "string"
    ? { kind: "replace", value: candidate.value }
    : { kind: "unchanged" }
}

/** Keeps AxonHub's channel-only controls outside the neutral resource editor. */
export function ManagedResourceEditorBody({
  t,
  mode,
  descriptors,
  policy,
  values,
  fieldIssues = [],
  disabled = false,
  showModelPrefillWarning = false,
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
            setIsSecretRevealed(true)
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
  const secretFieldSignature = descriptors
    .filter((descriptor) => descriptor.type === "secret")
    .map(
      (descriptor) =>
        `${descriptor.fieldId}:${descriptor.secretState}:${descriptor.canReplace}`,
    )
    .join("|")
  useEffect(() => {
    setLoadedSecret(undefined)
    setIsSecretRevealed(false)
    setIsSecretLoading(false)
    setSecretLoadFailed(false)
    return () => {
      secretLoadController.current?.abort()
      secretLoadController.current = undefined
    }
  }, [onLoadSecret, secretFieldSignature])

  const nativePolicy = useMemo(
    () => ({
      ...policy,
      fields: policy.fields.map((field) => ({
        ...field,
        issueLabelResolvers: {
          ...ISSUE_LABEL_RESOLVERS,
          ...field.issueLabelResolvers,
        },
      })),
    }),
    [policy],
  )

  return (
    <NativeResourceEditorBody
      t={t}
      descriptors={descriptors}
      policy={nativePolicy}
      sectionOrder={MANAGED_RESOURCE_SECTION_ORDER}
      sectionLabelResolvers={SECTION_LABEL_RESOLVERS}
      values={values}
      fieldIssues={fieldIssues}
      disabled={disabled}
      onValueChange={onValueChange}
      renderFieldOverride={({ descriptor, presentation, errorMessage }) => {
        const fieldId = descriptor.fieldId
        const currentValue = readString(values, fieldId)
        const selectOptions =
          descriptor.type === "select"
            ? [
                ...(currentValue &&
                !descriptor.options.some(
                  (option) => option.value === currentValue,
                )
                  ? [{ value: currentValue, displayLabel: currentValue }]
                  : []),
                ...descriptor.options,
              ].map((option) => ({
                value: option.value,
                label:
                  option.displayLabel ??
                  getManagedResourceFieldOptionLabel(
                    presentation,
                    option.value,
                    t,
                  ),
              }))
            : []
        if (fieldId === MANAGED_RESOURCE_COMMON_CHANNEL_FIELD_IDS.Name) {
          return (
            <ChannelNameField
              key={fieldId}
              t={t}
              value={readString(values, fieldId)}
              onChange={(value) => onValueChange(fieldId, value)}
              disabled={disabled}
              required={descriptor.required}
              errorMessage={errorMessage}
            />
          )
        }
        if (
          fieldId === MANAGED_RESOURCE_COMMON_CHANNEL_FIELD_IDS.Type &&
          descriptor.type === "select"
        ) {
          return (
            <ChannelTypeField
              key={fieldId}
              t={t}
              value={readString(values, fieldId)}
              options={selectOptions}
              onChange={(value) => onValueChange(fieldId, value)}
              disabled={disabled}
              required={descriptor.required}
              errorMessage={errorMessage}
            />
          )
        }
        if (
          fieldId === MANAGED_RESOURCE_COMMON_CHANNEL_FIELD_IDS.Status &&
          descriptor.type === "select"
        ) {
          return (
            <ChannelStatusField
              key={fieldId}
              t={t}
              value={readString(values, fieldId)}
              options={selectOptions}
              onChange={(value) => onValueChange(fieldId, value)}
              disabled={disabled}
              required={descriptor.required}
              errorMessage={errorMessage}
            />
          )
        }
        if (fieldId === MANAGED_RESOURCE_COMMON_CHANNEL_FIELD_IDS.BaseUrl) {
          return (
            <ChannelBaseUrlField
              key={fieldId}
              t={t}
              value={readString(values, fieldId)}
              onChange={(value) => onValueChange(fieldId, value)}
              disabled={disabled}
              required={descriptor.required}
              errorMessage={errorMessage}
            />
          )
        }
        if (
          fieldId === MANAGED_RESOURCE_COMMON_CHANNEL_FIELD_IDS.Models &&
          descriptor.type === "multi-select"
        ) {
          return (
            <ChannelModelsField
              key={fieldId}
              t={t}
              options={descriptor.options.map((option) => ({
                value: option.value,
                label: option.displayLabel ?? option.value,
              }))}
              selected={normalizeEditorList(readList(values, fieldId))}
              onChange={(value) => {
                const normalizedValue = normalizeEditorList(value)
                const mirrorFieldId = presentation.customValuesMirrorFieldId
                if (mirrorFieldId) {
                  const previousValues = normalizeEditorList(
                    readList(values, fieldId),
                  )
                  const knownValues = new Set(
                    descriptor.options.map((option) => option.value),
                  )
                  const retainedManualValues = normalizeEditorList(
                    readList(values, mirrorFieldId),
                  ).filter((model) => normalizedValue.includes(model))
                  const addedCustomValues = normalizedValue.filter(
                    (model) =>
                      !previousValues.includes(model) &&
                      !knownValues.has(model),
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
            />
          )
        }
        if (
          fieldId !== MANAGED_RESOURCE_COMMON_CHANNEL_FIELD_IDS.Secret ||
          descriptor.type !== "secret"
        )
          return undefined
        const intent = readSecretIntent(values, fieldId)
        const inputValue =
          descriptor.canReplace && intent.kind === "replace"
            ? intent.value
            : loadedSecret?.fieldId === fieldId
              ? loadedSecret.value
              : ""
        const stateDescription =
          SECRET_STATE_LABEL_RESOLVERS[descriptor.secretState](t)
        const canLoadSavedSecret =
          Boolean(onLoadSecret) &&
          descriptor.secretState === "available" &&
          descriptor.canReplace &&
          intent.kind === "unchanged" &&
          loadedSecret?.fieldId !== fieldId
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
        ) : descriptor.canReplace &&
          descriptor.secretState !== "unavailable" ? (
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
            key={fieldId}
            t={t}
            value={inputValue}
            onChange={(value) => {
              cancelSecretLoad()
              setLoadedSecret(undefined)
              onValueChange(
                fieldId,
                value ? { kind: "replace", value } : { kind: "unchanged" },
              )
            }}
            disabled={disabled || !descriptor.canReplace}
            required={descriptor.required}
            revealed={isSecretRevealed}
            onRevealedChange={setIsSecretRevealed}
            placeholder={t("managedSiteChannels:editor.secret.placeholder")}
            description={description}
            errorMessage={errorMessage}
            actions={
              descriptor.allowClear ||
              secretLoadFailed ||
              (canLoadSavedSecret && !isSecretLoading) ? (
                <>
                  {canLoadSavedSecret &&
                  !isSecretLoading &&
                  !secretLoadFailed ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => startSecretLoad(fieldId)}
                    >
                      {t("managedSiteChannels:editor.secret.actions.view")}
                    </Button>
                  ) : null}
                  {descriptor.allowClear ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() =>
                        onValueChange(
                          fieldId,
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
                        onClick={() => startSecretLoad(fieldId)}
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
      }}
    />
  )
}
