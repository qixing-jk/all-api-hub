import type { TFunction } from "i18next"

import {
  ChannelTypeNames,
  NEW_API_MANAGED_RESOURCE_FIELD_IDS,
} from "~/constants/newApi"
import { SITE_TYPES } from "~/constants/siteType"
import {
  createNewApiFamilyFields,
  createStatusOptionLabelResolvers,
  defineManagedResourceFieldPolicy,
  MANAGED_RESOURCE_EDITOR_MODES,
  requireFieldValuePresentation,
  type ManagedResourceTextResolver,
} from "~/features/ManagedSiteChannels/editor/managedResourceFieldPresentation"
import {
  newApiAdvancedFields,
  newApiSections,
} from "~/features/ManagedSiteChannels/editor/newApiAdvancedFieldPolicy"
import {
  NATIVE_TABLE_COLUMN_LAYOUTS,
  type ManagedSitePresentationDefinition,
} from "~/features/ManagedSiteChannels/table/managedResourceTablePresentation"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { CHANNEL_STATUS } from "~/types/newApi"

const newApiTypeOptionLabelResolvers = Object.fromEntries(
  Object.entries(ChannelTypeNames).map(([value, label]) => [
    value,
    () => label,
  ]),
) satisfies Readonly<Record<string, ManagedResourceTextResolver>>

const newApiFields = [
  ...createNewApiFamilyFields(
    NEW_API_MANAGED_RESOURCE_FIELD_IDS,
    newApiTypeOptionLabelResolvers,
    createStatusOptionLabelResolvers(CHANNEL_STATUS),
  ).map((field) => ({
    ...field,
    ...(field.fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key
      ? {
          resolveCredentialListHelp: (t: TFunction) =>
            t("managedSiteChannels:editor.secret.partialReplacementHint"),
        }
      : {}),
    ...(field.section === "connection"
      ? { section: "basic" as const, order: field.order + 30 }
      : {}),
    ...((
      [
        NEW_API_MANAGED_RESOURCE_FIELD_IDS.Type,
        NEW_API_MANAGED_RESOURCE_FIELD_IDS.Status,
        NEW_API_MANAGED_RESOURCE_FIELD_IDS.Priority,
        NEW_API_MANAGED_RESOURCE_FIELD_IDS.Weight,
      ] as string[]
    ).includes(field.fieldId)
      ? { width: "half" as const }
      : {}),
  })),
  {
    fieldId: "multiKeyMode",
    section: "basic" as const,
    order: 55,
    renderer: "select" as const,
    resolveLabel: (t: TFunction) =>
      t("managedSiteChannels:editor.multiKeyMode.label"),
    optionLabelResolvers: {
      random: (t: TFunction) =>
        t("managedSiteChannels:editor.multiKeyMode.random"),
      polling: (t: TFunction) =>
        t("managedSiteChannels:editor.multiKeyMode.polling"),
    },
  },
  ...newApiAdvancedFields,
]

const newApiManagedResourceFieldPolicy = defineManagedResourceFieldPolicy({
  siteType: SITE_TYPES.NEW_API,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  modes: {
    [MANAGED_RESOURCE_EDITOR_MODES.Create]: {
      fields: newApiFields,
      sections: newApiSections,
      hiddenFields: [],
    },
    [MANAGED_RESOURCE_EDITOR_MODES.Edit]: {
      fields: newApiFields,
      sections: newApiSections,
      hiddenFields: [],
    },
  },
})

export const newApiPresentation = {
  siteType: newApiManagedResourceFieldPolicy.siteType,
  fieldPolicies: [newApiManagedResourceFieldPolicy],
  table: {
    semantics: {
      baseUrlFieldId: NEW_API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      statusFieldId: NEW_API_MANAGED_RESOURCE_FIELD_IDS.Status,
      fieldValuePresentations: {
        [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Type]:
          requireFieldValuePresentation(
            newApiManagedResourceFieldPolicy,
            NEW_API_MANAGED_RESOURCE_FIELD_IDS.Type,
          ),
      },
      detailFieldLabels: {
        // The gateway records this reason itself when it disables a channel, and
        // its own list shows the same string in the status tooltip.
        [NEW_API_MANAGED_RESOURCE_FIELD_IDS.StatusReason]: (t) =>
          t("managedSiteChannels:editor.fields.channelStatusReason.label"),
      },
    },
    defaultSorting: [{ id: NEW_API_MANAGED_RESOURCE_FIELD_IDS.Id, desc: true }],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.NumericChannel,
    numericChannelFieldIds: NEW_API_MANAGED_RESOURCE_FIELD_IDS,
    supportsNumericChannelDeepLink: true,
  },
} satisfies ManagedSitePresentationDefinition
