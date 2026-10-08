import type { TFunction } from "i18next"

import {
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  type AccountKeyResourceEditorMode,
} from "~/features/KeyManagement/constants"
import {
  defineResourceEditorFieldPolicy,
  type ResourceFieldPresentation,
} from "~/features/ResourceEditor/model/resourceFieldPolicy"
import { getDefaultAccountKeyName } from "~/services/accounts/keys/accountKeyNames"
import type { ResourceFieldDescriptor } from "~/services/apiAdapters/contracts/resourceNative"

import type { AccountKeyResourceEditorPresentation as EditorPresentation } from "./accountKeyResourceEditorPresentation"
import { getKeyResourcePresentationPolicy } from "./keyResourcePresentationPolicy"
import { laozhangDeploymentFields } from "./laozhangKeyResourceFieldPolicy"
import { getOpenRouterKeyResourceEditorPresentation } from "./openRouterKeyResourceFieldPolicy"
import { rixApiDeploymentFields } from "./rixApiKeyResourceFieldPolicy"

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
/**
 * Quota pair shared by every native editor. Label resolution is passed in so
 * each call site keeps its translation keys as literals the extractor can see.
 */
const quotaField = (
  fieldId: string,
  unlimitedId: string,
  resolveLabel: (t: TFunction) => string,
  resolveHelp?: (t: TFunction) => string,
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
    resolveLabel,
    resolvePlaceholder: (t) => t("keyManagement:dialog.quotaPlaceholder"),
    ...(resolveHelp ? { resolveHelp } : {}),
    visibleWhen: (values) => values[unlimitedId] !== true,
    issueLabelResolvers: issues,
  },
]
const quota = (
  fieldId: string,
  unlimitedId: string,
  total = false,
): ResourceFieldPresentation[] =>
  quotaField(fieldId, unlimitedId, (t) =>
    total
      ? t("keyManagement:native.editor.totalQuotaUsd")
      : t("keyManagement:native.editor.quotaUsd"),
  )
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

const buildSub2ApiFields = (
  mode: AccountKeyResourceEditorMode,
): {
  fields: ResourceFieldPresentation[]
  getAutomaticName: EditorPresentation["getAutomaticName"]
} => ({
  getAutomaticName: groupAutomaticName("group_id", true),
  fields: [
    name,
    group("group_id"),
    ...quota("quota", "unlimited", true),
    mode === editorModes.Edit
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
    ...(mode === editorModes.Edit ? [enabled("enabled")] : []),
    ips("ip_whitelist"),
  ],
})

const buildVoApiV2Fields = (): {
  fields: ResourceFieldPresentation[]
  getAutomaticName: EditorPresentation["getAutomaticName"]
} => ({
  getAutomaticName: groupAutomaticName("groups", true),
  fields: [
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
  ],
})

const buildRightCodeFields = (
  mode: AccountKeyResourceEditorMode,
): {
  fields: ResourceFieldPresentation[]
  getAutomaticName: EditorPresentation["getAutomaticName"]
} => ({
  getAutomaticName: groupAutomaticName("channel", true),
  fields: [
    name,
    {
      fieldId: "channel",
      section: "basic",
      order: 10,
      renderer: "select",
      resolveLabel: (t) => t("keyManagement:native.editor.channel"),
      issueLabelResolvers: issues,
    },
    ...quota("quotaUsd", "unlimited_quota"),
    expiry,
    ...(mode === editorModes.Edit ? [enabled("is_active")] : []),
    models("models"),
    {
      fieldId: "allow_wallet",
      section: "spending",
      order: 20,
      renderer: "boolean",
      resolveLabel: (t) => t("keyManagement:native.editor.allowWallet"),
      resolveHelp: (t) => t("keyManagement:native.editor.allowWalletHelp"),
      issueLabelResolvers: issues,
    },
  ],
})

/**
 * Grsai keys are a name, a remaining credit budget and an optional expiry; the
 * console prices everything in its own credits rather than in currency.
 */
const buildGrsaiFields = (): {
  fields: ResourceFieldPresentation[]
  getAutomaticName?: EditorPresentation["getAutomaticName"]
} => ({
  fields: [
    name,
    ...quotaField(
      "credits",
      "unlimited_credits",
      (t) => t("keyManagement:native.editor.quotaCredits"),
      (t) => t("keyManagement:native.editor.quotaCreditsHelp"),
    ),
    expiry,
  ],
})

const buildAiHubMixFields = (): {
  fields: ResourceFieldPresentation[]
  getAutomaticName?: EditorPresentation["getAutomaticName"]
} => ({
  fields: [
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
  ],
})

const buildNewApiFamilyFields = (
  descriptors: readonly ResourceFieldDescriptor[],
): {
  fields: ResourceFieldPresentation[]
  getAutomaticName: EditorPresentation["getAutomaticName"]
} => {
  const descriptorsById = new Map(
    descriptors.map((descriptor) => [descriptor.fieldId, descriptor]),
  )

  const candidateFields: ResourceFieldPresentation[] = [
    name,
    group("group", false, true),
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
    ...rixApiDeploymentFields(issues),
    ...laozhangDeploymentFields(issues),
  ]

  const fields = candidateFields
    .filter((field) => descriptorsById.has(field.fieldId))
    .map((field) =>
      field.renderer === "select"
        ? {
            ...field,
            resolveNullableOptionLabel: descriptorsById.get(field.fieldId)
              ?.nullable
              ? field.resolveNullableOptionLabel
              : undefined,
          }
        : field,
    )

  return {
    getAutomaticName: groupAutomaticName("group"),
    fields,
  }
}

const resolveSiteFields = (
  siteType: string | undefined,
  mode: AccountKeyResourceEditorMode,
  descriptors?: readonly ResourceFieldDescriptor[],
): {
  fields: ResourceFieldPresentation[]
  getAutomaticName?: EditorPresentation["getAutomaticName"]
} => {
  const builders = {
    sub2api: () => buildSub2ApiFields(mode),
    "voapi-v2": buildVoApiV2Fields,
    rightcode: () => buildRightCodeFields(mode),
    "name-only": () => ({ fields: [name] }),
    grsai: buildGrsaiFields,
    aihubmix: buildAiHubMixFields,
    "new-api": () => buildNewApiFamilyFields(descriptors ?? []),
    empty: () => ({ fields: [] }),
    // The full workspace editor is handled before selecting native fields.
    openrouter: () => ({ fields: [] }),
  }
  return builders[getKeyResourcePresentationPolicy(siteType).editor]()
}

/** Frontend-owned field policies are selected by provider, never by upstream labels. */
export function getNativeKeyResourceEditorPresentation(
  siteType: string | undefined,
  mode: AccountKeyResourceEditorMode,
  options?: { readonly fields?: readonly ResourceFieldDescriptor[] },
): EditorPresentation {
  if (getKeyResourcePresentationPolicy(siteType).editor === "openrouter") {
    return getOpenRouterKeyResourceEditorPresentation(mode)
  }

  const { fields, getAutomaticName } = resolveSiteFields(
    siteType,
    mode,
    options?.fields,
  )

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
