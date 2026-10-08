import { GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS } from "~/constants/gptLoad"
import { SITE_TYPES } from "~/constants/siteType"
import {
  defineManagedResourceFieldPolicy,
  MANAGED_RESOURCE_CHANNEL_FIELD_ROLES,
  MANAGED_RESOURCE_EDITOR_MODES,
  MANAGED_RESOURCE_FIELD_RENDERERS,
  MANAGED_RESOURCE_SECTIONS,
  managedResourceStatusFallbackLabelResolver,
  nativeChannelStatusOptionLabelResolvers,
  resolveNativeTypeSlug,
  type ManagedResourceFieldPresentation,
} from "~/features/ManagedSiteChannels/editor/managedResourceFieldPresentation"
import {
  NATIVE_TABLE_COLUMN_LAYOUTS,
  type ManagedSitePresentationDefinition,
} from "~/features/ManagedSiteChannels/table/managedResourceTablePresentation"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"

import { MANAGED_CHANNELS_COLUMN_IDS } from "../contracts"

const gptLoadCreateFields = [
  {
    fieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Name,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.name.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Name,
  },
  {
    fieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Provider,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 20,
    resolveLabel: (t) => t("channelDialog:fields.type.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.gptLoadProvider.help"),
    resolveOptionFallback: resolveNativeTypeSlug,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Select,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Type,
  },
  {
    fieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
    section: MANAGED_RESOURCE_SECTIONS.Connection,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.baseUrl.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.gptLoadBaseUrl.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.BaseUrl,
  },
  {
    fieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Key,
    section: MANAGED_RESOURCE_SECTIONS.Connection,
    order: 20,
    resolveLabel: (t) => t("channelDialog:fields.key.label"),
    resolveHelp: (t) => t("managedSiteChannels:editor.fields.gptLoadKey.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Secret,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Secret,
  },
  {
    fieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Models,
    section: MANAGED_RESOURCE_SECTIONS.Models,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.models.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.MultiSelect,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Models,
  },
  {
    fieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.PriceMultiplier,
    section: MANAGED_RESOURCE_SECTIONS.Routing,
    order: 20,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.gptLoadPriceMultiplier.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.gptLoadPriceMultiplier.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
  },
] as const satisfies readonly ManagedResourceFieldPresentation[]

const gptLoadEditFields = [
  {
    fieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Name,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.name.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Name,
  },
  {
    fieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Status,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 30,
    resolveLabel: (t) => t("channelDialog:fields.status.label"),
    optionLabelResolvers: nativeChannelStatusOptionLabelResolvers,
    resolveOptionFallback: managedResourceStatusFallbackLabelResolver,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Select,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Status,
  },
  {
    fieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
    section: MANAGED_RESOURCE_SECTIONS.Connection,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.baseUrl.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.gptLoadBaseUrl.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.BaseUrl,
  },
  {
    fieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Key,
    section: MANAGED_RESOURCE_SECTIONS.Connection,
    order: 20,
    resolveLabel: (t) => t("channelDialog:fields.key.label"),
    resolveHelp: (t) => t("managedSiteChannels:editor.fields.gptLoadKey.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Secret,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Secret,
  },
  {
    fieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Models,
    section: MANAGED_RESOURCE_SECTIONS.Models,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.models.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.MultiSelect,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Models,
  },
  {
    fieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.PriceMultiplier,
    section: MANAGED_RESOURCE_SECTIONS.Routing,
    order: 20,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.gptLoadPriceMultiplier.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.gptLoadPriceMultiplier.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
  },
  {
    fieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Weight,
    section: MANAGED_RESOURCE_SECTIONS.Routing,
    order: 10,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.gptLoadWeight.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.gptLoadWeight.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Number,
  },
] as const satisfies readonly ManagedResourceFieldPresentation[]

const gptLoadManagedResourceFieldPolicy = defineManagedResourceFieldPolicy({
  siteType: SITE_TYPES.GPT_LOAD,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  modes: {
    [MANAGED_RESOURCE_EDITOR_MODES.Create]: {
      fields: gptLoadCreateFields,
      // The create editor declares no status or weight descriptor, so neither
      // can be hidden here; every classified id must be a real descriptor.
      hiddenFields: [],
    },
    [MANAGED_RESOURCE_EDITOR_MODES.Edit]: {
      fields: gptLoadEditFields,
      hiddenFields: [
        {
          fieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Provider,
          reason: "read-only",
        },
      ],
    },
  },
})

export const gptLoadPresentation = {
  siteType: gptLoadManagedResourceFieldPolicy.siteType,
  fieldPolicies: [gptLoadManagedResourceFieldPolicy],
  table: {
    semantics: {
      baseUrlFieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      statusFieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Status,
    },
    defaultSorting: [{ id: MANAGED_CHANNELS_COLUMN_IDS.Name, desc: false }],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.Canonical,
  },
} satisfies ManagedSitePresentationDefinition
