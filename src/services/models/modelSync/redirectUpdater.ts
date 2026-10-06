import type { ManagedSiteType } from "~/constants/siteType"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { getManagedResourceRefKey } from "~/services/managedSites/managedResourceIdentity"
import { ModelRedirectService } from "~/services/models/modelRedirect"
import type { ManagedModelChannel } from "~/types/managedResourceModels"
import type { ModelRedirectPreferences } from "~/types/managedSiteModelRedirect"
import { ALL_PRESET_STANDARD_MODELS } from "~/types/managedSiteModelRedirect"
import { type ExecutionItemResult } from "~/types/managedSiteModelSync"
import { createLogger } from "~/utils/core/logger"

import { type ModelSyncService } from "./modelSyncService"

const logger = createLogger("ManagedSiteModelSync")

/** Apply and count redirect updates for one captured sync target. */
export function createModelSyncRedirectUpdater({
  allChannels,
  service,
  siteType,
  modelRedirectConfig,
}: {
  allChannels: ManagedModelChannel[]
  service: ModelSyncService
  siteType: ManagedSiteType
  modelRedirectConfig: ModelRedirectPreferences
}) {
  const standardModels =
    modelRedirectConfig.standardModels.length > 0
      ? modelRedirectConfig.standardModels
      : ALL_PRESET_STANDARD_MODELS
  let mappingSuccessCount = 0
  let mappingErrorCount = 0
  return {
    async applySuccessfulResult(lastResult: ExecutionItemResult) {
      // Generate and apply model redirect mapping immediately after successful sync
      if (modelRedirectConfig.enabled && standardModels.length > 0) {
        try {
          // Find the channel that was just synced
          const channel = allChannels.find(
            (c) =>
              getManagedResourceRefKey(c.ref) ===
              getManagedResourceRefKey(lastResult.resourceRef),
          )
          if (!channel) {
            logger.warn("Channel not found", {
              resourceRef: lastResult.resourceRef,
            })
          } else {
            const actualModels = lastResult.newModels || []

            const oldModelsSet = new Set(
              (lastResult.oldModels ?? [])
                .map((model) => model.trim())
                .filter(Boolean),
            )
            const newModelsSet = new Set(
              (lastResult.newModels ?? [])
                .map((model) => model.trim())
                .filter(Boolean),
            )
            const modelsChanged =
              oldModelsSet.size !== newModelsSet.size ||
              Array.from(oldModelsSet).some((model) => !newModelsSet.has(model))

            const newMapping =
              ModelRedirectService.generateModelMappingForChannel(
                standardModels,
                actualModels,
              )

            // Use unified method for incremental merge and apply
            const shouldPruneMissingTargetsOnSync =
              modelRedirectConfig.pruneMissingTargetsOnModelSync &&
              modelsChanged &&
              newModelsSet.size > 0

            const { prunedCount, updated } =
              await ModelRedirectService.applyModelMappingToChannel(
                channel,
                newMapping,
                service,
                shouldPruneMissingTargetsOnSync
                  ? {
                      pruneMissingTargets: true,
                      availableModels: actualModels,
                      modelMappingPolicy:
                        getSiteTypeCapabilities(siteType).managedSites?.models
                          ?.modelMappingPolicy,
                    }
                  : undefined,
              )
            mappingSuccessCount++
            logger.info("Applied model redirects to channel", {
              resourceRef: channel.ref,
              channelName: channel.name,
              mappingCount: Object.keys(newMapping).length,
              modelsChanged,
              pruneMissingTargetsOnModelSync: shouldPruneMissingTargetsOnSync,
              prunedCount,
              updated,
            })
          }
        } catch (error) {
          logger.error("Failed to apply mapping for channel", {
            resourceRef: lastResult.resourceRef,
            channelName: lastResult.channelName,
            error,
          })
          mappingErrorCount++
        }
      }
    },
    logSummary() {
      if (modelRedirectConfig.enabled && standardModels.length > 0) {
        logger.info("Model redirect mappings applied", {
          succeeded: mappingSuccessCount,
          failed: mappingErrorCount,
        })
      }
    },
  }
}
