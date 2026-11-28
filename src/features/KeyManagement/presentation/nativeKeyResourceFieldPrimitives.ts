import type { TFunction } from "i18next"

import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import { type ResourceFieldPresentation } from "~/features/ResourceEditor/model/resourceFieldPolicy"
import { getDefaultAccountKeyName } from "~/services/accounts/keys/accountKeyNames"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"

import type { AccountKeyResourceEditorPresentation as EditorPresentation } from "./accountKeyResourceEditorPresentation"

export const issues = {
  required: (t: TFunction) => t("keyManagement:native.editor.issues.required"),
  invalid_value: (t: TFunction) =>
    t("keyManagement:native.editor.issues.invalidValue"),
  out_of_range: (t: TFunction) =>
    t("keyManagement:native.editor.issues.outOfRange"),
  unsupported_option: (t: TFunction) =>
    t("keyManagement:native.editor.issues.unsupportedOption"),
  inconsistent_value: (t: TFunction) =>
    t("keyManagement:native.editor.issues.inconsistentValue"),
}

export const name: ResourceFieldPresentation = {
  fieldId: "name",
  section: "basic",
  order: 0,
  renderer: RESOURCE_FIELD_TYPES.Text,
  resolveLabel: (t) => t("keyManagement:dialog.tokenName"),
  issueLabelResolvers: issues,
}

export const expiryField = (
  fieldId = "expires_at",
): ResourceFieldPresentation => ({
  fieldId,
  section: "lifecycle",
  order: 0,
  renderer: RESOURCE_FIELD_TYPES.DateTime,
  resolveLabel: (t) => t("keyManagement:dialog.expiration"),
  resolveHelp: (t) => t("keyManagement:dialog.expirationPlaceholder"),
  issueLabelResolvers: issues,
})

export const expiry = expiryField()

export const group = (
  fieldId: string,
  multiple = false,
  followsAccount = false,
  nullable = true,
): ResourceFieldPresentation => {
  const common = {
    fieldId,
    section: "basic",
    order: 10,
    resolveLabel: (t: TFunction) => t("keyManagement:dialog.groupLabel"),
    issueLabelResolvers: issues,
  }
  return multiple
    ? { ...common, renderer: RESOURCE_FIELD_TYPES.MultiSelect }
    : {
        ...common,
        renderer: RESOURCE_FIELD_TYPES.Select,
        ...(nullable
          ? {
              resolveNullableOptionLabel: (t: TFunction) =>
                followsAccount
                  ? t("keyManagement:keyDetails.followsAccountGroup")
                  : t("keyManagement:keyDetails.ungrouped"),
            }
          : {}),
      }
}

/**
 * Quota pair shared by every native editor. Label resolution is passed in so
 * each call site keeps its translation keys as literals the extractor can see.
 */
export const quotaField = (
  fieldId: string,
  unlimitedId: string,
  resolveLabel: (t: TFunction) => string,
  resolveHelp?: (t: TFunction) => string,
  resolvePlaceholder = (t: TFunction) =>
    t("keyManagement:dialog.quotaPlaceholder"),
): ResourceFieldPresentation[] => [
  {
    fieldId: unlimitedId,
    section: "spending",
    order: 0,
    renderer: RESOURCE_FIELD_TYPES.Boolean,
    resolveLabel: (t) => t("keyManagement:dialog.unlimitedQuota"),
    issueLabelResolvers: issues,
  },
  {
    fieldId,
    section: "spending",
    order: 10,
    renderer: RESOURCE_FIELD_TYPES.Number,
    resolveLabel,
    resolvePlaceholder,
    ...(resolveHelp ? { resolveHelp } : {}),
    visibleWhen: (values) => values[unlimitedId] !== true,
    issueLabelResolvers: issues,
  },
]

export const quota = (
  fieldId: string,
  unlimitedId: string,
  total = false,
): ResourceFieldPresentation[] =>
  quotaField(fieldId, unlimitedId, (t) =>
    total
      ? t("keyManagement:native.editor.totalQuotaUsd")
      : t("keyManagement:native.editor.quotaUsd"),
  )

export const models = (fieldId: string): ResourceFieldPresentation => ({
  fieldId,
  section: "advanced",
  order: 10,
  renderer: RESOURCE_FIELD_TYPES.MultiSelect,
  resolveLabel: (t) => t("keyManagement:dialog.availableModels"),
  resolvePlaceholder: (t) => t("keyManagement:dialog.selectModels"),
  issueLabelResolvers: issues,
})

export const ips = (fieldId: string): ResourceFieldPresentation => ({
  fieldId,
  section: "advanced",
  order: 20,
  renderer: RESOURCE_FIELD_TYPES.Textarea,
  resolveLabel: (t) => t("keyManagement:dialog.ipLimits"),
  resolvePlaceholder: (t) => t("keyManagement:dialog.ipPlaceholder"),
  issueLabelResolvers: issues,
})

export const enabled = (fieldId: string): ResourceFieldPresentation => ({
  fieldId,
  section: "lifecycle",
  order: 10,
  renderer: RESOURCE_FIELD_TYPES.Boolean,
  resolveLabel: (t) => t("common:status.enabled"),
  issueLabelResolvers: issues,
})

export const groupNamePolicy = (
  fieldId: string,
  useOptionLabels = false,
  unselectedName = getDefaultAccountKeyName(),
): EditorPresentation["automaticName"] => ({
  kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Group,
  fieldId,
  useOptionLabels,
  unselectedName,
})
