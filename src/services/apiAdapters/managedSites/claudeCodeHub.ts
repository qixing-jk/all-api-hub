import { SITE_TYPES } from "~/constants/siteType"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
  ManagedSiteQueriesCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  buildChannelName,
  buildChannelPayload,
  checkValidClaudeCodeHubConfig,
  createChannel,
  deleteChannel,
  fetchAvailableModels,
  fetchChannelSecretKey,
  hydrateComparableChannelKeys,
  prepareChannelFormData,
  searchChannel,
  updateChannel,
} from "~/services/managedSites/providers/claudeCodeHub"
import type { ClaudeCodeHubConfig } from "~/types/claudeCodeHubConfig"

import { createManagedSiteConfigCapability } from "./config"

export const claudeCodeHubManagedSiteChannels: ManagedSiteChannelsCapability<ClaudeCodeHubConfig> =
  {
    search: searchChannel,
    create: createChannel,
    update: updateChannel,
    delete: deleteChannel,
    fetchSecretKey: fetchChannelSecretKey,
    hydrateComparableKeys: hydrateComparableChannelKeys,
  }

const claudeCodeHubManagedSiteConfig: ManagedSiteConfigCapability<ClaudeCodeHubConfig> =
  createManagedSiteConfigCapability(
    SITE_TYPES.CLAUDE_CODE_HUB,
    checkValidClaudeCodeHubConfig,
  )

const claudeCodeHubManagedSiteQueries: ManagedSiteQueriesCapability<ClaudeCodeHubConfig> =
  {
    fetchSiteUserGroups: async () => [],
    fetchAccountAvailableModels: async () => [],
  }

const claudeCodeHubManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability =
  {
    fetchAvailableModels,
    buildName: buildChannelName,
    prepareFormData: prepareChannelFormData,
    buildPayload: buildChannelPayload,
  }

export const claudeCodeHubManagedSiteCapabilities = {
  channels: claudeCodeHubManagedSiteChannels,
  config: claudeCodeHubManagedSiteConfig,
  queries: claudeCodeHubManagedSiteQueries,
  channelDrafts: claudeCodeHubManagedSiteChannelDrafts,
}
