import { SITE_TYPES } from "~/constants/siteType"
import {
  areManagedResourceRefsEqual,
  createManagedChannelResourceRef,
} from "~/services/managedSites/managedResourceIdentity"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { NewApiChannelKeyResource } from "~/services/protectionBypass/contracts"

import { resolveManagedSiteRuntimeConfigForType } from "../runtimeConfig"

export const NEW_API_RESOURCE_VALIDATION_TIMEOUT_MS = 10_000

const withResourceValidationTimeout = async <T>(task: Promise<T>) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("New API resource validation timed out")),
      NEW_API_RESOURCE_VALIDATION_TIMEOUT_MS,
    )
  })
  try {
    return await Promise.race([task, timeout])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

/** Confirms a New API session read still targets the configured site and channel. */
export async function validateNewApiSessionReadResource(
  resource: NewApiChannelKeyResource,
): Promise<boolean> {
  try {
    // Keep the full managed-site registry lazy in the background bundle; only
    // resource-bound New API tasks need this provider lookup.
    const { getManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/registry"
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

    const channels = await withResourceValidationTimeout(
      getManagedSiteCapabilities(SITE_TYPES.NEW_API).matching.search(
        runtimeConfig.config,
        String(resource.channelId),
      ),
    )
    return Boolean(
      channels?.items?.some((channel) =>
        areManagedResourceRefsEqual(
          channel.ref,
          createManagedChannelResourceRef(
            SITE_TYPES.NEW_API,
            runtimeConfig.config.baseUrl,
            resource.channelId,
          ),
        ),
      ),
    )
  } catch {
    return false
  }
}
