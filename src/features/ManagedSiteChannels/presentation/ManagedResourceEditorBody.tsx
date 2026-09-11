import type { TFunction } from "i18next"
import { useMemo } from "react"

import { NativeResourceEditorBody } from "~/features/ResourceEditor/NativeResourceEditorBody"
import type {
  EditableResourceProjection,
  ResourceFieldDescriptor,
  ResourceFieldIssue,
  ResourceFieldOption,
  ResourceFieldValue,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"

import { ManagedResourceAdvancedField } from "./ManagedResourceAdvancedField"
import { ManagedResourceAdvancedProjectionField } from "./ManagedResourceAdvancedProjectionField"
import {
  canRenderManagedResourceChannelField,
  ManagedResourceChannelField,
} from "./ManagedResourceChannelField"
import {
  MANAGED_RESOURCE_SECTION_ORDER,
  MANAGED_RESOURCE_SECTIONS,
  type ManagedResourceEditorFieldPolicy,
  type ManagedResourceEditorMode,
  type ManagedResourceFieldPresentation,
  type ManagedResourceSection,
  type ManagedResourceTextResolver,
} from "./managedResourceFieldPolicy"
import { useManagedResourceSecretLoad } from "./useManagedResourceSecretLoad"

type ManagedResourceEditorBodyProps = {
  t: TFunction
  mode: ManagedResourceEditorMode
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
  onLoadOptions?: (
    fieldId: string,
    values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ) => Promise<readonly ResourceFieldOption[]>
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
  [MANAGED_RESOURCE_SECTIONS.Compatibility]: (t: TFunction) =>
    t("managedSiteChannels:editor.sections.compatibility"),
  [MANAGED_RESOURCE_SECTIONS.Requests]: (t: TFunction) =>
    t("managedSiteChannels:editor.sections.requests"),
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

/** Applies channel-specific controls through provider-owned semantic roles. */
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
  onLoadOptions,
}: ManagedResourceEditorBodyProps) {
  const secretLoad = useManagedResourceSecretLoad({
    descriptors,
    onLoadSecret,
    onValueChange,
  })

  const nativePolicy = useMemo(
    () => ({
      ...policy,
      fields: policy.fields.map((field) => ({
        ...field,
        ...(field.resolveReadOnlyHelp &&
        !["timestamp", "model-summary"].includes(
          field.channelFieldRole ?? "",
        ) &&
        descriptors.some(
          (descriptor) =>
            descriptor.fieldId === field.fieldId && descriptor.readOnly,
        )
          ? {
              resolveHelp: field.resolveReadOnlyHelp,
              resolveDisabledHelp: field.resolveReadOnlyHelp,
            }
          : {}),
        issueLabelResolvers: {
          ...ISSUE_LABEL_RESOLVERS,
          ...field.issueLabelResolvers,
        },
      })),
    }),
    [policy, descriptors],
  )
  const channelFieldRoles = useMemo(
    () =>
      new Map(
        policy.fields.map((field) => [field.fieldId, field.channelFieldRole]),
      ),
    [policy],
  )

  const handleValueChange = (fieldId: string, value: ResourceFieldValue) => {
    onValueChange(fieldId, value)
    if (value === false) {
      for (const dependentId of policy.fields.find(
        (field) => field.fieldId === fieldId,
      )?.disableWithFieldIds ?? [])
        onValueChange(dependentId, false)
    }
  }
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
      onValueChange={handleValueChange}
      onLoadOptions={onLoadOptions}
      onLoadSecret={onLoadSecret}
      renderFieldOverride={({
        descriptor,
        presentation,
        errorMessage,
        options,
        optionControl,
        disabled: fieldDisabled,
      }) => {
        const fieldId = descriptor.fieldId
        const channelPresentation =
          presentation as ManagedResourceFieldPresentation
        if (channelPresentation.advancedControl)
          return (
            <ManagedResourceAdvancedField
              t={t}
              presentation={channelPresentation}
              values={values}
              disabled={fieldDisabled}
              errorMessage={errorMessage}
              onValueChange={handleValueChange}
            />
          )
        const channelFieldRole = channelFieldRoles.get(fieldId)
        if (
          ["string-mapping", "timestamp", "model-summary"].includes(
            channelFieldRole ?? "",
          )
        )
          return (
            <ManagedResourceAdvancedProjectionField
              t={t}
              descriptor={descriptor}
              presentation={
                policy.fields.find((field) => field.fieldId === fieldId)!
              }
              values={values}
              disabled={fieldDisabled}
              errorMessage={errorMessage}
              onValueChange={handleValueChange}
            />
          )
        if (
          !channelFieldRole ||
          !canRenderManagedResourceChannelField(channelFieldRole, descriptor)
        )
          return undefined
        return (
          <ManagedResourceChannelField
            key={fieldId}
            t={t}
            mode={mode}
            descriptor={descriptor}
            presentation={presentation as ManagedResourceFieldPresentation}
            values={values}
            errorMessage={errorMessage}
            options={options}
            optionControl={optionControl}
            disabled={fieldDisabled}
            showModelPrefillWarning={showModelPrefillWarning}
            onValueChange={handleValueChange}
            loadedSecret={secretLoad.loadedSecret}
            isSecretRevealed={secretLoad.isSecretRevealed}
            isSecretLoading={secretLoad.isSecretLoading}
            secretLoadFailed={secretLoad.secretLoadFailed}
            canLoadSecret={secretLoad.canLoadSecret}
            onSecretRevealedChange={secretLoad.setIsSecretRevealed}
            onSecretLoadStart={secretLoad.startSecretLoad}
            onSecretLoadCancel={secretLoad.cancelSecretLoad}
            onSecretInput={secretLoad.handleSecretInput}
          />
        )
      }}
    />
  )
}
