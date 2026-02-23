/**
 * Model Redirect Service
 * Generates model redirect mappings based on channel configurations
 * Based on gpt-api-sync logic with enhancements for weighted channel selection
 */

import { OCTOPUS } from "~/constants/siteType"
import { modelMetadataService } from "~/services/modelMetadata"
import { ModelSyncService } from "~/services/modelSync"
import type { DoneHubConfig } from "~/types/doneHubConfig"
import type { ManagedSiteChannel } from "~/types/managedSite"
import { CHANNEL_STATUS } from "~/types/managedSite"
import {
  ALL_PRESET_STANDARD_MODELS,
  DEFAULT_MODEL_REDIRECT_PREFERENCES,
} from "~/types/managedSiteModelRedirect"
import type { NewApiConfig } from "~/types/newApiConfig"
import type { VeloeraConfig } from "~/types/veloeraConfig"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"
import { getManagedSiteConfig } from "~/utils/managedSite"

import { hasValidManagedSiteConfig } from "../managedSiteService"
import { userPreferences } from "../userPreferences"
import { renameModel } from "./modelNormalization"

/**
 * Unified logger scoped to model redirect generation and application.
 */
const logger = createLogger("ModelRedirect")

export interface ModelRedirectChannelResult {
  channelId: number
  channelName: string
  success: boolean
  skipped?: boolean
  error?: string
}

export interface ModelRedirectBulkClearResult {
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
  private static isEmptyModelMapping(modelMapping: string | null | undefined) {
    const trimmed = (modelMapping ?? "").trim()
    return !trimmed || trimmed === "{}"
  }

  private static async getManagedSiteModelSyncService(): Promise<
    | { ok: true; service: ModelSyncService }
    | { ok: false; errors: string[]; message: string }
  > {
    const prefs = await userPreferences.getPreferences()

    if (!hasValidManagedSiteConfig(prefs)) {
      return {
        ok: false,
        errors: ["Managed site configuration is missing"],
        message: "Managed site configuration is missing",
      }
    }

    const { siteType, config: managedConfig } = getManagedSiteConfig(prefs)

    if (siteType === OCTOPUS) {
      return {
        ok: false,
        errors: ["Model redirect is not supported for Octopus sites"],
        message: "Model redirect is not supported for Octopus sites",
      }
    }

    const legacyConfig = managedConfig as
      | NewApiConfig
      | DoneHubConfig
      | VeloeraConfig

    return {
      ok: true,
      service: new ModelSyncService(
        legacyConfig.baseUrl!,
        legacyConfig.adminToken!,
        legacyConfig.userId!,
        undefined,
        undefined,
        undefined,
        undefined,
        siteType,
      ),
    }
  }

  /**
   * Apply model mapping to a channel with incremental merge
   * Merges new mapping with existing mapping (new keys override old keys)
   * @param channel Target New API channel.
   * @param newMapping Mapping of standard model -> upstream model.
   * @param service ModelSyncService instance used to update channel.
   */
  static async applyModelMappingToChannel(
    channel: ManagedSiteChannel,
    newMapping: Record<string, string>,
    service: ModelSyncService,
  ): Promise<void> {
    if (Object.keys(newMapping).length === 0) {
      return
    }

    // Parse existing model_mapping from channel
    let existingMapping: Record<string, string> = {}
    if (channel.model_mapping) {
      try {
        existingMapping = JSON.parse(channel.model_mapping)
      } catch (parseError) {
        logger.warn("Failed to parse existing model_mapping for channel", {
          channelId: channel.id,
          error: parseError,
        })
      }
    }

    // Merge mappings: new mapping overrides existing keys
    const mergedMapping = {
      ...existingMapping,
      ...newMapping,
    }

    await service.updateChannelModelMapping(channel, mergedMapping)
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
        await ModelRedirectService.getManagedSiteModelSyncService()
      if (!serviceResult.ok) {
        return {
          success: false,
          updatedChannels: 0,
          errors: serviceResult.errors,
          message: serviceResult.message,
        }
      }

      const channelList = await serviceResult.service.listChannels()

      let successCount = 0
      const errors: string[] = []

      for (const channel of channelList.items) {
        // Skip disabled channels
        if (
          channel.status === CHANNEL_STATUS.ManuallyDisabled ||
          channel.status === CHANNEL_STATUS.AutoDisabled
        ) {
          continue
        }

        try {
          const actualModels = channel.models
            ? channel.models
                .split(",")
                .map((m) => m.trim())
                .filter(Boolean)
            : []

          const newMapping =
            ModelRedirectService.generateModelMappingForChannel(
              standardModels,
              actualModels,
            )

          // Use unified method for incremental merge and apply
          await ModelRedirectService.applyModelMappingToChannel(
            channel,
            newMapping,
            serviceResult.service,
          )
          successCount += 1
        } catch (error) {
          errors.push(
            `Channel ${channel.name} (${channel.id}): ${(error as Error).message || "Unknown error"}`,
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
      return {
        success: false,
        updatedChannels: 0,
        errors: [
          error instanceof Error ? error.message : "Failed to apply redirect",
        ],
      }
    }
  }

  /**
   * List managed-site channels for preview/selection flows.
   * @returns Success flag with channel list and error messages suitable for UI.
   */
  static async listManagedSiteChannels(): Promise<{
    success: boolean
    channels: ManagedSiteChannel[]
    errors: string[]
    message?: string
  }> {
    try {
      const serviceResult =
        await ModelRedirectService.getManagedSiteModelSyncService()
      if (!serviceResult.ok) {
        return {
          success: false,
          channels: [],
          errors: serviceResult.errors,
          message: serviceResult.message,
        }
      }

      const channelList = await serviceResult.service.listChannels()

      return {
        success: true,
        channels: channelList.items ?? [],
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
   * @param channelIds Channel IDs selected in the current managed-site context.
   * @returns Bulk operation summary with per-channel results.
   */
  static async clearChannelModelMappings(
    channelIds: number[],
  ): Promise<ModelRedirectBulkClearResult> {
    try {
      if (!channelIds.length) {
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
        await ModelRedirectService.getManagedSiteModelSyncService()
      if (!serviceResult.ok) {
        return {
          success: false,
          totalSelected: channelIds.length,
          clearedChannels: 0,
          skippedChannels: 0,
          failedChannels: channelIds.length,
          results: channelIds.map((channelId) => ({
            channelId,
            channelName: `#${channelId}`,
            success: false,
            error: serviceResult.message,
          })),
          errors: serviceResult.errors,
          message: serviceResult.message,
        }
      }

      const channelList = await serviceResult.service.listChannels()
      const channelsById = new Map<number, ManagedSiteChannel>(
        (channelList.items ?? []).map((channel) => [channel.id, channel]),
      )

      const results: ModelRedirectChannelResult[] = []

      for (const channelId of channelIds) {
        const channel = channelsById.get(channelId)
        if (!channel) {
          results.push({
            channelId,
            channelName: `#${channelId}`,
            success: false,
            error: "Channel not found",
          })
          continue
        }

        if (ModelRedirectService.isEmptyModelMapping(channel.model_mapping)) {
          results.push({
            channelId,
            channelName: channel.name,
            success: true,
            skipped: true,
          })
          continue
        }

        try {
          await serviceResult.service.updateChannelModelMapping(channel, {})
          results.push({
            channelId,
            channelName: channel.name,
            success: true,
          })
        } catch (error) {
          results.push({
            channelId,
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
            `Channel ${r.channelName} (${r.channelId}): ${r.error || "Unknown error"}`,
        )

      return {
        success: failedChannels === 0,
        totalSelected: channelIds.length,
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
        totalSelected: channelIds.length,
        clearedChannels: 0,
        skippedChannels: 0,
        failedChannels: channelIds.length,
        results: channelIds.map((channelId) => ({
          channelId,
          channelName: `#${channelId}`,
          success: false,
          error: message,
        })),
        errors: [message],
        message,
      }
    }
  }

  /**
   * Build a version-agnostic comparison key by:
   * - Lowercasing
   * - Treating dots and hyphens/underscores as the same separator
   * - Comparing as an unordered token set to align variants like
   *   "claude-4.5-sonnet" and "claude-sonnet-4-5".
   */
  static toVersionAgnosticKey = (modelName: string): string | null => {
    const cleaned = modelName.replace(/\./g, "-")
    const tokens = cleaned.split(/[-_]/).map((t) => t.trim().toLowerCase())
    const validTokens = tokens.filter(Boolean)
    if (validTokens.length === 0) return null
    return validTokens.sort().join("-")
  }

  /**
   * Generate model mapping for a single channel
   * Returns an object of standardModel -> actualModel mappings
   * Uses multi-stage extraction pipeline with deduplication
   * @param standardModels List of canonical standard model ids.
   * @param actualModels Models exposed by the channel (raw).
   * @returns Mapping of standard model id to best-matching actual model.
   */
  static generateModelMappingForChannel(
    standardModels: string[],
    actualModels: string[],
  ): Record<string, string> {
    const mapping: Record<string, string> = {}
    const usedActualModels = new Set<string>()
    const actualModelSet = new Set<string>()

    const normalizedActualMap = new Map<string, string[]>()
    const versionKeyToActualMap = new Map<string, string[]>()

    // traverse actual models to build lookup maps
    for (const rawActual of actualModels) {
      const actualModel = rawActual.trim()
      if (!actualModel) continue
      actualModelSet.add(actualModel)

      // Normalize actual model name
      const normalizedModelName = renameModel(actualModel, false)?.trim()
      if (!normalizedModelName) continue

      // Build normalized map for deduplication
      if (!normalizedActualMap.has(normalizedModelName)) {
        normalizedActualMap.set(normalizedModelName, [])
      }
      normalizedActualMap.get(normalizedModelName)!.push(actualModel)

      // Build version-agnostic map for fuzzy matching
      const versionKey =
        ModelRedirectService.toVersionAgnosticKey(normalizedModelName)
      if (versionKey) {
        if (!versionKeyToActualMap.has(versionKey)) {
          versionKeyToActualMap.set(versionKey, [])
        }
        versionKeyToActualMap.get(versionKey)!.push(actualModel)
      }
    }

    // Match standard models to actual models
    for (const rawStandard of standardModels) {
      const standardModel = rawStandard.trim()
      if (!standardModel) continue

      // Skip if already mapped or exact match
      if (actualModelSet.has(standardModel)) {
        continue
      }
      if (mapping[standardModel]) {
        continue
      }

      // normalize standard model name
      const normalizedStandardModelName = renameModel(
        standardModel,
        false,
      )?.trim()
      if (!normalizedStandardModelName) continue

      // Find candidates from both normalized and version-agnostic maps
      const candidates = normalizedActualMap.get(normalizedStandardModelName)
      const versionKey = ModelRedirectService.toVersionAgnosticKey(
        normalizedStandardModelName,
      )
      const versionCandidates =
        versionKey && versionKeyToActualMap.get(versionKey)

      // Filter out already used actual models
      const availableCandidate = [
        ...(candidates ?? []),
        ...(versionCandidates ?? []),
      ].find((candidate) => !usedActualModels.has(candidate))

      // Map the standard model to the first available candidate
      if (availableCandidate) {
        mapping[standardModel] = availableCandidate
        usedActualModels.add(availableCandidate)
      }
    }

    return mapping
  }
}
