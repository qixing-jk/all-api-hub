import type { TFunction } from "i18next"

import {
  DONE_HUB_MANAGED_RESOURCE_FIELD_IDS,
  DoneHubChannelStatus,
  DoneHubChannelTypeNames,
  isDoneHubAdvancedFieldApplicable,
} from "~/constants/doneHub"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { type EditableResourceProjection } from "~/services/apiAdapters/contracts/managedResourceNative"

import {
  createNewApiFamilyFields,
  createStatusOptionLabelResolvers,
  defineManagedResourceFieldPolicy,
  MANAGED_RESOURCE_EDITOR_MODES,
  MANAGED_RESOURCE_FIELD_RENDERERS,
  MANAGED_RESOURCE_SECTIONS,
  requireFieldValuePresentation,
  type ManagedResourceEditorFieldPolicy,
  type ManagedResourceFieldPresentation,
  type ManagedResourceSection,
  type ManagedResourceTextResolver,
} from "../managedResourceFieldPresentation"
import {
  NATIVE_TABLE_COLUMN_LAYOUTS,
  type ManagedSitePresentationDefinition,
} from "../managedResourceTablePresentation"

const doneHubTypeOptionLabelResolvers = Object.fromEntries(
  Object.entries(DoneHubChannelTypeNames).map(([value, label]) => [
    value,
    () => label,
  ]),
) satisfies Readonly<Record<string, ManagedResourceTextResolver>>

const doneHubFields: readonly ManagedResourceFieldPresentation[] = [
  ...createNewApiFamilyFields(
    DONE_HUB_MANAGED_RESOURCE_FIELD_IDS,
    doneHubTypeOptionLabelResolvers,
    createStatusOptionLabelResolvers(DoneHubChannelStatus),
  ).map((field) =>
    field.section === MANAGED_RESOURCE_SECTIONS.Connection
      ? {
          ...field,
          section: MANAGED_RESOURCE_SECTIONS.Basic,
          order: field.order + 30,
        }
      : {
          ...field,
          ...((
            [
              DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Type,
              DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Status,
              DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Priority,
              DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Weight,
            ] as string[]
          ).includes(field.fieldId) && { width: "half" as const }),
        },
  ),
  {
    fieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.CompatibleResponse,
    section: MANAGED_RESOURCE_SECTIONS.Compatibility,
    order: 10,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Boolean,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.doneHub.compatibleResponse.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.doneHub.compatibleResponse.help"),
  },
  {
    fieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.ResponsesPath,
    section: MANAGED_RESOURCE_SECTIONS.Compatibility,
    order: 20,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.doneHub.responsesPath.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.doneHub.responsesPath.help"),
    resolvePlaceholder: (t) =>
      t("managedSiteChannels:editor.doneHub.responsesPath.placeholder"),
    visibleWhen: (values) =>
      isDoneHubAdvancedFieldApplicable(
        DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.ResponsesPath,
        Number(values[DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Type]),
      ),
  },
  {
    fieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.ModelMapping,
    section: MANAGED_RESOURCE_SECTIONS.Models,
    order: 30,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Textarea,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.doneHub.modelMapping.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.doneHub.modelMapping.help"),
    resolvePlaceholder: (t) =>
      t("managedSiteChannels:editor.doneHub.modelMapping.placeholder"),
    visibleWhen: (values) =>
      isDoneHubAdvancedFieldApplicable(
        DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.ModelMapping,
        Number(values[DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Type]),
      ),
    advancedControl: "string-map",
    mapKeysTargetFieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Models,
    issueLabelResolvers: {
      invalid_value: (t) =>
        t("managedSiteChannels:editor.doneHub.modelMapping.invalid"),
    },
  },
  {
    fieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.TestModel,
    section: MANAGED_RESOURCE_SECTIONS.Models,
    order: 40,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.doneHub.testModel.label"),
    resolveHelp: (t) => t("managedSiteChannels:editor.doneHub.testModel.help"),
    resolvePlaceholder: (t) =>
      t("managedSiteChannels:editor.doneHub.testModel.placeholder"),
    visibleWhen: (values) =>
      isDoneHubAdvancedFieldApplicable(
        DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.TestModel,
        Number(values[DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Type]),
      ),
    advancedControl: "model-input",
    suggestionSourceFieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Models,
    issueLabelResolvers: {
      invalid_value: (t) =>
        t("managedSiteChannels:editor.doneHub.testModel.invalid"),
    },
  },
  {
    fieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.DisabledStream,
    section: MANAGED_RESOURCE_SECTIONS.Models,
    order: 50,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.MultiSelect,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.doneHub.disabledStream.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.doneHub.disabledStream.help"),
    advancedControl: "model-list",
    suggestionSourceFieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Models,
  },
  {
    fieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Proxy,
    section: MANAGED_RESOURCE_SECTIONS.Requests,
    order: 60,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    resolveLabel: (t) => t("managedSiteChannels:editor.doneHub.proxy.label"),
    resolveHelp: (t) => t("managedSiteChannels:editor.doneHub.proxy.help"),
    resolvePlaceholder: (t) =>
      t("managedSiteChannels:editor.doneHub.proxy.placeholder"),
    issueLabelResolvers: {
      invalid_value: (t) =>
        t("managedSiteChannels:editor.doneHub.proxy.invalid"),
    },
  },
  {
    fieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.ModelHeaders,
    section: MANAGED_RESOURCE_SECTIONS.Requests,
    order: 70,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Textarea,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.doneHub.modelHeaders.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.doneHub.modelHeaders.help"),
    resolvePlaceholder: (t) =>
      t("managedSiteChannels:editor.doneHub.modelHeaders.placeholder"),
    advancedControl: "string-map",
    issueLabelResolvers: {
      invalid_value: (t) =>
        t("managedSiteChannels:editor.doneHub.modelHeaders.invalid"),
    },
  },
  {
    fieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.AllowExtraBody,
    section: MANAGED_RESOURCE_SECTIONS.Requests,
    order: 80,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Boolean,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.doneHub.allowExtraBody.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.doneHub.allowExtraBody.help"),
  },
  {
    fieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.CustomParameter,
    section: MANAGED_RESOURCE_SECTIONS.Requests,
    order: 90,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Textarea,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.doneHub.customParameter.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.doneHub.customParameter.help"),
    resolvePlaceholder: (t) =>
      t("managedSiteChannels:editor.doneHub.customParameter.placeholder"),
    advancedControl: "json",
    issueLabelResolvers: {
      invalid_value: (t) =>
        t("managedSiteChannels:editor.doneHub.customParameter.invalid"),
    },
  },
]

const doneHubSectionSummary =
  (section: ManagedResourceSection) =>
  (t: TFunction, values: EditableResourceProjection) => {
    const labels = doneHubFields
      .filter((field) => {
        if (field.section !== section || !(field.visibleWhen?.(values) ?? true))
          return false
        const value = values[field.fieldId]
        return Array.isArray(value)
          ? value.length > 0
          : typeof value === "string"
            ? !["", "{}"].includes(value.trim())
            : value === true
      })
      .map((field) => field.resolveLabel(t))
    return labels.length ? labels.join(" · ") : t("ui:resourceEditor.optional")
  }

const doneHubSections = {
  basic: {
    columns: 2,
    defaultOpen: true,
    resolveLabel: (t: TFunction) =>
      t("managedSiteChannels:editor.sections.basicConnection"),
  },
  models: {
    defaultOpen: true,
    resolveSummary: doneHubSectionSummary(MANAGED_RESOURCE_SECTIONS.Models),
  },
  routing: { columns: 2 },
  compatibility: {
    resolveSummary: doneHubSectionSummary(
      MANAGED_RESOURCE_SECTIONS.Compatibility,
    ),
  },
  requests: {
    resolveSummary: doneHubSectionSummary(MANAGED_RESOURCE_SECTIONS.Requests),
  },
} satisfies ManagedResourceEditorFieldPolicy["sections"]

const doneHubManagedResourceFieldPolicy = defineManagedResourceFieldPolicy({
  siteType: SITE_TYPES.DONE_HUB,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  modes: {
    [MANAGED_RESOURCE_EDITOR_MODES.Create]: {
      fields: doneHubFields,
      sections: doneHubSections,
      hiddenFields: [],
    },
    [MANAGED_RESOURCE_EDITOR_MODES.Edit]: {
      fields: doneHubFields,
      sections: doneHubSections,
      hiddenFields: [],
    },
  },
})

export const doneHubPresentation = {
  siteType: doneHubManagedResourceFieldPolicy.siteType,
  fieldPolicies: [doneHubManagedResourceFieldPolicy],
  table: {
    semantics: {
      baseUrlFieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      statusFieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Status,
      fieldValuePresentations: {
        [DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Type]:
          requireFieldValuePresentation(
            doneHubManagedResourceFieldPolicy,
            DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Type,
          ),
      },
      detailFieldLabels: {
        [DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.StatusReason]: (t) =>
          t("managedSiteChannels:editor.fields.channelStatusReason.label"),
      },
    },
    defaultSorting: [
      { id: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Id, desc: true },
    ],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.NumericChannel,
    numericChannelFieldIds: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS,
    supportsNumericChannelDeepLink: true,
  },
} satisfies ManagedSitePresentationDefinition
