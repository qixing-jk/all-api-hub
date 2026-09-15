import type { TFunction } from "i18next"

import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import {
  defineResourceEditorFieldPolicy,
  type ResourceFieldPresentation,
} from "~/features/ResourceEditor/resourceFieldPolicy"
import { getDefaultAccountKeyName } from "~/services/accounts/accountKeyNames"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"

import type { AccountKeyResourceEditorPresentation as EditorPresentation } from "./accountKeyResourceEditorPresentation"
import { getOpenRouterKeyResourceEditorPresentation } from "./openRouterKeyResourceFieldPolicy"

const issues = {
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

const name: ResourceFieldPresentation = {
  fieldId: "name",
  section: "basic",
  order: 0,
  renderer: "text",
  resolveLabel: (t) => t("keyManagement:dialog.tokenName"),
  issueLabelResolvers: issues,
}
const expiry: ResourceFieldPresentation = {
  fieldId: "expires_at",
  section: "lifecycle",
  order: 0,
  renderer: "date-time",
  resolveLabel: (t) => t("keyManagement:dialog.expiration"),
  resolveHelp: (t) => t("keyManagement:dialog.expirationPlaceholder"),
  issueLabelResolvers: issues,
}
const group = (
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
    ? { ...common, renderer: "multi-select" }
    : {
        ...common,
        renderer: "select",
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
const quota = (
  fieldId: string,
  unlimitedId: string,
  total = false,
): ResourceFieldPresentation[] => [
  {
    fieldId: unlimitedId,
    section: "spending",
    order: 0,
    renderer: "boolean",
    resolveLabel: (t) => t("keyManagement:dialog.unlimitedQuota"),
    issueLabelResolvers: issues,
  },
  {
    fieldId,
    section: "spending",
    order: 10,
    renderer: "number",
    resolveLabel: (t) =>
      total
        ? t("keyManagement:native.editor.totalQuotaUsd")
        : t("keyManagement:native.editor.quotaUsd"),
    resolvePlaceholder: (t) => t("keyManagement:dialog.quotaPlaceholder"),
    visibleWhen: (values) => values[unlimitedId] !== true,
    issueLabelResolvers: issues,
  },
]
const models = (fieldId: string): ResourceFieldPresentation => ({
  fieldId,
  section: "advanced",
  order: 10,
  renderer: "multi-select",
  resolveLabel: (t) => t("keyManagement:dialog.availableModels"),
  resolvePlaceholder: (t) => t("keyManagement:dialog.selectModels"),
  issueLabelResolvers: issues,
})
const ips = (fieldId: string): ResourceFieldPresentation => ({
  fieldId,
  section: "advanced",
  order: 20,
  renderer: "textarea",
  resolveLabel: (t) => t("keyManagement:dialog.ipLimits"),
  resolvePlaceholder: (t) => t("keyManagement:dialog.ipPlaceholder"),
  issueLabelResolvers: issues,
})
const enabled = (fieldId: string): ResourceFieldPresentation => ({
  fieldId,
  section: "lifecycle",
  order: 10,
  renderer: "boolean",
  resolveLabel: (t) => t("common:status.enabled"),
  issueLabelResolvers: issues,
})

/** Uses visible group names; multiple groups retain the generic generated name. */
const groupAutomaticName =
  (
    fieldId: string,
    useOptionLabels = false,
  ): NonNullable<EditorPresentation["getAutomaticName"]> =>
  (values, optionsByField) => {
    const value = values[fieldId]
    const selected = Array.isArray(value)
      ? value.length === 1
        ? value[0]
        : null
      : value
    if (selected == null || selected === "") return getDefaultAccountKeyName()
    if (typeof selected !== "string") return undefined
    const groupName = useOptionLabels
      ? optionsByField?.[fieldId]?.find((option) => option.value === selected)
          ?.displayLabel
      : selected
    return groupName === undefined
      ? undefined
      : getDefaultAccountKeyName(groupName)
  }

/** Frontend-owned field policies are selected by provider, never by upstream labels. */
export function getNativeKeyResourceEditorPresentation(
  siteType: string | undefined,
  mode: "create" | "edit",
): EditorPresentation {
  if (siteType === SITE_TYPES.OPENROUTER)
    return getOpenRouterKeyResourceEditorPresentation(mode)
  let fields: ResourceFieldPresentation[]
  let getAutomaticName: EditorPresentation["getAutomaticName"]
  if (siteType === SITE_TYPES.SUB2API) {
    getAutomaticName = groupAutomaticName("group_id", true)
    fields = [
      name,
      group("group_id"),
      ...quota("quota", "unlimited", true),
      mode === "edit"
        ? expiry
        : {
            fieldId: "expires_in_days",
            section: "lifecycle",
            order: 0,
            renderer: "number",
            resolveLabel: (t) => t("keyManagement:native.editor.expiryDays"),
            resolveHelp: (t) => t("keyManagement:dialog.expirationPlaceholder"),
            issueLabelResolvers: issues,
          },
      ...(mode === "edit" ? [enabled("enabled")] : []),
      ips("ip_whitelist"),
    ]
  } else if (siteType === SITE_TYPES.VO_API_V2) {
    getAutomaticName = groupAutomaticName("groups", true)
    fields = [
      name,
      group("groups", true),
      ...quota("amount", "boundlessAmount"),
      expiry,
      enabled("enable"),
      {
        fieldId: "note",
        section: "advanced",
        order: 30,
        renderer: "textarea",
        resolveLabel: (t) => t("keyManagement:keyDetails.note"),
        issueLabelResolvers: issues,
      },
    ]
  } else if (siteType === SITE_TYPES.AIHUBMIX) {
    fields = [
      name,
      ...quota("quotaUsd", "unlimited_quota"),
      expiry,
      models("models"),
      {
        fieldId: "subnet",
        section: "advanced",
        order: 20,
        renderer: "textarea",
        resolveLabel: (t) => t("keyManagement:dialog.subnetLimits"),
        resolvePlaceholder: (t) => t("keyManagement:dialog.subnetPlaceholder"),
        issueLabelResolvers: issues,
      },
    ]
  } else if (
    getAccountSiteDefinition(siteType ?? "")?.adapterFamily ===
    ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily
  ) {
    getAutomaticName = groupAutomaticName("group")
    fields = [
      name,
      ...(siteType === SITE_TYPES.ONE_API
        ? []
        : [group("group", false, true, siteType !== SITE_TYPES.MODELFLARE)]),
      ...quota("quotaUsd", "unlimited_quota"),
      expiry,
      {
        fieldId: "model_limits_enabled",
        section: "advanced",
        order: 0,
        renderer: "boolean",
        resolveLabel: (t) => t("keyManagement:dialog.modelLimits"),
        issueLabelResolvers: issues,
      },
      {
        ...models("model_limits"),
        visibleWhen: (values) => values.model_limits_enabled === true,
      },
      ips("allow_ips"),
    ]
  } else {
    fields = []
  }
  return {
    getAutomaticName,
    policy: defineResourceEditorFieldPolicy({ fields, hiddenFields: [] }),
    sectionOrder: { basic: 0, spending: 1, lifecycle: 2, advanced: 3 },
    sectionLabelResolvers: {
      basic: (t) => t("keyManagement:dialog.basicInfo"),
      spending: (t) => t("keyManagement:dialog.quotaSettings"),
      lifecycle: (t) => t("keyManagement:dialog.expiration"),
      advanced: (t) => t("keyManagement:dialog.advancedSettings"),
    },
  }
}
