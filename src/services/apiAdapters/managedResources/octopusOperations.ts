import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceModelsCapability } from "~/services/apiAdapters/contracts/managedResourceModels"
import type { ManagedSiteChannelRequestOptions } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { requireManagedResourceChannelId } from "~/services/apiAdapters/managedResources/resourceIds"
import { updateChannel as updateOctopusChannel } from "~/services/apiService/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"

import {
  octopusChannelEffect,
  runOctopusMutation,
} from "../managedSites/octopusMutation"

export const octopusManagedResourceModels = {
  updateModels: async (
    config,
    ref,
    models,
    options?: ManagedSiteChannelRequestOptions,
  ) => {
    const channelId = requireManagedResourceChannelId(
      SITE_TYPES.OCTOPUS,
      config,
      ref,
    )
    return await runOctopusMutation<unknown, void>({
      effect: octopusChannelEffect("models-updated", channelId),
      execute: async () => {
        const payload = {
          id: channelId,
          model: models.join(","),
        }
        return options
          ? await updateOctopusChannel(config, payload, {
              signal: options.signal,
              ...(options.protectionBypassExecution
                ? {
                    protectionBypassExecution:
                      options.protectionBypassExecution,
                  }
                : {}),
            })
          : await updateOctopusChannel(config, payload)
      },
      successData: () => undefined,
    })
  },
} satisfies ManagedResourceModelsCapability<OctopusConfig>
