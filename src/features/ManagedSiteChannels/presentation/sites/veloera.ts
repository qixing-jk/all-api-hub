import { SITE_TYPES } from "~/constants/siteType"
import {
  VELOERA_MANAGED_RESOURCE_FIELD_IDS,
  VeloeraChannelStatus,
  VeloeraChannelTypeNames,
} from "~/constants/veloera"
import {
  createNewApiFamilyFields,
  createStatusOptionLabelResolvers,
  defineManagedResourceFieldPolicy,
  MANAGED_RESOURCE_EDITOR_MODES,
  requireFieldValuePresentation,
  type ManagedResourceTextResolver,
} from "~/features/ManagedSiteChannels/editor/managedResourceFieldPresentation"
import {
  NATIVE_TABLE_COLUMN_LAYOUTS,
  type ManagedSitePresentationDefinition,
} from "~/features/ManagedSiteChannels/table/managedResourceTablePresentation"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"

const veloeraTypeOptionLabelResolvers = Object.fromEntries(
  Object.entries(VeloeraChannelTypeNames).map(([value, label]) => [
    value,
    () => label,
  ]),
) satisfies Readonly<Record<string, ManagedResourceTextResolver>>

const veloeraFields = createNewApiFamilyFields(
  VELOERA_MANAGED_RESOURCE_FIELD_IDS,
  veloeraTypeOptionLabelResolvers,
  createStatusOptionLabelResolvers(VeloeraChannelStatus),
)

const veloeraManagedResourceFieldPolicy = defineManagedResourceFieldPolicy({
  siteType: SITE_TYPES.VELOERA,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  modes: {
    [MANAGED_RESOURCE_EDITOR_MODES.Create]: {
      fields: veloeraFields,
      hiddenFields: [],
    },
    [MANAGED_RESOURCE_EDITOR_MODES.Edit]: {
      fields: veloeraFields,
      hiddenFields: [],
    },
  },
})

export const veloeraPresentation = {
  siteType: veloeraManagedResourceFieldPolicy.siteType,
  fieldPolicies: [veloeraManagedResourceFieldPolicy],
  table: {
    semantics: {
      baseUrlFieldId: VELOERA_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      statusFieldId: VELOERA_MANAGED_RESOURCE_FIELD_IDS.Status,
      fieldValuePresentations: {
        [VELOERA_MANAGED_RESOURCE_FIELD_IDS.Type]:
          requireFieldValuePresentation(
            veloeraManagedResourceFieldPolicy,
            VELOERA_MANAGED_RESOURCE_FIELD_IDS.Type,
          ),
      },
      detailFieldLabels: {
        [VELOERA_MANAGED_RESOURCE_FIELD_IDS.StatusReason]: (t) =>
          t("managedSiteChannels:editor.fields.channelStatusReason.label"),
      },
    },
    defaultSorting: [{ id: VELOERA_MANAGED_RESOURCE_FIELD_IDS.Id, desc: true }],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.NumericChannel,
    numericChannelFieldIds: VELOERA_MANAGED_RESOURCE_FIELD_IDS,
  },
} satisfies ManagedSitePresentationDefinition
