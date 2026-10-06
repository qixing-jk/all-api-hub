import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceModelsCapability } from "~/services/apiAdapters/contracts/managedResourceModels"
import type { ManagedSiteChannelRequestOptions } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { createChannelVerificationProtocolResolver } from "~/services/apiAdapters/managedResources/modelInputs"
import { requireManagedResourceChannelId } from "~/services/apiAdapters/managedResources/resourceIds"
import { updateChannel as updateOctopusChannel } from "~/services/apiService/octopus"
import { API_TYPES } from "~/services/verification/aiApiVerification/types"
import { OctopusOutboundType } from "~/types/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"

import {
  octopusChannelEffect,
  runOctopusMutation,
} from "../managedSites/octopusMutation"

export const octopusManagedResourceModels = {
  // https://github.com/bestruirui/octopus: outbound types distinguish Chat Completions,
  // Responses, Anthropic and Gemini; embeddings do not support chat probes.
  resolveVerificationProtocol: createChannelVerificationProtocolResolver({
    [OctopusOutboundType.OpenAIChat]: API_TYPES.OPENAI_COMPATIBLE,
    [OctopusOutboundType.OpenAIResponse]: API_TYPES.OPENAI,
    [OctopusOutboundType.Anthropic]: API_TYPES.ANTHROPIC,
    [OctopusOutboundType.Gemini]: API_TYPES.GOOGLE,
    [OctopusOutboundType.Volcengine]: API_TYPES.OPENAI_COMPATIBLE,
  }),
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
