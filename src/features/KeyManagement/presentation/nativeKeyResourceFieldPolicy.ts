import type { TFunction } from "i18next"

import {
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  type AccountKeyResourceEditorMode,
} from "~/features/KeyManagement/constants"
import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import {
  defineResourceEditorFieldPolicy,
  type ResourceFieldPresentation,
} from "~/features/ResourceEditor/model/resourceFieldPolicy"
import {
  DEFAULT_AUTO_PROVISION_KEY_NAME,
  getDefaultAccountKeyName,
} from "~/services/accounts/keys/accountKeyNames"
import type { ResourceFieldDescriptor } from "~/services/apiAdapters/contracts/resourceNative"
import { FOXCODE_KEY_EDITOR_FIELDS as foxCodeFields } from "~/services/apiAdapters/foxcode/keyEditorFields"
import { krillKeyFields } from "~/services/apiAdapters/krill/keyResourceFields"

import type { AccountKeyResourceEditorPresentation as EditorPresentation } from "./accountKeyResourceEditorPresentation"
import { getDahlKeyResourceEditorPresentation } from "./dahlKeyResourceEditorPresentation"
import {
  KEY_RESOURCE_EDITOR_KINDS as editorKinds,
  getKeyResourcePresentationPolicy,
} from "./keyResourcePresentationPolicy"
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

const groupNamePolicy = (
  fieldId: string,
  useOptionLabels = false,
  unselectedName = getDefaultAccountKeyName(),
): EditorPresentation["automaticName"] => ({
  kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Group,
  fieldId,
  useOptionLabels,
  unselectedName,
})

const buildSub2ApiFields = (
  mode: AccountKeyResourceEditorMode,
): {
  fields: ResourceFieldPresentation[]
  automaticName: EditorPresentation["automaticName"]
} => ({
  automaticName: groupNamePolicy("group_id", true),
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
  automaticName: EditorPresentation["automaticName"]
} => ({
  automaticName: groupNamePolicy("groups", true),
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
  automaticName: EditorPresentation["automaticName"]
} => ({
  automaticName: groupNamePolicy("channel", true),
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
  automaticName: EditorPresentation["automaticName"]
} => ({
  automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed },
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
  automaticName: EditorPresentation["automaticName"]
} => ({
  automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed },
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
  automaticName: EditorPresentation["automaticName"]
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
    automaticName: groupNamePolicy("group"),
    fields,
  }
}

const resolveSiteFields = (
  siteType: string | undefined,
  mode: AccountKeyResourceEditorMode,
  descriptors?: readonly ResourceFieldDescriptor[],
): {
  fields: ResourceFieldPresentation[]
  automaticName: EditorPresentation["automaticName"]
  requireFreshOptions?: EditorPresentation["requireFreshOptions"]
} => {
  const builders = {
    [editorKinds.Sub2Api]: () => buildSub2ApiFields(mode),
    [editorKinds.VoApiV2]: buildVoApiV2Fields,
    [editorKinds.RightCode]: () => buildRightCodeFields(mode),
    [editorKinds.NameOnly]: () => ({
      fields: [name],
      automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
    }),
    [editorKinds.Grsai]: buildGrsaiFields,
    [editorKinds.FoxCode]: (): {
      fields: ResourceFieldPresentation[]
      requireFreshOptions: boolean
      automaticName: EditorPresentation["automaticName"]
    } => ({
      requireFreshOptions: true,
      automaticName: groupNamePolicy(
        foxCodeFields.Channel,
        true,
        DEFAULT_AUTO_PROVISION_KEY_NAME,
      ),
      fields: [
        name,
        {
          fieldId: foxCodeFields.Description,
          section: "basic",
          order: 5,
          renderer: "textarea",
          resolveLabel: (t: TFunction) =>
            t("keyManagement:native.editor.description"),
          issueLabelResolvers: issues,
        },
        {
          fieldId: foxCodeFields.Channel,
          section: "basic",
          order: 10,
          renderer: "select",
          resolveLabel: (t: TFunction) =>
            t("keyManagement:native.editor.channel"),
          issueLabelResolvers: issues,
        },
        ...quota(foxCodeFields.Quota, foxCodeFields.Unlimited, true),
        ...(mode === editorModes.Edit
          ? [{ ...enabled(foxCodeFields.Enabled), section: "basic", order: 30 }]
          : []),
      ],
    }),
    // Dahl's transfer editor is selected before this generic field-only builder.
    [editorKinds.Dahl]: () => ({
      fields: [],
      automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
    }),
    // Krill keys have no quota or expiry; permissions are channels, fallback and IPs.
    [editorKinds.Krill]: (): {
      fields: ResourceFieldPresentation[]
      requireFreshOptions: boolean
      automaticName: EditorPresentation["automaticName"]
    } => ({
      requireFreshOptions: mode === editorModes.Edit,
      automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
      fields: (
        [
          name,
          {
            fieldId: krillKeyFields.Channels,
            section: "basic",
            order: 10,
            renderer: "multi-select",
            resolveLabel: (t: TFunction) =>
              t("keyManagement:native.editor.krill.channels"),
            resolveHelp: (t: TFunction) =>
              t("keyManagement:native.editor.krill.channelsHelp"),
            issueLabelResolvers: issues,
          },
          {
            fieldId: krillKeyFields.AllowBalanceFallback,
            section: "spending",
            order: 20,
            renderer: "boolean",
            resolveLabel: (t) => t("keyManagement:native.editor.allowWallet"),
            resolveHelp: (t) =>
              t("keyManagement:native.editor.allowWalletHelp"),
            issueLabelResolvers: issues,
          },
          {
            fieldId: krillKeyFields.IpWhitelistDisabled,
            section: "advanced",
            order: 0,
            renderer: "boolean",
            resolveLabel: (t) =>
              t("keyManagement:native.editor.krill.allowAnyIp"),
            resolveHelp: (t) =>
              t("keyManagement:native.editor.krill.allowAnyIpHelp"),
            issueLabelResolvers: issues,
          },
          ips(krillKeyFields.IpWhitelist),
        ] satisfies ResourceFieldPresentation[]
      ).filter((field) =>
        descriptors?.some(({ fieldId }) => fieldId === field.fieldId),
      ),
    }),
    [editorKinds.Cubence]: () => ({
      requireFreshOptions: true,
      automaticName: groupNamePolicy(
        "group",
        true,
        DEFAULT_AUTO_PROVISION_KEY_NAME,
      ),
      fields: [
        ...(mode === editorModes.Edit ? [] : [name]),
        group("group", false, false, false),
        ...quota("quota", "unlimited", true),
        ...(mode === editorModes.Edit
          ? [{ ...enabled("enabled"), section: "basic", order: 30 }]
          : []),
      ],
    }),
    [editorKinds.AiHubMix]: buildAiHubMixFields,
    [editorKinds.NewApi]: () => buildNewApiFamilyFields(descriptors ?? []),
    [editorKinds.Empty]: () => ({
      fields: [],
      automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
    }),
    // The full workspace editor is handled before selecting native fields.
    [editorKinds.OpenRouter]: () => ({
      fields: [],
      automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
    }),
  }
  return builders[getKeyResourcePresentationPolicy(siteType).editor]()
}

/** Frontend-owned field policies are selected by provider, never by upstream labels. */
export function getNativeKeyResourceEditorPresentation(
  siteType: string | undefined,
  mode: AccountKeyResourceEditorMode,
  options?: { readonly fields?: readonly ResourceFieldDescriptor[] },
): EditorPresentation {
  if (getKeyResourcePresentationPolicy(siteType).editor === editorKinds.Dahl) {
    return getDahlKeyResourceEditorPresentation(mode, options?.fields)
  }
  if (
    getKeyResourcePresentationPolicy(siteType).editor === editorKinds.OpenRouter
  ) {
    return getOpenRouterKeyResourceEditorPresentation(mode)
  }

  const { fields, automaticName, requireFreshOptions } = resolveSiteFields(
    siteType,
    mode,
    options?.fields,
  )

  return {
    automaticName,
    requireFreshOptions,
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
