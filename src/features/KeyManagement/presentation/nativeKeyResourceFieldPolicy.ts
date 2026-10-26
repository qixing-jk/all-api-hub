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
import { ACCOUNT_KEY_RESOURCE_EDIT_ACTIONS as editActions } from "~/services/apiAdapters/contracts/accountKeyResource"
import type { AccountKeyResourceEditAction } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  RESOURCE_FIELD_TYPES,
  type EditableResourceProjection,
  type ResourceFieldDescriptor,
} from "~/services/apiAdapters/contracts/resourceNative"
import { DAYA_KEY_EDITOR_FIELDS as dayaFields } from "~/services/apiAdapters/daya/keyResourceFields"
import {
  EMRANK_EXPIRATION_MODES,
  emrankKeyFields,
} from "~/services/apiAdapters/emrank/keyResourceFields"
import { FOXCODE_KEY_EDITOR_FIELDS as foxCodeFields } from "~/services/apiAdapters/foxcode/keyEditorFields"
import { krillKeyFields } from "~/services/apiAdapters/krill/keyResourceFields"
import { PMAPI_KEY_EDITOR_FIELDS as pmFields } from "~/services/apiAdapters/pmapi/keyResourceFields"
import { RELAYFOR_KEY_FIELDS as relayForFields } from "~/services/apiAdapters/relayfor/keyFields"
import { REQUESTY_KEY_FIELDS as requestyFields } from "~/services/apiAdapters/requesty/keys/keyResourceFields"

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
const expiryField = (fieldId = "expires_at"): ResourceFieldPresentation => ({
  fieldId,
  section: "lifecycle",
  order: 0,
  renderer: "date-time",
  resolveLabel: (t) => t("keyManagement:dialog.expiration"),
  resolveHelp: (t) => t("keyManagement:dialog.expirationPlaceholder"),
  issueLabelResolvers: issues,
})
const expiry = expiryField()
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

const buildRequestyFields = (
  mode: AccountKeyResourceEditorMode,
): {
  fields: ResourceFieldPresentation[]
  automaticName: EditorPresentation["automaticName"]
} => ({
  automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed },
  fields: [
    // Requesty has no name-update endpoint, so the name is create-only.
    ...(mode === editorModes.Create
      ? ([
          name,
          {
            fieldId: requestyFields.ManagePermission,
            section: "advanced",
            order: 10,
            renderer: "boolean",
            resolveLabel: (t: TFunction) =>
              t("keyManagement:native.editor.requestyManagePermission"),
            resolveHelp: (t: TFunction) =>
              t("keyManagement:native.editor.requestyManagePermissionHelp"),
            issueLabelResolvers: issues,
          },
        ] as ResourceFieldPresentation[])
      : []),
    {
      fieldId: requestyFields.MonthlyLimit,
      section: "spending",
      order: 10,
      renderer: "number",
      resolveLabel: (t) =>
        t("keyManagement:native.editor.requestyMonthlyLimit"),
      resolvePlaceholder: (t) =>
        t("keyManagement:native.editor.requestyMonthlyLimitPlaceholder"),
      issueLabelResolvers: issues,
    },
    ...(mode === editorModes.Edit
      ? [expiryField(requestyFields.ExpiresAt)]
      : []),
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

const buildRelayForFields = (): {
  fields: ResourceFieldPresentation[]
  automaticName: EditorPresentation["automaticName"]
} => ({
  automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed },
  fields: [
    name,
    ...(
      [
        [
          relayForFields.Budget5h,
          (t: TFunction) => t("keyManagement:native.editor.budget5h"),
        ],
        [
          relayForFields.BudgetDay,
          (t: TFunction) => t("keyManagement:native.editor.budgetDay"),
        ],
        [
          relayForFields.BudgetWeek,
          (t: TFunction) => t("keyManagement:native.editor.budgetWeek"),
        ],
        [
          relayForFields.BudgetMonth,
          (t: TFunction) => t("keyManagement:native.editor.budgetMonth"),
        ],
        [
          relayForFields.RequestsPerMinute,
          (t: TFunction) => t("keyManagement:native.editor.keyRpm"),
        ],
        [
          relayForFields.ConcurrentRequests,
          (t: TFunction) => t("keyManagement:native.editor.keyConcurrency"),
        ],
      ] as const
    ).map(([fieldId, resolveLabel], order) => ({
      fieldId,
      resolveLabel,
      section: "limits",
      width: "half" as const,
      order,
      renderer: "number" as const,
      resolveHelp: (t: TFunction) =>
        fieldId === relayForFields.Budget5h
          ? t("keyManagement:native.editor.budgetResetHelp")
          : fieldId.startsWith("budget_")
            ? ""
            : t("keyManagement:native.editor.keyRateHelp"),
      issueLabelResolvers: issues,
    })),
    {
      ...quota(relayForFields.QuotaUsd, relayForFields.UnlimitedQuota)[0]!,
      section: "basic",
      order: 10,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.keyUnlimitedQuota"),
      resolveHelp: (t: TFunction) =>
        t("keyManagement:native.editor.keyUnlimitedQuotaHelp"),
    },
    {
      ...quota(relayForFields.QuotaUsd, relayForFields.UnlimitedQuota)[1]!,
      section: "basic",
      order: 20,
      width: "half",
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.independentQuotaUsd"),
      resolveHelp: (t: TFunction) =>
        t("keyManagement:native.editor.followAccountQuotaHelp"),
    },
    {
      ...expiryField(relayForFields.ExpiredAt),
      section: "basic",
      order: 30,
      width: "half",
    },
    {
      fieldId: relayForFields.ModelLimits,
      width: "half",
      rows: 2,
      section: "advanced" as const,
      order: 10,
      renderer: "textarea" as const,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.modelAllowlist"),
      resolveHelp: (t: TFunction) =>
        t("keyManagement:native.editor.allowlistHelp"),
      issueLabelResolvers: issues,
    },
    {
      ...ips(relayForFields.IpLimits),
      width: "half",
      rows: 2,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.ipCidrAllowlist"),
      resolveHelp: (t: TFunction) =>
        t("keyManagement:native.editor.allowlistHelp"),
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

const buildEmRankFields = (mode: AccountKeyResourceEditorMode) => ({
  automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
  // Create has no enabled descriptor; presenting it crashes the dialog.
  fields: [
    name,
    {
      fieldId: emrankKeyFields.Unlimited,
      section: "spending" as const,
      order: 0,
      renderer: RESOURCE_FIELD_TYPES.Boolean,
      resolveLabel: (t: TFunction) => t("keyManagement:dialog.unlimitedQuota"),
      issueLabelResolvers: issues,
    },
    {
      fieldId: emrankKeyFields.Quota,
      section: "spending" as const,
      order: 10,
      renderer: RESOURCE_FIELD_TYPES.Number,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.emrank.quotaMToken"),
      resolveHelp: (t: TFunction) =>
        t("keyManagement:native.editor.emrank.quotaHelp"),
      visibleWhen: (values: EditableResourceProjection) =>
        values[emrankKeyFields.Unlimited] !== true,
      issueLabelResolvers: issues,
    },
    {
      fieldId: emrankKeyFields.ExpirationMode,
      section: "lifecycle" as const,
      order: 0,
      renderer: RESOURCE_FIELD_TYPES.Select,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.emrank.expiration"),
      optionLabelResolvers: {
        [EMRANK_EXPIRATION_MODES.Keep]: (t: TFunction) =>
          t("keyManagement:native.editor.emrank.expirationOptions.keep"),
        [EMRANK_EXPIRATION_MODES.Never]: (t: TFunction) =>
          t("keyManagement:native.editor.emrank.expirationOptions.never"),
        [EMRANK_EXPIRATION_MODES.Month]: (t: TFunction) =>
          t("keyManagement:native.editor.emrank.expirationOptions.month"),
        [EMRANK_EXPIRATION_MODES.Day]: (t: TFunction) =>
          t("keyManagement:native.editor.emrank.expirationOptions.day"),
        [EMRANK_EXPIRATION_MODES.Hour]: (t: TFunction) =>
          t("keyManagement:native.editor.emrank.expirationOptions.hour"),
        [EMRANK_EXPIRATION_MODES.Custom]: (t: TFunction) =>
          t("keyManagement:native.editor.emrank.expirationOptions.custom"),
      },
      issueLabelResolvers: issues,
    },
    {
      ...expiry,
      fieldId: emrankKeyFields.ExpiresAt,
      visibleWhen: (values: EditableResourceProjection) =>
        values[emrankKeyFields.ExpirationMode] ===
        EMRANK_EXPIRATION_MODES.Custom,
    },
    ...(mode === editorModes.Edit ? [enabled(emrankKeyFields.Enabled)] : []),
  ],
})

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
    [editorKinds.RelayFor]: () => buildRelayForFields(),
    [editorKinds.Requesty]: () => buildRequestyFields(mode),
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
    [editorKinds.Emrank]: () => buildEmRankFields(mode),
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
    // Daya group order controls routing; window budgets are native USD limits.
    [editorKinds.Daya]: (): {
      fields: ResourceFieldPresentation[]
      requireFreshOptions: boolean
      automaticName: EditorPresentation["automaticName"]
    } => ({
      requireFreshOptions: true,
      automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
      fields: [
        name,
        {
          ...group(dayaFields.Groups, true),
          ordered: true,
          multiSelectLayout: "cards",
          resolveHelp: (t: TFunction) =>
            t("keyManagement:native.editor.daya.groupOrderHelp"),
        },
        {
          fieldId: dayaFields.AllowFast,
          section: "spending",
          order: 10,
          renderer: "boolean",
          resolveLabel: (t: TFunction) =>
            t("keyManagement:native.editor.daya.allowFast"),
          resolveHelp: (t: TFunction) =>
            t("keyManagement:native.editor.daya.allowFastHelp"),
          issueLabelResolvers: issues,
        },
        ...(mode === editorModes.Create
          ? ([
              {
                fieldId: dayaFields.CustomKey,
                section: "advanced",
                order: 0,
                renderer: "secret",
                resolveLabel: (t: TFunction) =>
                  t("keyManagement:native.editor.daya.customKey"),
                resolveHelp: (t: TFunction) =>
                  t("keyManagement:native.editor.daya.customKeyHelp"),
                issueLabelResolvers: issues,
              },
            ] satisfies ResourceFieldPresentation[])
          : []),
        {
          ...ips(dayaFields.IpWhitelist),
          rows: 3,
          resolveLabel: (t: TFunction) =>
            t("keyManagement:native.editor.daya.ipWhitelist"),
          resolveHelp: (t: TFunction) =>
            t("keyManagement:native.editor.allowlistHelp"),
        },
        {
          ...ips(dayaFields.IpBlacklist),
          order: 21,
          rows: 3,
          resolveLabel: (t: TFunction) =>
            t("keyManagement:native.editor.daya.ipBlacklist"),
          resolveHelp: (t: TFunction) =>
            t("keyManagement:native.editor.allowlistHelp"),
        },
        {
          fieldId: dayaFields.RateLimit5h,
          section: "spending",
          order: 20,
          renderer: "number",
          resolveLabel: (t: TFunction) =>
            t("keyManagement:native.editor.budget5h"),
          resolveHelp: (t: TFunction) =>
            t("keyManagement:native.editor.daya.budgetHelp"),
          issueLabelResolvers: issues,
        },
        {
          fieldId: dayaFields.RateLimit1d,
          section: "spending",
          order: 21,
          renderer: "number",
          resolveLabel: (t: TFunction) =>
            t("keyManagement:native.editor.budgetDay"),
          issueLabelResolvers: issues,
        },
        {
          fieldId: dayaFields.RateLimit7d,
          section: "spending",
          order: 22,
          renderer: "number",
          resolveLabel: (t: TFunction) =>
            t("keyManagement:native.editor.daya.budget7d"),
          issueLabelResolvers: issues,
        },
        ...quota(dayaFields.Quota, dayaFields.Unlimited, true),
        ...(mode === editorModes.Edit
          ? ([
              { ...enabled(dayaFields.Enabled), section: "basic", order: 30 },
            ] satisfies ResourceFieldPresentation[])
          : []),
        {
          fieldId:
            mode === editorModes.Edit
              ? dayaFields.ExpiresAt
              : dayaFields.ExpiresInDays,
          section: "lifecycle",
          order: 0,
          renderer: mode === editorModes.Edit ? "date-time" : "number",
          resolveLabel: (t: TFunction) =>
            mode === editorModes.Edit
              ? t("keyManagement:dialog.expiration")
              : t("keyManagement:native.editor.expiryDays"),
          resolveHelp: (t: TFunction) =>
            mode === editorModes.Edit
              ? t("keyManagement:dialog.expirationPlaceholder")
              : "",
          issueLabelResolvers: issues,
        },
      ],
    }),
    // PM-API tokens cap spending in the console quota unit; the group follows
    // the account when unset, and the model whitelist/IP limits restrict use.
    [editorKinds.Pmapi]: (): {
      fields: ResourceFieldPresentation[]
      requireFreshOptions: boolean
      automaticName: EditorPresentation["automaticName"]
    } => ({
      requireFreshOptions: true,
      automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
      fields: [
        name,
        group(pmFields.Group, false, true),
        ...quota(pmFields.Quota, pmFields.Unlimited, true),
        {
          fieldId: pmFields.Rpm,
          section: "spending",
          order: 20,
          renderer: "number",
          resolveLabel: (t: TFunction) =>
            t("keyManagement:native.editor.pmapi.rpm"),
          resolveHelp: (t: TFunction) =>
            t("keyManagement:native.editor.pmapi.rpmHelp"),
          issueLabelResolvers: issues,
        },
        expiryField(pmFields.ExpiresAt),
        // Lifecycle is a row action (rotate / enable / disable); the dialog
        // mirrors the console edit form, which never carries a status field.
        models(pmFields.Models),
        ips(pmFields.Subnet),
      ],
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
  options?: {
    readonly fields?: readonly ResourceFieldDescriptor[]
    readonly action?: AccountKeyResourceEditAction
  },
): EditorPresentation {
  const action = options?.action
  if (
    action === editActions.Rotate ||
    action === editActions.Enable ||
    action === editActions.Disable
  ) {
    const labels = {
      [editActions.Rotate]: (t: TFunction) =>
        t("keyManagement:native.actions.rotate"),
      [editActions.Enable]: (t: TFunction) =>
        t("keyManagement:native.actions.enable"),
      [editActions.Disable]: (t: TFunction) =>
        t("keyManagement:native.actions.disable"),
    }
    const descriptions = {
      [editActions.Rotate]: (t: TFunction) =>
        t("keyManagement:native.lifecycle.rotateDescription"),
      [editActions.Enable]: (t: TFunction) =>
        t("keyManagement:native.lifecycle.enableDescription"),
      [editActions.Disable]: (t: TFunction) =>
        t("keyManagement:native.lifecycle.disableDescription"),
    }
    return {
      automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed },
      policy: defineResourceEditorFieldPolicy({ fields: [], hiddenFields: [] }),
      sectionOrder: {},
      sectionLabelResolvers: {},
      title: labels[action],
      submitLabel: labels[action],
      summary: {
        title: labels[action],
        describe: (_values, t) => descriptions[action](t),
      },
    }
  }
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
    policy: defineResourceEditorFieldPolicy({
      fields,
      hiddenFields: [],
      ...(getKeyResourcePresentationPolicy(siteType).editor ===
      editorKinds.RelayFor
        ? {
            sections: {
              basic: { columns: 2 as const, defaultOpen: true },
              limits: { columns: 2 as const, defaultOpen: false },
              advanced: { columns: 2 as const, defaultOpen: true },
            },
          }
        : getKeyResourcePresentationPolicy(siteType).editor === editorKinds.Daya
          ? {
              sections: {
                basic: { defaultOpen: true },
                spending: { defaultOpen: true },
                lifecycle: { defaultOpen: true },
                advanced: {
                  defaultOpen: false,
                  resolveSummary: (t, values) => {
                    const customKey = values[dayaFields.CustomKey]
                    return [
                      typeof values[dayaFields.IpWhitelist] === "string" &&
                        String(values[dayaFields.IpWhitelist]).trim() &&
                        t("keyManagement:native.editor.daya.ipWhitelist"),
                      typeof values[dayaFields.IpBlacklist] === "string" &&
                        String(values[dayaFields.IpBlacklist]).trim() &&
                        t("keyManagement:native.editor.daya.ipBlacklist"),
                      customKey &&
                        typeof customKey === "object" &&
                        "kind" in customKey &&
                        customKey.kind === "replace" &&
                        t("keyManagement:native.editor.daya.customKey"),
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  },
                },
              },
            }
          : {}),
    }),
    sectionOrder: {
      basic: 0,
      spending: 1,
      lifecycle: 2,
      limits: 3,
      advanced: 4,
    },
    sectionLabelResolvers: {
      limits: (t) => t("keyManagement:native.editor.budgetsAndLimits"),
      basic: (t) => t("keyManagement:dialog.basicInfo"),
      spending: (t) => t("keyManagement:dialog.quotaSettings"),
      lifecycle: (t) => t("keyManagement:dialog.expiration"),
      advanced: (t) => t("keyManagement:dialog.advancedSettings"),
    },
  }
}
