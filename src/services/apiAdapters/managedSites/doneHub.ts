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
import { createNewApiKeyManagement } from "~/services/apiAdapters/newApi/keyManagement"
import {
  fetchSiteUserGroups,
  searchChannel,
} from "~/services/apiService/doneHub"
import {
  checkValidDoneHubConfig,
  prepareChannelFormData,
} from "~/services/managedSites/providers/doneHubService"
import type { DoneHubConfig } from "~/types/doneHubConfig"

import {
  doneHubChannelOperations,
  doneHubManagedResourceModels,
} from "../managedResources/doneHubOperations"
import { createManagedSiteConfigCapability } from "./config"
import { toManagedSiteApiServiceRequest } from "./request"

const doneHubManagedSiteConfig: ManagedSiteConfigCapability<DoneHubConfig> =
  createManagedSiteConfigCapability(
    SITE_TYPES.DONE_HUB,
    checkValidDoneHubConfig,
  )

const doneHubKeyManagement = createNewApiKeyManagement(SITE_TYPES.DONE_HUB)

const doneHubManagedSiteQueries: ManagedSiteQueriesCapability<DoneHubConfig> = {
  siteUserGroups: {
    fetch: async (config) =>
      await fetchSiteUserGroups(toManagedSiteApiServiceRequest(config)),
  },
  accountAvailableModels: {
    fetch: async (config) =>
      await doneHubKeyManagement.fetchAvailableModels(
        toManagedSiteApiServiceRequest(config),
      ),
  },
}

const doneHubManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  prepareFormData: prepareChannelFormData,
}

const matching: ManagedResourceMatchingCapability<DoneHubConfig> = {
  fetchSecretKey: async (config, ref) =>
    doneHubChannelOperations.fetchSecretKey(
      config,
      requireManagedResourceChannelId(SITE_TYPES.DONE_HUB, config, ref),
    ),
  hydrateComparableKeys: async (config, candidates) => {
    const target = { siteType: SITE_TYPES.DONE_HUB, config }
    const hydrated = await doneHubChannelOperations.hydrateComparableKeys(
      config,
      toNativeNumericMatchCandidates(candidates, target),
    )
    return hydrated.map((candidate) =>
      toManagedResourceMatchCandidate(candidate, target),
    )
  },
  search: async (config, keyword) =>
    toManagedResourceMatchList(
      await searchChannel(toManagedSiteApiServiceRequest(config), keyword),
      { siteType: SITE_TYPES.DONE_HUB, config },
    ),
}

export const doneHubManagedSiteCapabilities = {
  siteType: SITE_TYPES.DONE_HUB,
  matching,
  models: doneHubManagedResourceModels,
  config: doneHubManagedSiteConfig,
  queries: doneHubManagedSiteQueries,
  channelDrafts: doneHubManagedSiteChannelDrafts,
} satisfies ManagedSiteCapabilities<DoneHubConfig, typeof SITE_TYPES.DONE_HUB>
