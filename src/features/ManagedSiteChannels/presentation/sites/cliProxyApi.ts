import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"

import {
  cliProxyApiFields,
  cliProxyApiSections,
} from "../cliProxyApiFieldPolicy"
import { MANAGED_CHANNELS_COLUMN_IDS } from "../contracts"
import {
  defineManagedResourceFieldPolicy,
  requireFieldValuePresentation,
} from "../managedResourceFieldPresentation"
import { DEFAULT_MANAGED_RESOURCE_PRESENTATION_SEMANTICS } from "../managedResourcePresentation"
import {
  NATIVE_TABLE_COLUMN_LAYOUTS,
  type ManagedSitePresentationDefinition,
} from "../managedResourceTablePresentation"

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
