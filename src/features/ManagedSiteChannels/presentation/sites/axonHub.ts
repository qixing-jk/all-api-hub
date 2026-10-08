import type { TFunction } from "i18next"

import {
  AXON_HUB_CHANNEL_FIELD_IDS,
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
  isAxonHubModelAutoSyncSupported,
} from "~/constants/axonHub"
import { SITE_TYPES } from "~/constants/siteType"
import {
  defineManagedResourceFieldPolicy,
  MANAGED_RESOURCE_CHANNEL_FIELD_ROLES,
  MANAGED_RESOURCE_EDITOR_MODES,
  MANAGED_RESOURCE_FIELD_RENDERERS,
  MANAGED_RESOURCE_SECTIONS,
  managedResourceStatusFallbackLabelResolver,
  requireFieldValuePresentation,
  resolveUnsupportedResourceType,
  type ManagedResourceFieldPresentation,
} from "~/features/ManagedSiteChannels/editor/managedResourceFieldPresentation"
import {
  NATIVE_TABLE_COLUMN_LAYOUTS,
  type ManagedSitePresentationDefinition,
} from "~/features/ManagedSiteChannels/table/managedResourceTablePresentation"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { MANAGED_RESOURCE_STATUSES } from "~/services/apiAdapters/contracts/managedResourceNative"

import { MANAGED_CHANNELS_COLUMN_IDS } from "../contracts"

const axonHubChannelTypeOptionLabelResolvers = {
  [AXON_HUB_CHANNEL_TYPE.OPENAI]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.openai"),
  [AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.openaiResponses"),
  [AXON_HUB_CHANNEL_TYPE.ANTHROPIC]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.anthropic"),
  [AXON_HUB_CHANNEL_TYPE.ANTHROPIC_AWS]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.anthropicAws"),
  [AXON_HUB_CHANNEL_TYPE.ANTHROPIC_GCP]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.anthropicGcp"),
  [AXON_HUB_CHANNEL_TYPE.GEMINI_OPENAI]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.geminiOpenai"),
  [AXON_HUB_CHANNEL_TYPE.GEMINI]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.gemini"),
  [AXON_HUB_CHANNEL_TYPE.GEMINI_VERTEX]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.geminiVertex"),
  [AXON_HUB_CHANNEL_TYPE.DEEPSEEK]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.deepseek"),
  [AXON_HUB_CHANNEL_TYPE.DEEPSEEK_ANTHROPIC]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.deepseekAnthropic"),
  [AXON_HUB_CHANNEL_TYPE.OPENROUTER]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.openrouter"),
  [AXON_HUB_CHANNEL_TYPE.XAI]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.xai"),
  [AXON_HUB_CHANNEL_TYPE.SILICONFLOW]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.siliconflow"),
  [AXON_HUB_CHANNEL_TYPE.VOLCENGINE]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.volcengine"),
  [AXON_HUB_CHANNEL_TYPE.GITHUB_COPILOT]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.githubCopilot"),
  [AXON_HUB_CHANNEL_TYPE.CLAUDECODE]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.claudeCode"),
  [AXON_HUB_CHANNEL_TYPE.NANOGPT]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.nanogpt"),
  [AXON_HUB_CHANNEL_TYPE.OLLAMA]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.ollama"),
} as const

const axonHubStatusOptionLabelResolvers = {
  [AXON_HUB_CHANNEL_STATUS.ENABLED]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.status.enabled"),
  [AXON_HUB_CHANNEL_STATUS.DISABLED]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.status.disabled"),
  [AXON_HUB_CHANNEL_STATUS.ARCHIVED]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.status.archived"),
  [MANAGED_RESOURCE_STATUSES.AutoDisabled]: (t: TFunction) =>
    t("managedSiteChannels:statusLabels.autoDisabled"),
} as const

const axonHubFields = [
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.NAME,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.name.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Name,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 20,
    resolveLabel: (t) => t("channelDialog:fields.type.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Select,
    optionLabelResolvers: axonHubChannelTypeOptionLabelResolvers,
    resolveOptionFallback: resolveUnsupportedResourceType,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Type,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.STATUS,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 30,
    resolveLabel: (t) => t("channelDialog:fields.status.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Select,
    optionLabelResolvers: axonHubStatusOptionLabelResolvers,
    resolveOptionFallback: managedResourceStatusFallbackLabelResolver,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Status,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL,
    section: MANAGED_RESOURCE_SECTIONS.Connection,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.baseUrl.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.BaseUrl,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
    section: MANAGED_RESOURCE_SECTIONS.Connection,
    order: 20,
    resolveLabel: (t) => t("channelDialog:fields.key.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Secret,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Secret,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
    section: MANAGED_RESOURCE_SECTIONS.Models,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.models.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.supportedModels.help"),
    customValuesMirrorFieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.MultiSelect,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Models,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
    section: MANAGED_RESOURCE_SECTIONS.Models,
    order: 30,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.defaultTestModel.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.defaultTestModel.help"),
    resolvePlaceholder: (t) =>
      t("managedSiteChannels:editor.fields.defaultTestModel.placeholder"),
    optionSourceFieldIds: [AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS],
    autoSelectFirstOption: true,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Select,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
    section: MANAGED_RESOURCE_SECTIONS.Sync,
    order: 10,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.autoSyncSupportedModels.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.autoSyncSupportedModels.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Boolean,
    visibleWhen: (values) =>
      isAxonHubModelAutoSyncSupported(values[AXON_HUB_CHANNEL_FIELD_IDS.TYPE]),
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
    section: MANAGED_RESOURCE_SECTIONS.Sync,
    order: 20,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.autoSyncModelPattern.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.autoSyncModelPattern.help"),
    resolvePlaceholder: (t) =>
      t("managedSiteChannels:editor.fields.autoSyncModelPattern.placeholder"),
    issueLabelResolvers: {
      invalid_value: (t) =>
        t("managedSiteChannels:editor.fields.autoSyncModelPattern.invalid"),
    },
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    visibleWhen: (values) =>
      isAxonHubModelAutoSyncSupported(
        values[AXON_HUB_CHANNEL_FIELD_IDS.TYPE],
      ) &&
      values[AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS] === true,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
    section: MANAGED_RESOURCE_SECTIONS.Routing,
    order: 10,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.orderingWeight.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.orderingWeight.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Number,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TAGS,
    section: MANAGED_RESOURCE_SECTIONS.Metadata,
    order: 10,
    resolveLabel: (t) => t("managedSiteChannels:editor.fields.tags.label"),
    resolveHelp: (t) => t("managedSiteChannels:editor.fields.tags.help"),
    resolvePlaceholder: (t) =>
      t("managedSiteChannels:editor.fields.tags.placeholder"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.MultiSelect,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.REMARK,
    section: MANAGED_RESOURCE_SECTIONS.Metadata,
    order: 20,
    resolveLabel: (t) => t("managedSiteChannels:editor.fields.remark.label"),
    resolveHelp: (t) => t("managedSiteChannels:editor.fields.remark.help"),
    resolvePlaceholder: (t) =>
      t("managedSiteChannels:editor.fields.remark.placeholder"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Textarea,
    rows: 3,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
    section: MANAGED_RESOURCE_SECTIONS.Advanced,
    order: 10,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.extraModelPrefix.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.extraModelPrefix.help"),
    resolvePlaceholder: (t) =>
      t("managedSiteChannels:editor.fields.extraModelPrefix.placeholder"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
  },
] as const satisfies readonly ManagedResourceFieldPresentation[]

const axonHubManagedResourceFieldPolicy = defineManagedResourceFieldPolicy({
  siteType: SITE_TYPES.AXON_HUB,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  modes: {
    [MANAGED_RESOURCE_EDITOR_MODES.Create]: {
      fields: axonHubFields,
      hiddenFields: [
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
          reason: "read-only",
        },
      ],
    },
    [MANAGED_RESOURCE_EDITOR_MODES.Edit]: {
      fields: axonHubFields.filter(
        ({ fieldId }) =>
          fieldId !== AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
      ),
      hiddenFields: [
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
          reason: "read-only",
        },
      ],
    },
  },
})

export const axonHubPresentation = {
  siteType: axonHubManagedResourceFieldPolicy.siteType,
  fieldPolicies: [axonHubManagedResourceFieldPolicy],
  table: {
    semantics: {
      baseUrlFieldId: AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL,
      statusFieldId: AXON_HUB_CHANNEL_FIELD_IDS.STATUS,
      fieldValuePresentations: {
        [AXON_HUB_CHANNEL_FIELD_IDS.TYPE]: requireFieldValuePresentation(
          axonHubManagedResourceFieldPolicy,
          AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
        ),
      },
      detailFieldLabels: {
        // The manual model list is a read-only mirror of the model selector, so
        // the editor offers no control and this is its only label source.
        [AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS]: (t) =>
          t("managedSiteChannels:editor.fields.manualModels.label"),
      },
    },
    defaultSorting: [{ id: MANAGED_CHANNELS_COLUMN_IDS.Name, desc: false }],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.Canonical,
  },
} satisfies ManagedSitePresentationDefinition
