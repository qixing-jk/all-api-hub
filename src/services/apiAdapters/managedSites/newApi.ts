import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceMatchingCapability } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type {
  ManagedSiteCapabilities,
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelRequestOptions,
  ManagedSiteConfigCapability,
  ManagedSiteQueriesCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  requireNumericManagedResourceId,
  toManagedResourceMatchList,
} from "~/services/apiAdapters/managedResources/matchingInputs"
import {
  fetchAccountAvailableModels,
  fetchSiteUserGroups,
} from "~/services/apiService/newApiFamily/default/keyManagement"
import {
  checkValidNewApiConfig,
  prepareChannelFormData,
} from "~/services/managedSites/providers/newApi"
import type { NewApiConfig } from "~/types/newApiConfig"

import {
  newApiChannelOperations,
  newApiManagedResourceModels,
} from "../managedResources/newApiOperations"
import { createManagedSiteConfigCapability } from "./config"
import { toManagedSiteApiServiceRequest } from "./request"

const newApiManagedSiteConfig: ManagedSiteConfigCapability<NewApiConfig> =
  createManagedSiteConfigCapability(SITE_TYPES.NEW_API, checkValidNewApiConfig)

const newApiManagedSiteQueries: ManagedSiteQueriesCapability<NewApiConfig> = {
  siteUserGroups: {
    fetch: async (
      config: NewApiConfig,
      options?: Pick<ManagedSiteChannelRequestOptions, "signal">,
    ) =>
      await fetchSiteUserGroups(
        toManagedSiteApiServiceRequest(config, options),
      ),
  },
  accountAvailableModels: {
    fetch: async (config) =>
      await fetchAccountAvailableModels(toManagedSiteApiServiceRequest(config)),
  },
}

const newApiManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  prepareFormData: prepareChannelFormData,
}

const matching: ManagedResourceMatchingCapability<NewApiConfig> = {
  hydrateComparableKeys: newApiChannelOperations.hydrateComparableKeys,
  search: async (config, keyword) =>
    toManagedResourceMatchList(
      await newApiChannelOperations.search(config, keyword),
    ),
  fetchSecretKey: async (config, id, options) =>
    newApiChannelOperations.fetchSecretKey(
      config,
      requireNumericManagedResourceId(id),
      options,
    ),
}

export const newApiManagedSiteCapabilities = {
  siteType: SITE_TYPES.NEW_API,
  matching,
  models: newApiManagedResourceModels,
  config: newApiManagedSiteConfig,
  queries: newApiManagedSiteQueries,
  channelDrafts: newApiManagedSiteChannelDrafts,
} satisfies ManagedSiteCapabilities<NewApiConfig, typeof SITE_TYPES.NEW_API>
