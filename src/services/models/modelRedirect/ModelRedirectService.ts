/**
 * Model Redirect Service
 * Generates model redirect mappings based on channel configurations
 * Based on gpt-api-sync logic with enhancements for weighted channel selection
 */

import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ManagedSiteRuntimeConfig } from "~/services/managedSites/configuration/runtimeConfig"
import {
  hasValidManagedSiteConfig,
  resolveCurrentManagedSiteRuntimeConfig,
} from "~/services/managedSites/configuration/runtimeConfig"
import {
  assertManagedResourceRefForSite,
  getManagedResourceRefKey,
} from "~/services/managedSites/managedResourceIdentity"
import { modelMetadataService } from "~/services/models/modelMetadata"
import { type UserPreferences } from "~/services/preferences/preferencesSchema"
import type {
  ManagedModelChannel,
  ManagedModelMappingPreview,
} from "~/types/managedResourceModels"
import {
  ALL_PRESET_STANDARD_MODELS,
  DEFAULT_MODEL_REDIRECT_PREFERENCES,
} from "~/types/managedSiteModelRedirect"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { userPreferences } from "../../preferences/userPreferences"
import { resolveManagedSiteModelRedirectCapabilities } from "./capabilities"
import {
  applyModelMappingToChannel,
  consumeModelRedirectMutationResult,
  DirectModelRedirectMappingWriter,
  type ModelRedirectChannelCapabilities,
  type ModelRedirectMappingWriter,
} from "./mappingMutation"
import { generateModelMappingForChannel } from "./modelMatching"
import { isEmptyModelMapping } from "./utils"

/**
 * Unified logger scoped to model redirect generation and application.
 */
const logger = createLogger("ModelRedirect")

interface ModelRedirectChannelResult {
  resourceRef: ManagedResourceRef
  channelName: string
  success: boolean
  skipped?: boolean
  error?: string
}

interface ModelRedirectBulkClearResult {
  success: boolean
  totalSelected: number
  clearedChannels: number
  skippedChannels: number
  failedChannels: number
  results: ModelRedirectChannelResult[]
  errors: string[]
  message?: string
}

/**
 * Model Redirect Service
 * Core algorithm for generating model redirect mappings
 */
export class ModelRedirectService {
  /**
   * Resolve the direct managed-site channel capability for redirect operations.
   * When `prefs` is provided, avoids an extra storage read.
   */
  private static async getManagedSiteModelRedirectContext(
    prefs?: UserPreferences,
  ): Promise<
    | {
        ok: true
        runtimeConfig: ManagedSiteRuntimeConfig
        channels: ModelRedirectChannelCapabilities
      }
    | { ok: false; errors: string[]; message: string }
  > {
    const resolvedPrefs = prefs ?? (await userPreferences.getPreferences())

    if (!resolvedPrefs) {
      return {
        ok: false,
        errors: ["Managed site configuration is missing"],
        message: "Managed site configuration is missing",
      }
    }

    const runtimeConfig = resolveCurrentManagedSiteRuntimeConfig(resolvedPrefs)

    if (!runtimeConfig) {
      return {
        ok: false,
        errors: ["Managed site configuration is missing"],
        message: "Managed site configuration is missing",
      }
    }

    const resolution = resolveManagedSiteModelRedirectCapabilities(
      runtimeConfig.siteType,
    )
    if (!resolution.supported) {
      return {
        ok: false,
        errors: ["Model redirect is not supported for this managed site"],
        message: "Model redirect is not supported for this managed site",
      }
    }

    return {
      ok: true,
      runtimeConfig,
      channels: resolution.capabilities,
    }
  }

  private static async listChannels(
    runtimeConfig: ManagedSiteRuntimeConfig,
    channels: ModelRedirectChannelCapabilities,
  ) {
    const result = await channels.list(runtimeConfig.config)
    for (const channel of result.items) {
      assertManagedResourceRefForSite(channel.ref, runtimeConfig)
    }
    return result
  }

  private static createModelMappingWriter(
    runtimeConfig: ManagedSiteRuntimeConfig,
    channels: ModelRedirectChannelCapabilities,
  ): ModelRedirectMappingWriter {
    return new DirectModelRedirectMappingWriter(runtimeConfig, channels)
  }

  /**
   * Run model redirect generation and apply mappings directly
   * @returns Summary with success flag, count of updated channels, errors, and optional message.
   */
  static async applyModelRedirect(): Promise<{
    success: boolean
    updatedChannels: number
    errors: string[]
    message?: string
  }> {
    try {
      const prefs = await userPreferences.getPreferences()

      if (!hasValidManagedSiteConfig(prefs)) {
        return {
          success: false,
          updatedChannels: 0,
          errors: ["Managed site configuration is missing"],
          message: "Managed site configuration is missing",
        }
      }

      const modelRedirectPrefs = Object.assign(
        {},
        DEFAULT_MODEL_REDIRECT_PREFERENCES,
        prefs.modelRedirect,
      )

      if (!modelRedirectPrefs.enabled) {
        return {
          success: false,
          updatedChannels: 0,
          errors: ["Model redirect feature is disabled"],
          message: "Model redirect feature is disabled",
        }
      }

      const standardModels = modelRedirectPrefs.standardModels.length
        ? modelRedirectPrefs.standardModels
        : ALL_PRESET_STANDARD_MODELS

      await modelMetadataService.initialize().catch((error) => {
        logger.warn("Failed to initialize metadata", error)
      })

      const serviceResult =
        await ModelRedirectService.getManagedSiteModelRedirectContext(prefs)
      if (!serviceResult.ok) {
        return {
          success: false,
          updatedChannels: 0,
          errors: serviceResult.errors,
          message: serviceResult.message,
        }
      }

      const channelList = await ModelRedirectService.listChannels(
        serviceResult.runtimeConfig,
        serviceResult.channels,
      )
      const modelMappingWriter = ModelRedirectService.createModelMappingWriter(
        serviceResult.runtimeConfig,
        serviceResult.channels,
      )

      let successCount = 0
      const errors: string[] = []

      for (const channel of channelList.items) {
        // Skip disabled channels
        if (channel.disabled) {
          continue
        }

        try {
          const newMapping = generateModelMappingForChannel(
            standardModels,
            channel.models,
          )

          // Use unified method for incremental merge and apply
          await applyModelMappingToChannel(
            channel,
            newMapping,
            modelMappingWriter,
          )
          successCount += 1
        } catch (error) {
          errors.push(
            `Channel ${channel.name} (${channel.ref.resourceId}): ${getErrorMessage(error)}`,
          )
        }
      }

      return {
        success: errors.length === 0,
        updatedChannels: successCount,
        errors,
      }
    } catch (error) {
      logger.error("Failed to apply redirect", error)
      const message = getErrorMessage(error)
      return {
        success: false,
        updatedChannels: 0,
        errors: [message],
        message,
      }
    }
  }

  /**
   * List managed-site channels for preview/selection flows.
   * @returns Success flag with channel list and error messages suitable for UI.
   */
  static async listManagedSiteChannels(): Promise<{
    success: boolean
    channels: ManagedModelMappingPreview[]
    errors: string[]
    message?: string
  }> {
    try {
      const serviceResult =
        await ModelRedirectService.getManagedSiteModelRedirectContext()
      if (!serviceResult.ok) {
        return {
          success: false,
          channels: [],
          errors: serviceResult.errors,
          message: serviceResult.message,
        }
      }

      const channelList = await ModelRedirectService.listChannels(
        serviceResult.runtimeConfig,
        serviceResult.channels,
      )

      return {
        success: true,
        channels: channelList.items.map(({ ref, name, modelMapping }) => ({
          ref,
          name,
          modelMapping,
        })),
        errors: [],
      }
    } catch (error) {
      logger.error("Failed to list channels for bulk clear preview", error)
      const message = getErrorMessage(error)
      return {
        success: false,
        channels: [],
        errors: [message],
        message,
      }
    }
  }

  /**
   * Clear channel model redirect mappings by writing an empty object to `model_mapping`.
   * @param resourceRefs Complete identities selected in the current managed-site context.
   * @returns Bulk operation summary with per-channel results.
   */
  static async clearChannelModelMappings(
    resourceRefs: ManagedResourceRef[],
  ): Promise<ModelRedirectBulkClearResult> {
    try {
      if (!resourceRefs.length) {
        return {
          success: false,
          totalSelected: 0,
          clearedChannels: 0,
          skippedChannels: 0,
          failedChannels: 0,
          results: [],
          errors: ["No channels selected"],
          message: "No channels selected",
        }
      }

      const serviceResult =
        await ModelRedirectService.getManagedSiteModelRedirectContext()
      if (!serviceResult.ok) {
        return {
          success: false,
          totalSelected: resourceRefs.length,
          clearedChannels: 0,
          skippedChannels: 0,
          failedChannels: resourceRefs.length,
          results: resourceRefs.map((resourceRef) => ({
            resourceRef,
            channelName: `#${resourceRef.resourceId}`,
            success: false,
            error: serviceResult.message,
          })),
          errors: serviceResult.errors,
          message: serviceResult.message,
        }
      }

      for (const ref of resourceRefs)
        assertManagedResourceRefForSite(ref, serviceResult.runtimeConfig)

      const channelList = await ModelRedirectService.listChannels(
        serviceResult.runtimeConfig,
        serviceResult.channels,
      )
      const modelMappingWriter = ModelRedirectService.createModelMappingWriter(
        serviceResult.runtimeConfig,
        serviceResult.channels,
      )
      const channelsByKey = new Map<string, ManagedModelChannel>(
        (channelList.items ?? []).map((channel) => [
          getManagedResourceRefKey(channel.ref),
          channel,
        ]),
      )

      const results: ModelRedirectChannelResult[] = []

      for (const resourceRef of resourceRefs) {
        const channel = channelsByKey.get(getManagedResourceRefKey(resourceRef))
        if (!channel) {
          results.push({
            resourceRef,
            channelName: `#${resourceRef.resourceId}`,
            success: false,
            error: "Channel not found",
          })
          continue
        }

        if (isEmptyModelMapping(channel.modelMapping)) {
          results.push({
            resourceRef,
            channelName: channel.name,
            success: true,
            skipped: true,
          })
          continue
        }

        try {
          const mutationResult =
            await modelMappingWriter.updateChannelModelMapping(channel, {})
          await consumeModelRedirectMutationResult(
            mutationResult,
            () =>
              modelMappingWriter.reconcileChannel?.(channel) ??
              Promise.resolve(),
            modelMappingWriter.knownSecrets ?? [],
            modelMappingWriter.knownSecretsComplete,
          )
          results.push({
            resourceRef,
            channelName: channel.name,
            success: true,
          })
        } catch (error) {
          results.push({
            resourceRef,
            channelName: channel.name,
            success: false,
            error: getErrorMessage(error),
          })
        }
      }

      const clearedChannels = results.filter(
        (r) => r.success && !r.skipped,
      ).length
      const skippedChannels = results.filter(
        (r) => r.success && r.skipped,
      ).length
      const failedChannels = results.length - clearedChannels - skippedChannels
      const errors = results
        .filter((r) => !r.success)
        .map(
          (r) =>
            `Channel ${r.channelName} (${r.resourceRef.resourceId}): ${r.error || "Unknown error"}`,
        )

      return {
        success: failedChannels === 0,
        totalSelected: resourceRefs.length,
        clearedChannels,
        skippedChannels,
        failedChannels,
        results,
        errors,
      }
    } catch (error) {
      logger.error("Failed to bulk clear channel model mappings", error)
      const message = getErrorMessage(error)
      return {
        success: false,
        totalSelected: resourceRefs.length,
        clearedChannels: 0,
        skippedChannels: 0,
        failedChannels: resourceRefs.length,
        results: resourceRefs.map((resourceRef) => ({
          resourceRef,
          channelName: `#${resourceRef.resourceId}`,
          success: false,
          error: message,
        })),
        errors: [message],
        message,
      }
    }
  }
}
