import { SITE_TYPES } from "~/constants/siteType"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { NewApiChannelKeyResource } from "~/services/protectionBypass/contracts"

import { resolveManagedSiteRuntimeConfigForType } from "../runtimeConfig"

/** Confirms a New API session read still targets the configured site and channel. */
export async function validateNewApiSessionReadResource(
  resource: NewApiChannelKeyResource,
): Promise<boolean> {
  try {
    const { getManagedSiteServiceForType } = await import(
      "../managedSiteService"
    )
    const preferences = await userPreferences.getPreferencesStrict()
    const runtimeConfig = resolveManagedSiteRuntimeConfigForType(
      preferences,
      SITE_TYPES.NEW_API,
    )
    if (
      !runtimeConfig ||
      new URL(runtimeConfig.config.baseUrl).origin !== resource.origin ||
      runtimeConfig.config.userId.trim() !== resource.userId
    ) {
      return false
    }

    const channels = await getManagedSiteServiceForType(
      SITE_TYPES.NEW_API,
    ).searchChannel(runtimeConfig.config, String(resource.channelId))
    return Boolean(
      channels?.items?.some((channel) => channel.id === resource.channelId),
    )
  } catch {
    return false
  }
}
