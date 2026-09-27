import type { TFunction } from "i18next"

import {
  defineResourceEditorFieldPolicy,
  type ResourceEditorFieldPolicy,
} from "~/features/ResourceEditor/resourceFieldPolicy"
import type { EditableResourceProjection } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  OPENROUTER_KEY_FIELD_IDS,
  OPENROUTER_KEY_LIMIT_MODES,
  OPENROUTER_KEY_LIMIT_RESETS,
} from "~/services/apiAdapters/openrouter/keyResourceFields"

import type { AccountKeyResourceEditorPresentation } from "./accountKeyResourceEditorPresentation"

type OpenRouterKeyEditorSection =
  | "basic"
  | "spending"
  | "lifecycle"
  | "advanced"

type OpenRouterKeyEditorMode = "create" | "edit"

const field = OPENROUTER_KEY_FIELD_IDS

export const OPENROUTER_KEY_EDITOR_SECTION_ORDER: Readonly<
  Record<OpenRouterKeyEditorSection, number>
> = {
  basic: 0,
  spending: 1,
  lifecycle: 2,
  advanced: 3,
}

const OPENROUTER_KEY_EDITOR_SECTION_LABEL_RESOLVERS: Readonly<
  Record<OpenRouterKeyEditorSection, (t: TFunction) => string>
> = {
  basic: (t) => t("keyManagement:openRouter.editor.sections.basic"),
  spending: (t) => t("keyManagement:openRouter.editor.sections.spending"),
  lifecycle: (t) => t("keyManagement:openRouter.editor.sections.lifecycle"),
  advanced: (t) => t("keyManagement:openRouter.editor.sections.advanced"),
}

const optionIssues = {
  required: (t: TFunction) => t("keyManagement:native.editor.issues.required"),
  invalid_value: (t: TFunction) =>
    t("keyManagement:native.editor.issues.invalidValue"),
  out_of_range: (t: TFunction) =>
    t("keyManagement:native.editor.issues.outOfRange"),
  unsupported_option: (t: TFunction) =>
    t("keyManagement:native.editor.issues.unsupportedOption"),
  inconsistent_value: (t: TFunction) =>
    t("keyManagement:native.editor.issues.inconsistentValue"),
} as const

const commonFields = [
  {
    fieldId: field.Name,
    section: "basic",
    order: 10,
    renderer: "text",
    resolveLabel: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.name.label"),
    resolveHelp: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.name.help"),
    resolvePlaceholder: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.name.placeholder"),
    issueLabelResolvers: optionIssues,
  },
  {
    fieldId: field.Workspace,
    section: "basic",
    order: 20,
    renderer: "select",
    resolveLabel: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.workspace.label"),
    resolveHelp: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.workspace.help"),
    resolvePlaceholder: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.workspace.placeholder"),
    resolveOptionFallback: (t: TFunction) =>
      t("keyManagement:openRouter.editor.options.workspace.unknown"),
    issueLabelResolvers: optionIssues,
  },
  {
    fieldId: field.Creator,
    section: "basic",
    order: 30,
    renderer: "select",
    resolveLabel: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.creator.label"),
    resolveHelp: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.creator.help"),
    resolvePlaceholder: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.creator.placeholder"),
    resolveNullableOptionLabel: (t: TFunction) =>
      t("keyManagement:openRouter.editor.options.creator.none"),
    resolveOptionFallback: (t: TFunction) =>
      t("keyManagement:openRouter.editor.options.creator.unknown"),
    issueLabelResolvers: optionIssues,
  },
  {
    fieldId: field.LimitMode,
    section: "spending",
    order: 10,
    renderer: "select",
    resolveLabel: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.limitMode.label"),
    optionLabelResolvers: {
      [OPENROUTER_KEY_LIMIT_MODES.Unlimited]: (t: TFunction) =>
        t("keyManagement:openRouter.editor.options.limitMode.unlimited"),
      [OPENROUTER_KEY_LIMIT_MODES.Limited]: (t: TFunction) =>
        t("keyManagement:openRouter.editor.options.limitMode.limited"),
    },
    issueLabelResolvers: optionIssues,
  },
  {
    fieldId: field.Limit,
    section: "spending",
    order: 20,
    renderer: "number",
    resolveLabel: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.limit.label"),
    resolveHelp: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.limit.help"),
    visibleWhen: (values: EditableResourceProjection) =>
      values[field.LimitMode] === OPENROUTER_KEY_LIMIT_MODES.Limited,
    issueLabelResolvers: optionIssues,
  },
  {
    fieldId: field.LimitReset,
    section: "spending",
    order: 30,
    renderer: "select",
    resolveLabel: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.limitReset.label"),
    resolveHelp: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.limitReset.help"),
    visibleWhen: (values: EditableResourceProjection) =>
      values[field.LimitMode] === OPENROUTER_KEY_LIMIT_MODES.Limited,
    optionLabelResolvers: {
      [OPENROUTER_KEY_LIMIT_RESETS.None]: (t: TFunction) =>
        t("keyManagement:openRouter.editor.options.limitReset.none"),
      [OPENROUTER_KEY_LIMIT_RESETS.Daily]: (t: TFunction) =>
        t("keyManagement:openRouter.editor.options.limitReset.daily"),
      [OPENROUTER_KEY_LIMIT_RESETS.Weekly]: (t: TFunction) =>
        t("keyManagement:openRouter.editor.options.limitReset.weekly"),
      [OPENROUTER_KEY_LIMIT_RESETS.Monthly]: (t: TFunction) =>
        t("keyManagement:openRouter.editor.options.limitReset.monthly"),
    },
    issueLabelResolvers: optionIssues,
  },
  {
    fieldId: field.ExpiresAt,
    section: "lifecycle",
    order: 10,
    renderer: "date-time",
    resolveLabel: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.expiresAt.label"),
    resolveHelp: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.expiresAt.help"),
    issueLabelResolvers: optionIssues,
  },
  {
    fieldId: field.IncludeByokInLimit,
    section: "advanced",
    order: 10,
    renderer: "boolean",
    resolveLabel: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.includeByokInLimit.label"),
    resolveHelp: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.includeByokInLimit.help"),
    issueLabelResolvers: optionIssues,
  },
] as const

const editFields = [
  commonFields[0],
  {
    ...commonFields[1],
    resolveHelp: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.workspace.editHelp"),
  },
  {
    ...commonFields[2],
    resolveHelp: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.creator.editHelp"),
  },
  ...commonFields.slice(3, 6),
  {
    ...commonFields[6],
    resolveHelp: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.expiresAt.editHelp"),
  },
  {
    fieldId: field.Disabled,
    section: "lifecycle",
    order: 20,
    renderer: "boolean",
    resolveLabel: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.disabled.label"),
    resolveHelp: (t: TFunction) =>
      t("keyManagement:openRouter.editor.fields.disabled.help"),
    issueLabelResolvers: optionIssues,
  },
  commonFields[7],
] as const

const policies: Readonly<
  Record<
    OpenRouterKeyEditorMode,
    ResourceEditorFieldPolicy<OpenRouterKeyEditorSection>
  >
> = {
  create: defineResourceEditorFieldPolicy({
    fields: commonFields,
    hiddenFields: [],
  }),
  edit: defineResourceEditorFieldPolicy({
    fields: editFields,
    hiddenFields: [],
  }),
}

/** Returns the fixed, frontend-owned presentation policy for OpenRouter key fields. */
export const getOpenRouterKeyResourceFieldPolicy = (
  mode: OpenRouterKeyEditorMode,
) => policies[mode]

const formatLocalDateTime = (value: string, language: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

const semanticSummary = (
  values: EditableResourceProjection,
  t: TFunction,
  language: string,
) => {
  const limit = values[field.Limit]
  const reset = values[field.LimitReset]
  const expiresAt = values[field.ExpiresAt]
  const isLimited =
    values[field.LimitMode] === OPENROUTER_KEY_LIMIT_MODES.Limited
  return [
    isLimited
      ? typeof limit === "number"
        ? t("keyManagement:openRouter.editor.summaryRules.limit", { limit })
        : t("keyManagement:openRouter.editor.summaryRules.limitUnset")
      : t("keyManagement:openRouter.editor.summaryRules.unlimited"),
    ...(isLimited
      ? [
          reset === OPENROUTER_KEY_LIMIT_RESETS.Daily
            ? t("keyManagement:openRouter.editor.summaryRules.reset.daily")
            : reset === OPENROUTER_KEY_LIMIT_RESETS.Weekly
              ? t("keyManagement:openRouter.editor.summaryRules.reset.weekly")
              : reset === OPENROUTER_KEY_LIMIT_RESETS.Monthly
                ? t(
                    "keyManagement:openRouter.editor.summaryRules.reset.monthly",
                  )
                : t("keyManagement:openRouter.editor.summaryRules.reset.none"),
        ]
      : []),
    values[field.IncludeByokInLimit]
      ? t("keyManagement:openRouter.editor.summaryRules.byok.included")
      : t("keyManagement:openRouter.editor.summaryRules.byok.excluded"),
    typeof expiresAt === "string" && expiresAt
      ? t("keyManagement:openRouter.editor.summaryRules.expiresAt", {
          expiresAt: formatLocalDateTime(expiresAt, language),
        })
      : t("keyManagement:openRouter.editor.summaryRules.neverExpires"),
  ].join(" · ")
}

/** OpenRouter workspace membership and BYOK rules stay behind its presentation contract. */
export function getOpenRouterKeyResourceEditorPresentation(
  mode: "create" | "edit",
): AccountKeyResourceEditorPresentation {
  return {
    policy: getOpenRouterKeyResourceFieldPolicy(mode),
    sectionOrder: OPENROUTER_KEY_EDITOR_SECTION_ORDER,
    sectionLabelResolvers: OPENROUTER_KEY_EDITOR_SECTION_LABEL_RESOLVERS,
    requireFreshOptions: true,
    getOptionFeedback(descriptor, options, failure, t) {
      if (descriptor.fieldId !== field.Creator) return {}
      // OpenRouter creator assignment is optional for organization-owned keys:
      // https://github.com/OpenRouterTeam/docs/blob/main/openapi/openapi.yaml
      if (descriptor.nullable && failure?.code === "permission_denied")
        return {
          ignoreFailure: true,
          emptyMessage: t(
            "keyManagement:openRouter.editor.options.creator.unavailable",
          ),
        }
      return options?.length === 0
        ? {
            emptyMessage: t(
              "keyManagement:openRouter.editor.options.creator.empty",
            ),
          }
        : {}
    },
    summary: {
      title: (t) => t("keyManagement:openRouter.editor.summary"),
      describe: semanticSummary,
    },
    collapsibleSection: {
      id: "advanced",
      initiallyOpen: (values) => Boolean(values[field.IncludeByokInLimit]),
    },
  }
}
