/**
 * Model Redirect Service
 * Generates model redirect mappings based on channel configurations
 * Based on gpt-api-sync logic with enhancements for weighted channel selection
 */

import {
  DONE_HUB,
  NEW_API,
  OCTOPUS,
  type ManagedSiteType,
} from "~/constants/siteType"
import { modelMetadataService } from "~/services/models/modelMetadata"
import { ModelSyncService } from "~/services/models/modelSync"
import type { ManagedSiteChannel } from "~/types/managedSite"
import { CHANNEL_STATUS } from "~/types/managedSite"
import {
  ALL_PRESET_STANDARD_MODELS,
  DEFAULT_MODEL_REDIRECT_PREFERENCES,
} from "~/types/managedSiteModelRedirect"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"
import {
  getManagedSiteAdminConfig,
  getManagedSiteConfig,
} from "~/utils/managedSite"
import { toModelTokenKey } from "~/utils/modelName"

import { hasValidManagedSiteConfig } from "../../managedSites/managedSiteService"
import { userPreferences, type UserPreferences } from "../../userPreferences"
import { extractActualModel, renameModel } from "./modelNormalization"
import { isEmptyModelMapping } from "./utils"

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
  private static areModelMappingsEqual(
    left: Record<string, unknown>,
    right: Record<string, unknown>,
  ): boolean {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) return false

    for (const key of leftKeys) {
      if (left[key] !== right[key]) return false
    }

    return true
  }

  private static pruneModelMappingMissingTargets(
    existingMapping: Record<string, unknown>,
    availableModels: ReadonlySet<string>,
    options?: {
      siteType?: ManagedSiteType
    },
  ): { prunedMapping: Record<string, unknown>; removedCount: number } {
    let removedCount = 0
    const prunedMapping: Record<string, unknown> = {}

    const siteType = options?.siteType
    const supportsChainedMapping = siteType === NEW_API
    const supportsBillingPrefix = siteType === DONE_HUB

    const normalizeTargetForAvailability = (targetModel: string): string => {
      const trimmed = targetModel.trim()
      if (supportsBillingPrefix && trimmed.startsWith("+")) {
        return trimmed.slice(1).trim()
      }
      return trimmed
    }

    const resolvesToAvailableModel = (startModel: string): boolean => {
      let current = startModel
      const visited = new Set<string>([current])

      while (true) {
        if (availableModels.has(current)) return true

        const nextRaw = existingMapping[current]
        if (typeof nextRaw !== "string") return false

        const next = normalizeTargetForAvailability(nextRaw)
        if (!next) return false

        if (visited.has(next)) return false
        visited.add(next)
        current = next
      }
    }

    for (const [sourceModel, targetModel] of Object.entries(existingMapping)) {
      if (typeof targetModel !== "string") {
        prunedMapping[sourceModel] = targetModel
        continue
      }

      const normalizedTarget = normalizeTargetForAvailability(targetModel)
      const isAvailable =
        Boolean(normalizedTarget) &&
        (availableModels.has(normalizedTarget) ||
          (supportsChainedMapping &&
            resolvesToAvailableModel(normalizedTarget)))

      if (!isAvailable) {
        removedCount += 1
        continue
      }

      prunedMapping[sourceModel] = targetModel
    }

    return { prunedMapping, removedCount }
  }

  /**
   * Build a managed-site `ModelSyncService` for the current preferences.
   * When `prefs` is provided, avoids an extra storage read.
   */
  private static async getManagedSiteModelSyncService(
    prefs?: UserPreferences,
  ): Promise<
    | { ok: true; service: ModelSyncService }
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

    const { siteType } = getManagedSiteConfig(resolvedPrefs)

    if (siteType === OCTOPUS) {
      return {
        ok: false,
        errors: ["Model redirect is not supported for Octopus sites"],
        message: "Model redirect is not supported for Octopus sites",
      }
    }

    const adminConfig = getManagedSiteAdminConfig(resolvedPrefs)
    if (!adminConfig) {
      return {
        ok: false,
        errors: ["Managed site configuration is missing"],
        message: "Managed site configuration is missing",
      }
    }

    return {
      ok: true,
      service: new ModelSyncService(
        adminConfig.baseUrl,
        adminConfig.adminToken,
        adminConfig.userId,
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
    options?: {
      availableModels?: string[]
      pruneMissingTargets?: boolean
      siteType?: ManagedSiteType
    },
  ): Promise<{ updated: boolean; prunedCount: number }> {
    const hasNewMapping = Object.keys(newMapping).length > 0
    const shouldPrune =
      Boolean(options?.pruneMissingTargets) &&
      Array.isArray(options?.availableModels)

    if (!hasNewMapping && !shouldPrune) {
      return { updated: false, prunedCount: 0 }
    }

    // Parse existing model_mapping from channel
    let existingMapping: Record<string, unknown> = {}
    let canPruneExisting = true

    const rawExisting = channel.model_mapping
    if (rawExisting) {
      try {
        const parsed = JSON.parse(rawExisting) as unknown
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("existing model_mapping is not an object")
        }
        existingMapping = parsed as Record<string, unknown>
      } catch (parseError) {
        canPruneExisting = false
        logger.warn("Failed to parse existing model_mapping for channel", {
          channelId: channel.id,
          error: parseError,
        })
      }
    }

    let prunedCount = 0
    let baseMapping: Record<string, unknown> = existingMapping

    if (shouldPrune && canPruneExisting) {
      const availableModelsSet = new Set(
        options?.availableModels?.map((model) => model.trim()).filter(Boolean),
      )
      const { prunedMapping, removedCount } =
        ModelRedirectService.pruneModelMappingMissingTargets(
          existingMapping,
          availableModelsSet,
          { siteType: options?.siteType },
        )
      baseMapping = prunedMapping
      prunedCount = removedCount
    }

    // Merge mappings: new mapping overrides existing keys
    const mergedMapping: Record<string, unknown> = {
      ...baseMapping,
      ...newMapping,
    }

    if (canPruneExisting) {
      const hasMeaningfulChange = !ModelRedirectService.areModelMappingsEqual(
        mergedMapping,
        existingMapping,
      )

      if (!hasMeaningfulChange) {
        return { updated: false, prunedCount }
      }
    } else if (!hasNewMapping) {
      // Best-effort safety: if the existing mapping is invalid and we're not
      // applying any new mapping, skip any destructive action (including prune).
      return { updated: false, prunedCount: 0 }
    }

    await service.updateChannelModelMapping(
      channel,
      mergedMapping as Record<string, string>,
    )

    return { updated: true, prunedCount }
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
        await ModelRedirectService.getManagedSiteModelSyncService(prefs)
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
            `Channel ${channel.name} (${channel.id}): ${getErrorMessage(error)}`,
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

        if (isEmptyModelMapping(channel.model_mapping)) {
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
   * Build an order-insensitive token key by:
   * - Lowercasing
   * - Stripping date suffixes
   * - Treating dots and hyphens/underscores as the same separator
   * - Comparing as an unordered token set to align variants like
   *   "claude-4.5-sonnet" and "claude-sonnet-4-5".
   */
  static toVersionAgnosticKey = (modelName: string): string | null => {
    return toModelTokenKey(modelName)
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
        const standardKey = toModelTokenKey(extractActualModel(standardModel))
        const candidateKey = toModelTokenKey(
          extractActualModel(availableCandidate),
        )

        // Guardrail: never generate downgrade/upgrade mappings across versions.
        // If the token signatures differ, treat as incompatible and leave unmapped.
        if (!standardKey || !candidateKey || standardKey !== candidateKey) {
          continue
        }

        mapping[standardModel] = availableCandidate
        usedActualModels.add(availableCandidate)
      }
    }

    return mapping
  }
}
