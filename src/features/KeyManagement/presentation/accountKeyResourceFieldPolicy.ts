import type { TFunction } from "i18next"

import {
  defineResourceEditorFieldPolicy,
  resolveResourceFieldPolicy,
  type ResourceEditorFieldPolicy,
} from "~/features/ResourceEditor/resourceFieldPolicy"
import type {
  EditableResourceProjection,
  ResourceFieldDescriptor,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  OPENROUTER_KEY_FIELD_IDS,
  OPENROUTER_KEY_LIMIT_MODES,
  OPENROUTER_KEY_LIMIT_RESETS,
} from "~/services/apiAdapters/openrouter/keyResourceFields"

type OpenRouterKeyEditorSection =
  | "basic"
  | "spending"
  | "lifecycle"
  | "advanced"

export type OpenRouterKeyEditorMode = "create" | "edit"

const field = OPENROUTER_KEY_FIELD_IDS

export const OPENROUTER_KEY_EDITOR_SECTION_ORDER: Readonly<
  Record<OpenRouterKeyEditorSection, number>
> = {
  basic: 0,
  spending: 1,
  lifecycle: 2,
  advanced: 3,
}

export const OPENROUTER_KEY_EDITOR_SECTION_LABEL_RESOLVERS: Readonly<
  Record<OpenRouterKeyEditorSection, (t: TFunction) => string>
> = {
  basic: (t) => t("keyManagement:openRouter.editor.sections.basic"),
  spending: (t) => t("keyManagement:openRouter.editor.sections.spending"),
  lifecycle: (t) => t("keyManagement:openRouter.editor.sections.lifecycle"),
  advanced: (t) => t("keyManagement:openRouter.editor.sections.advanced"),
}

const optionIssues = {
  required: (t: TFunction) =>
    t("keyManagement:openRouter.editor.issues.required"),
  invalid_value: (t: TFunction) =>
    t("keyManagement:openRouter.editor.issues.invalidValue"),
  out_of_range: (t: TFunction) =>
    t("keyManagement:openRouter.editor.issues.outOfRange"),
  unsupported_option: (t: TFunction) =>
    t("keyManagement:openRouter.editor.issues.unsupportedOption"),
  inconsistent_value: (t: TFunction) =>
    t("keyManagement:openRouter.editor.issues.inconsistentValue"),
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

/** Validates the adapter descriptors against the OpenRouter presentation policy. */
export const resolveOpenRouterKeyResourceFieldPolicy = (
  descriptors: readonly ResourceFieldDescriptor[],
  mode: OpenRouterKeyEditorMode,
) =>
  resolveResourceFieldPolicy(
    descriptors,
    getOpenRouterKeyResourceFieldPolicy(mode),
    OPENROUTER_KEY_EDITOR_SECTION_ORDER,
  )
