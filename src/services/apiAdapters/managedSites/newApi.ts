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
  toManagedResourceMatchCandidate,
  toManagedResourceMatchList,
  toNativeNumericMatchCandidates,
} from "~/services/apiAdapters/managedResources/matchingInputs"
import { requireManagedResourceChannelId } from "~/services/apiAdapters/managedResources/resourceIds"
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
import { newApiSecretVerification } from "./newApiSecretVerification"
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
  secretVerification: newApiSecretVerification,
  hydrateComparableKeys: async (config, candidates, options) => {
    const target = { siteType: SITE_TYPES.NEW_API, config }
    const hydrated = await newApiChannelOperations.hydrateComparableKeys(
      config,
      toNativeNumericMatchCandidates(candidates, target),
      options,
    )
    return hydrated.map((candidate) =>
      toManagedResourceMatchCandidate(candidate, target),
    )
  },
  search: async (config, keyword, options) =>
    toManagedResourceMatchList(
      await newApiChannelOperations.search(config, keyword, options),
      { siteType: SITE_TYPES.NEW_API, config },
    ),
  fetchSecretKey: async (config, ref, options) =>
    newApiChannelOperations.fetchSecretKey(
      config,
      requireManagedResourceChannelId(SITE_TYPES.NEW_API, config, ref),
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
