import type { TFunction } from "i18next"

import { SITE_TYPES } from "~/constants/siteType"
import {
  SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS,
  SUB2API_MANAGED_RESOURCE_STATUS,
} from "~/constants/sub2api"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"

import {
  defineManagedResourceFieldPolicy,
  MANAGED_RESOURCE_CHANNEL_FIELD_ROLES,
  MANAGED_RESOURCE_EDITOR_MODES,
  MANAGED_RESOURCE_FIELD_RENDERERS,
  MANAGED_RESOURCE_SECTIONS,
  managedResourceStatusFallbackLabelResolver,
  resolveUnsupportedResourceType,
  type ManagedResourceFieldPresentation,
  type ManagedResourceTextResolver,
} from "../managedResourceFieldPresentation"
import {
  NATIVE_TABLE_COLUMN_LAYOUTS,
  type ManagedSitePresentationDefinition,
} from "../managedResourceTablePresentation"

const sub2ApiPlatformOptionLabelResolvers = Object.fromEntries(
  Object.entries(SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS).map(
    ([value, label]) => [value, () => label],
  ),
) satisfies Readonly<Record<string, ManagedResourceTextResolver>>

const sub2ApiStatusOptionLabelResolvers = {
  [SUB2API_MANAGED_RESOURCE_STATUS.Active]: (t: TFunction) =>
    t("common:status.enabled"),
  [SUB2API_MANAGED_RESOURCE_STATUS.Inactive]: (t: TFunction) =>
    t("common:status.disabled"),
  [SUB2API_MANAGED_RESOURCE_STATUS.Error]: (t: TFunction) =>
    t("managedSiteChannels:statusLabels.autoDisabled"),
} as const satisfies Readonly<Record<string, ManagedResourceTextResolver>>

const sub2ApiCreateFields = [
  {
    fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.name.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Name,
  },
  {
    fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 20,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.sub2apiPlatform.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.sub2apiPlatform.help"),
    optionLabelResolvers: sub2ApiPlatformOptionLabelResolvers,
    resourceType: true,
    resolveOptionFallback: resolveUnsupportedResourceType,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Select,
  },
  {
    fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 30,
    resolveLabel: (t) => t("channelDialog:fields.status.label"),
    optionLabelResolvers: sub2ApiStatusOptionLabelResolvers,
    resolveOptionFallback: managedResourceStatusFallbackLabelResolver,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Select,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Status,
  },
  {
    fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
    section: MANAGED_RESOURCE_SECTIONS.Connection,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.baseUrl.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.BaseUrl,
  },
  {
    fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key,
    section: MANAGED_RESOURCE_SECTIONS.Connection,
    order: 20,
    resolveLabel: (t) => t("channelDialog:fields.key.label"),
    resolveHelp: (t) => t("managedSiteChannels:editor.secret.keepExistingHint"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Secret,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Secret,
  },
  {
    fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Models,
    section: MANAGED_RESOURCE_SECTIONS.Models,
    order: 10,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.sub2apiModels.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.sub2apiModels.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.MultiSelect,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Models,
  },
  {
    fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency,
    section: MANAGED_RESOURCE_SECTIONS.Routing,
    order: 10,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.concurrency.label"),
    resolveHelp: (t) => t("managedSiteChannels:editor.fields.concurrency.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Number,
  },
  {
    fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority,
    section: MANAGED_RESOURCE_SECTIONS.Routing,
    order: 20,
    resolveLabel: (t) => t("managedSiteChannels:editor.fields.priority.label"),
    resolveHelp: (t) => t("managedSiteChannels:editor.fields.priority.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Number,
  },
] as const satisfies readonly ManagedResourceFieldPresentation[]

const sub2ApiNotesField = {
  fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Notes,
  section: MANAGED_RESOURCE_SECTIONS.Metadata,
  order: 10,
  resolveLabel: (t: TFunction) =>
    t("managedSiteChannels:editor.fields.notes.label"),
  resolveHelp: (t: TFunction) =>
    t("managedSiteChannels:editor.fields.notes.help"),
  resolvePlaceholder: (t: TFunction) =>
    t("managedSiteChannels:editor.fields.notes.placeholder"),
  renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Textarea,
  rows: 3,
} as const satisfies ManagedResourceFieldPresentation

const sub2ApiManagedResourceFieldPolicy = defineManagedResourceFieldPolicy({
  siteType: SITE_TYPES.SUB2API,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  modes: {
    [MANAGED_RESOURCE_EDITOR_MODES.Create]: {
      fields: [...sub2ApiCreateFields, sub2ApiNotesField],
      hiddenFields: [],
    },
    [MANAGED_RESOURCE_EDITOR_MODES.Edit]: {
      fields: [...sub2ApiCreateFields, sub2ApiNotesField],
      hiddenFields: [],
    },
  },
})

export const sub2ApiPresentation = {
  siteType: sub2ApiManagedResourceFieldPolicy.siteType,
  fieldPolicies: [sub2ApiManagedResourceFieldPolicy],
  table: {
    semantics: {
      baseUrlFieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      statusFieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status,
    },
    defaultSorting: [
      { id: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name, desc: true },
    ],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.Sub2Api,
  },
} satisfies ManagedSitePresentationDefinition
