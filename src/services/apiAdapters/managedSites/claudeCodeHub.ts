import { SITE_TYPES } from "~/constants/siteType"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
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
  listChannels,
  prepareChannelFormData,
  searchChannel,
  updateChannel,
} from "~/services/managedSites/providers/claudeCodeHub"
import type { ClaudeCodeHubConfig } from "~/types/claudeCodeHubConfig"

import { createManagedSiteConfigCapability } from "./config"
import { emptyManagedSiteQueries } from "./unsupportedQueries"

export const claudeCodeHubManagedSiteChannels: ManagedSiteChannelsCapability<ClaudeCodeHubConfig> =
  {
    search: searchChannel,
    list: listChannels,
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
  queries: emptyManagedSiteQueries,
  channelDrafts: claudeCodeHubManagedSiteChannelDrafts,
}
