import { SITE_TYPES } from "~/constants/siteType"
import {
  defineManagedResourceFieldPolicy,
  nativeChannelStatusOptionLabelResolvers,
  MANAGED_RESOURCE_FIELD_RENDERERS as Renderers,
  MANAGED_RESOURCE_CHANNEL_FIELD_ROLES as Roles,
  MANAGED_RESOURCE_SECTIONS as Sections,
  type ManagedResourceFieldPresentation,
} from "~/features/ManagedSiteChannels/editor/managedResourceFieldPresentation"
import { MANAGED_CHANNELS_COLUMN_IDS } from "~/features/ManagedSiteChannels/presentation/contracts"
import {
  NATIVE_TABLE_COLUMN_LAYOUTS,
  type ManagedSitePresentationDefinition,
} from "~/features/ManagedSiteChannels/table/managedResourceTablePresentation"
import { normalizeSecretMaskForDisplay } from "~/utils/core/formatters"

const fields: readonly ManagedResourceFieldPresentation[] = [
  {
    fieldId: "name",
    width: "half",
    section: Sections.Basic,
    order: 10,
    renderer: Renderers.Text,
    resolveLabel: (t) => t("channelDialog:fields.name.label"),
    channelFieldRole: Roles.Name,
  },
  {
    fieldId: "status",
    width: "half",
    section: Sections.Basic,
    order: 20,
    renderer: Renderers.Select,
    resolveLabel: (t) => t("channelDialog:fields.status.label"),
    channelFieldRole: Roles.Status,
    optionLabelResolvers: nativeChannelStatusOptionLabelResolvers,
  },
  {
    fieldId: "baseAPI",
    section: Sections.Basic,
    order: 25,
    renderer: Renderers.Select,
    selectLayout: "cards",
    resolveLabel: (t) => t("managedSiteChannels:magpieProtocols.type"),
    resolveHelp: (t) => t("managedSiteChannels:magpieProtocols.help"),
    optionLabelResolvers: {
      chat: () => "OpenAI",
      responses: () => "Responses",
      anthropic: () => "Anthropic",
      gemini: () => "Gemini",
    },
    resolveOptionBadge: (t, value, values) => {
      if (!["chat", "responses", "anthropic", "gemini"].includes(value))
        return t("managedSiteChannels:magpieProtocols.unmanaged")
      return typeof values[value] === "string" && values[value].trim()
        ? t("managedSiteChannels:magpieProtocols.configured")
        : undefined
    },
    issueLabelResolvers: {
      inconsistent_value: (t) =>
        t("managedSiteChannels:magpieProtocols.checkOther"),
    },
  },
  {
    fieldId: "chat",
    section: Sections.Basic,
    order: 35,
    visibleWhen: (values) => values.baseAPI === "chat",
    renderer: Renderers.Text,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.magpieChat.label"),
    resolveHelp: (t) => t("managedSiteChannels:editor.fields.magpieChat.help"),
    resolvePlaceholder: () => "https://api.example.com/v1",
    issueLabelResolvers: {
      required: (t) =>
        t("managedSiteChannels:editor.fields.magpieChat.required"),
    },
  },
  {
    fieldId: "responses",
    section: Sections.Basic,
    order: 35,
    visibleWhen: (values) => values.baseAPI === "responses",
    issueLabelResolvers: {
      required: (t) =>
        t("managedSiteChannels:editor.fields.magpieChat.required"),
    },
    renderer: Renderers.Text,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.magpieResponses.label"),
    resolvePlaceholder: () => "https://api.example.com/v1",
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.magpieResponses.help"),
  },
  {
    fieldId: "anthropic",
    section: Sections.Basic,
    order: 35,
    visibleWhen: (values) => values.baseAPI === "anthropic",
    issueLabelResolvers: {
      required: (t) =>
        t("managedSiteChannels:editor.fields.magpieChat.required"),
    },
    renderer: Renderers.Text,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.magpieAnthropic.label"),
    resolvePlaceholder: () => "https://api.anthropic.com",
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.magpieAnthropic.help"),
  },
  {
    fieldId: "gemini",
    section: Sections.Basic,
    order: 35,
    visibleWhen: (values) => values.baseAPI === "gemini",
    issueLabelResolvers: {
      required: (t) =>
        t("managedSiteChannels:editor.fields.magpieChat.required"),
    },
    renderer: Renderers.Text,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.magpieGemini.label"),
    resolvePlaceholder: () =>
      "https://generativelanguage.googleapis.com/v1beta",
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.magpieGemini.help"),
  },
  {
    fieldId: "key",
    section: Sections.Basic,
    order: 30,
    renderer: Renderers.Secret,
    resolveLabel: (t) => t("managedSiteChannels:magpieKeys.primaryKey"),
    channelFieldRole: Roles.Secret,
    resolveHelp: (t) => t("managedSiteChannels:editor.secret.keepExistingHint"),
  },
  {
    fieldId: "keyPool",
    section: Sections.Basic,
    order: 40,
    renderer: Renderers.SecretList,
    compactSecretRows: true,
    secretListLayout: "list",
    resolveEntryTitle: (_t, fields) => fields.name ?? "",
    resolveLabel: (t) => t("managedSiteChannels:magpieKeys.title"),
    resolveHelp: (t) => t("managedSiteChannels:magpieKeys.help"),
    resolveEntrySummary: (t, fields) =>
      [
        fields.masked ? normalizeSecretMaskForDisplay(fields.masked) : "",
        fields.primary === "true"
          ? t("managedSiteChannels:magpieKeys.primary")
          : "",
        fields.on === "false" ? t("common:status.disabled") : "",
        fields.protocol,
      ]
        .filter(Boolean)
        .join(" · "),
    entryFields: [
      {
        fieldId: "name",
        resolveLabel: (t) => t("managedSiteChannels:magpieKeys.name"),
      },
      {
        fieldId: "on",
        width: "compact",
        resolveLabel: (t) => t("managedSiteChannels:magpieKeys.enabled"),
      },
      {
        fieldId: "protocol",
        width: "wide",
        resolveLabel: (t) => t("managedSiteChannels:magpieKeys.protocol"),
        optionLabelResolvers: {
          "": (t) => t("managedSiteChannels:magpieKeys.anyProtocol"),
          chat: () => "Chat Completions",
          responses: () => "Responses",
          anthropic: () => "Anthropic",
        },
      },
      {
        fieldId: "weight",
        width: "compact",
        resolveLabel: (t) => t("channelDialog:fields.weight.label"),
        resolveHelp: (t) => t("managedSiteChannels:magpieKeys.weightHelp"),
      },
    ],
    issueLabelResolvers: {
      invalid_value: (t) => t("managedSiteChannels:magpieKeys.invalid"),
    },
  },
  {
    fieldId: "routing",
    section: Sections.Basic,
    order: 50,
    renderer: Renderers.Select,
    resolveLabel: (t) => t("managedSiteChannels:magpieKeys.routing"),
    optionLabelResolvers: {
      "": (t) => t("managedSiteChannels:magpieKeys.smart"),
      order: (t) => t("managedSiteChannels:magpieKeys.order"),
      rotate: (t) => t("managedSiteChannels:magpieKeys.rotate"),
      usage: (t) => t("managedSiteChannels:magpieKeys.usage"),
      pace: (t) => t("managedSiteChannels:magpieKeys.pace"),
      weight: (t) => t("managedSiteChannels:magpieKeys.weighted"),
    },
  },
  {
    fieldId: "supportedModels",
    section: Sections.Models,
    order: 10,
    renderer: Renderers.MultiSelect,
    resolveLabel: (t) => t("channelDialog:fields.models.label"),
    channelFieldRole: Roles.Models,
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.magpieModels.help"),
  },
  {
    fieldId: "modelsURL",
    section: Sections.Models,
    order: 20,
    renderer: Renderers.Text,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.magpieModelsURL.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.magpieModelsURL.help"),
    resolvePlaceholder: () => "https://api.example.com/v1/models",
  },
  {
    fieldId: "catalog",
    section: Sections.Models,
    order: 30,
    renderer: Renderers.Text,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.magpieCatalog.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.magpieCatalog.help"),
    resolvePlaceholder: () => "openai, anthropic, deepseek",
  },
  {
    fieldId: "balanceURL",
    section: Sections.Advanced,
    order: 30,
    renderer: Renderers.Text,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.magpieBalanceURL.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.magpieBalanceURL.help"),
    resolvePlaceholder: () => "https://api.example.com/api/usage/token",
  },
  {
    fieldId: "balancePath",
    section: Sections.Advanced,
    order: 40,
    renderer: Renderers.Text,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.magpieBalancePath.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.magpieBalancePath.help"),
    resolvePlaceholder: () => "data.balance",
  },
  {
    fieldId: "maxConcurrency",
    section: Sections.Advanced,
    order: 50,
    renderer: Renderers.Number,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.magpieMaxConcurrency.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.magpieMaxConcurrency.help"),
  },
  {
    fieldId: "maxRPM",
    section: Sections.Advanced,
    order: 60,
    renderer: Renderers.Number,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.magpieMaxRPM.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.magpieMaxRPM.help"),
  },
  {
    fieldId: "priceRate",
    section: Sections.Advanced,
    order: 70,
    renderer: Renderers.Number,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.magpiePriceRate.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.magpiePriceRate.help"),
  },
  {
    fieldId: "proxy",
    section: Sections.Advanced,
    order: 10,
    renderer: Renderers.Text,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.magpieProxy.label"),
    resolveHelp: (t) => t("managedSiteChannels:editor.fields.magpieProxy.help"),
    resolvePlaceholder: () => "http://127.0.0.1:7890",
  },
  {
    fieldId: "headers",
    section: Sections.Advanced,
    order: 20,
    renderer: Renderers.Textarea,
    advancedControl: "string-map",
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.magpieHeaders.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.magpieHeaders.help"),
  },
]

const mode = {
  fields,
  hiddenFields: [],
  sections: {
    [Sections.Basic]: { columns: 2 as const, defaultOpen: true },
    [Sections.Advanced]: { defaultOpen: false },
  },
}
const policy = defineManagedResourceFieldPolicy({
  siteType: SITE_TYPES.MAGPIE,
  kind: "channel",
  modes: { create: mode, edit: mode },
})

export const magpiePresentation = {
  siteType: SITE_TYPES.MAGPIE,
  fieldPolicies: [policy],
  table: {
    semantics: {
      baseUrlFieldId: "baseURL",
      statusFieldId: "status",
      detailFieldLabels: {
        baseURL: (t) => t("channelDialog:fields.baseUrl.label"),
      },
    },
    defaultSorting: [{ id: MANAGED_CHANNELS_COLUMN_IDS.Name, desc: false }],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.Canonical,
  },
} satisfies ManagedSitePresentationDefinition
