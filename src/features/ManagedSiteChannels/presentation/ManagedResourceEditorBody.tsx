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

import { ManagedResourceChannelField } from "./ManagedResourceChannelField"
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
        issueLabelResolvers: {
          ...ISSUE_LABEL_RESOLVERS,
          ...field.issueLabelResolvers,
        },
      })),
    }),
    [policy],
  )
  const channelFieldRoles = useMemo(
    () =>
      new Map(
        policy.fields.map((field) => [field.fieldId, field.channelFieldRole]),
      ),
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
      onLoadOptions={onLoadOptions}
      renderFieldOverride={({
        descriptor,
        presentation,
        errorMessage,
        options,
        optionControl,
      }) => {
        const fieldId = descriptor.fieldId
        if (!channelFieldRoles.get(fieldId)) return undefined
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
            disabled={disabled}
            showModelPrefillWarning={showModelPrefillWarning}
            onValueChange={onValueChange}
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
