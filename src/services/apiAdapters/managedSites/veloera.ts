import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceMatchingCapability } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type {
  ManagedSiteCapabilities,
  ManagedSiteChannelDraftsCapability,
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
import { listAllChannels } from "~/services/apiService/veloera"
import {
  checkValidVeloeraConfig,
  prepareChannelFormData,
} from "~/services/managedSites/providers/veloera"
import type { VeloeraConfig } from "~/types/veloeraConfig"

import {
  veloeraChannelOperations,
  veloeraManagedResourceModels,
} from "../managedResources/veloeraOperations"
import { createManagedSiteConfigCapability } from "./config"
import { toManagedSiteApiServiceRequest } from "./request"

const veloeraManagedSiteConfig: ManagedSiteConfigCapability<VeloeraConfig> =
  createManagedSiteConfigCapability(SITE_TYPES.VELOERA, checkValidVeloeraConfig)

const veloeraManagedSiteQueries: ManagedSiteQueriesCapability<VeloeraConfig> = {
  siteUserGroups: {
    fetch: async (config) =>
      await fetchSiteUserGroups(toManagedSiteApiServiceRequest(config)),
  },
  accountAvailableModels: {
    fetch: async (config) =>
      await fetchAccountAvailableModels(toManagedSiteApiServiceRequest(config)),
  },
}

const veloeraManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  prepareFormData: prepareChannelFormData,
}

const matching: ManagedResourceMatchingCapability<VeloeraConfig> = {
  fetchSecretKey: async (config, ref, options) =>
    veloeraChannelOperations.fetchSecretKey(
      config,
      requireManagedResourceChannelId(SITE_TYPES.VELOERA, config, ref),
      options,
    ),
  hydrateComparableKeys: async (config, candidates, options) => {
    const target = { siteType: SITE_TYPES.VELOERA, config }
    const hydrated = await veloeraChannelOperations.hydrateComparableKeys(
      config,
      toNativeNumericMatchCandidates(candidates, target),
      options,
    )
    return hydrated.map((candidate) =>
      toManagedResourceMatchCandidate(candidate, target),
    )
  },
  search: async (config) =>
    toManagedResourceMatchList(
      await listAllChannels(toManagedSiteApiServiceRequest(config), {
        requireCompleteInventory: true,
      }),
      { siteType: SITE_TYPES.VELOERA, config },
    ),
}

export const veloeraManagedSiteCapabilities = {
  siteType: SITE_TYPES.VELOERA,
  matching,
  models: veloeraManagedResourceModels,
  config: veloeraManagedSiteConfig,
  queries: veloeraManagedSiteQueries,
  channelDrafts: veloeraManagedSiteChannelDrafts,
} satisfies ManagedSiteCapabilities<VeloeraConfig, typeof SITE_TYPES.VELOERA>
