import {
  OCTOPUS_MANAGED_RESOURCE_FIELD_IDS,
  OctopusOutboundTypeNames,
} from "~/constants/octopus"
import { SITE_TYPES } from "~/constants/siteType"
import {
  createNativeChannelFields,
  defineManagedResourceFieldPolicy,
  MANAGED_RESOURCE_EDITOR_MODES,
  requireFieldValuePresentation,
} from "~/features/ManagedSiteChannels/editor/managedResourceFieldPresentation"
import {
  NATIVE_TABLE_COLUMN_LAYOUTS,
  type ManagedSitePresentationDefinition,
} from "~/features/ManagedSiteChannels/table/managedResourceTablePresentation"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"

import { MANAGED_CHANNELS_COLUMN_IDS } from "../contracts"

const octopusFields = createNativeChannelFields(
  OCTOPUS_MANAGED_RESOURCE_FIELD_IDS,
  Object.fromEntries(
    Object.entries(OctopusOutboundTypeNames).map(([value, label]) => [
      value,
      () => label,
    ]),
  ),
)

const octopusManagedResourceFieldPolicy = defineManagedResourceFieldPolicy({
  siteType: SITE_TYPES.OCTOPUS,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  modes: {
    [MANAGED_RESOURCE_EDITOR_MODES.Create]: {
      fields: octopusFields,
      hiddenFields: [],
    },
    [MANAGED_RESOURCE_EDITOR_MODES.Edit]: {
      fields: octopusFields,
      hiddenFields: [],
    },
  },
})

export const octopusPresentation = {
  siteType: octopusManagedResourceFieldPolicy.siteType,
  fieldPolicies: [octopusManagedResourceFieldPolicy],
  table: {
    semantics: {
      baseUrlFieldId: OCTOPUS_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      statusFieldId: OCTOPUS_MANAGED_RESOURCE_FIELD_IDS.Status,
      fieldValuePresentations: {
        [OCTOPUS_MANAGED_RESOURCE_FIELD_IDS.Type]:
          requireFieldValuePresentation(
            octopusManagedResourceFieldPolicy,
            OCTOPUS_MANAGED_RESOURCE_FIELD_IDS.Type,
          ),
      },
    },
    defaultSorting: [{ id: MANAGED_CHANNELS_COLUMN_IDS.Name, desc: false }],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.Canonical,
  },
} satisfies ManagedSitePresentationDefinition
