import {
  OMNIROUTE_CONNECTION_TEST_STATUSES,
  OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS,
} from "~/constants/omniroute"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"

import { MANAGED_CHANNELS_COLUMN_IDS } from "../contracts"
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
} from "../managedResourceFieldPresentation"
import {
  NATIVE_TABLE_COLUMN_LAYOUTS,
  type ManagedSitePresentationDefinition,
} from "../managedResourceTablePresentation"

const omniRouteProviderField = {
  fieldId: OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.Provider,
  section: MANAGED_RESOURCE_SECTIONS.Basic,
  order: 20,
  resolveLabel: (t) => t("channelDialog:fields.type.label"),
  resolveHelp: (t) =>
    t("managedSiteChannels:editor.fields.omnirouteProvider.help"),
  // Provider ids are slugs, so the adapter supplies each label as the id
  // itself and no translated vocabulary exists to resolve here.
  renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Select,
  channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Type,
  resolveOptionFallback: resolveNativeTypeSlug,
} as const satisfies ManagedResourceFieldPresentation

const omniRouteConnectionFields = [
  {
    fieldId: OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
    section: MANAGED_RESOURCE_SECTIONS.Connection,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.baseUrl.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.omnirouteBaseUrl.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.BaseUrl,
  },
  {
    fieldId: OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.Key,
    section: MANAGED_RESOURCE_SECTIONS.Connection,
    order: 20,
    resolveLabel: (t) => t("channelDialog:fields.key.label"),
    resolveHelp: (t) => t("managedSiteChannels:editor.secret.keepExistingHint"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Secret,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Secret,
  },
  {
    fieldId: OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.DefaultModel,
    section: MANAGED_RESOURCE_SECTIONS.Models,
    order: 10,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.omnirouteDefaultModel.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.omnirouteDefaultModel.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
  },
] as const satisfies readonly ManagedResourceFieldPresentation[]

const omniRouteCreateFields = [
  {
    fieldId: OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.Name,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.name.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Name,
  },
  omniRouteProviderField,
  ...omniRouteConnectionFields,
  {
    fieldId: OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.Prefix,
    section: MANAGED_RESOURCE_SECTIONS.Advanced,
    order: 10,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.omniroutePrefix.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.omniroutePrefix.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
  },
] as const satisfies readonly ManagedResourceFieldPresentation[]

const omniRouteEditFields = [
  {
    fieldId: OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.Name,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.name.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Name,
  },
  {
    fieldId: OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.Status,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 30,
    resolveLabel: (t) => t("channelDialog:fields.status.label"),
    optionLabelResolvers: nativeChannelStatusOptionLabelResolvers,
    resolveOptionFallback: managedResourceStatusFallbackLabelResolver,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Select,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Status,
  },
  ...omniRouteConnectionFields,
  {
    fieldId: OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.Priority,
    section: MANAGED_RESOURCE_SECTIONS.Routing,
    order: 10,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.omniroutePriority.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.omniroutePriority.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Number,
  },
] as const satisfies readonly ManagedResourceFieldPresentation[]

const omniRouteManagedResourceFieldPolicy = defineManagedResourceFieldPolicy({
  siteType: SITE_TYPES.OMNIROUTE,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  modes: {
    [MANAGED_RESOURCE_EDITOR_MODES.Create]: {
      fields: omniRouteCreateFields,
      hiddenFields: [],
      // A dedicated model prefix is an advanced case; it stays collapsed so the
      // common import path is a single built-in provider plus a base URL.
      sections: {
        [MANAGED_RESOURCE_SECTIONS.Advanced]: { defaultOpen: false },
      },
    },
    [MANAGED_RESOURCE_EDITOR_MODES.Edit]: {
      fields: omniRouteEditFields,
      hiddenFields: [],
    },
  },
})

export const omniRoutePresentation = {
  siteType: omniRouteManagedResourceFieldPolicy.siteType,
  fieldPolicies: [omniRouteManagedResourceFieldPolicy],
  table: {
    semantics: {
      baseUrlFieldId: OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      statusFieldId: OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.Status,
      // Provider values are gateway slugs, so the raw id is the label. No
      // translated vocabulary is invented for them.
      fieldValuePresentations: {
        [OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.TestStatus]: {
          optionLabelResolvers: {
            [OMNIROUTE_CONNECTION_TEST_STATUSES.Active]: (t) =>
              t("managedSiteChannels:editor.options.omnirouteTestStatus.ok"),
            [OMNIROUTE_CONNECTION_TEST_STATUSES.Error]: (t) =>
              t(
                "managedSiteChannels:editor.options.omnirouteTestStatus.failed",
              ),
            [OMNIROUTE_CONNECTION_TEST_STATUSES.Unavailable]: (t) =>
              t(
                "managedSiteChannels:editor.options.omnirouteTestStatus.unsupported",
              ),
            [OMNIROUTE_CONNECTION_TEST_STATUSES.Unknown]: (t) =>
              t(
                "managedSiteChannels:editor.options.omnirouteTestStatus.pending",
              ),
          },
          // A state the gateway adds later stays visible as it reported itself.
        },
      },
      detailFieldLabels: {
        // The gateway's connection test has no editor control, so its labels are
        // declared here rather than on a field the editor would render.
        [OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.TestStatus]: (t) =>
          t("managedSiteChannels:editor.fields.omnirouteTestStatus.label"),
        [OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.LastError]: (t) =>
          t("managedSiteChannels:editor.fields.omnirouteLastError.label"),
      },
    },
    defaultSorting: [{ id: MANAGED_CHANNELS_COLUMN_IDS.Name, desc: false }],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.Canonical,
  },
} satisfies ManagedSitePresentationDefinition
