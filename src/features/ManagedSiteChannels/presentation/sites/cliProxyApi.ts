import { SITE_TYPES } from "~/constants/siteType"
import {
  cliProxyApiFields,
  cliProxyApiSections,
} from "~/features/ManagedSiteChannels/editor/cliProxyApiFieldPolicy"
import {
  defineManagedResourceFieldPolicy,
  requireFieldValuePresentation,
} from "~/features/ManagedSiteChannels/editor/managedResourceFieldPresentation"
import {
  NATIVE_TABLE_COLUMN_LAYOUTS,
  type ManagedSitePresentationDefinition,
} from "~/features/ManagedSiteChannels/table/managedResourceTablePresentation"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"

import { MANAGED_CHANNELS_COLUMN_IDS } from "../contracts"
import { DEFAULT_MANAGED_RESOURCE_PRESENTATION_SEMANTICS } from "../managedResourcePresentation"

const cliProxyApiManagedResourceFieldPolicy = defineManagedResourceFieldPolicy({
  siteType: SITE_TYPES.CLI_PROXY_API,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  modes: {
    create: {
      fields: cliProxyApiFields,
      hiddenFields: [],
      sections: cliProxyApiSections,
    },
    edit: {
      fields: cliProxyApiFields,
      hiddenFields: [],
      sections: cliProxyApiSections,
    },
  },
})

export const cliProxyApiPresentation = {
  siteType: cliProxyApiManagedResourceFieldPolicy.siteType,
  fieldPolicies: [cliProxyApiManagedResourceFieldPolicy],
  table: {
    semantics: {
      ...DEFAULT_MANAGED_RESOURCE_PRESENTATION_SEMANTICS,
      fieldValuePresentations: {
        type: requireFieldValuePresentation(
          cliProxyApiManagedResourceFieldPolicy,
          "type",
        ),
      },
    },
    defaultSorting: [{ id: MANAGED_CHANNELS_COLUMN_IDS.Name, desc: false }],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.Canonical,
  },
} satisfies ManagedSitePresentationDefinition
