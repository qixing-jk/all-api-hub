/**
 * Model Redirect Service
 * Generates model redirect mappings based on channel configurations
 * Based on gpt-api-sync logic with enhancements for weighted channel selection
 */

import { modelMetadataService } from "~/services/modelMetadata"
import { NewApiModelSyncService } from "~/services/newApiModelSync"
import {
  ALL_PRESET_STANDARD_MODELS,
  CHANNEL_STATUS,
  DEFAULT_MODEL_REDIRECT_PREFERENCES
} from "~/types"

import { hasValidNewApiConfig } from "../newApiService"
import { userPreferences } from "../userPreferences"
import { renameModel } from "./modelNormalization"

/**
 * Model Redirect Service
 * Core algorithm for generating model redirect mappings
 */
export class ModelRedirectService {
  /**
   * Run model redirect generation and apply mappings directly
   */
  static async applyModelRedirect(): Promise<{
    success: boolean
    updatedChannels: number
    errors: string[]
    message?: string
  }> {
    try {
      const prefs = await userPreferences.getPreferences()

      if (!hasValidNewApiConfig(prefs)) {
        return {
          success: false,
          updatedChannels: 0,
          errors: ["New API configuration is missing"],
          message: "New API configuration is missing"
        }
      }

      const modelRedirectPrefs = Object.assign(
        {},
        DEFAULT_MODEL_REDIRECT_PREFERENCES,
        prefs.modelRedirect
      )

      if (!modelRedirectPrefs.enabled) {
        return {
          success: false,
          updatedChannels: 0,
          errors: ["Model redirect feature is disabled"],
          message: "Model redirect feature is disabled"
        }
      }

      const standardModels = modelRedirectPrefs.standardModels.length
        ? modelRedirectPrefs.standardModels
        : ALL_PRESET_STANDARD_MODELS

      await modelMetadataService.initialize().catch((error) => {
        console.warn("[ModelRedirect] Failed to initialize metadata:", error)
      })

      const { newApi } = prefs

      const service = new NewApiModelSyncService(
        newApi.baseUrl!,
        newApi.adminToken!,
        newApi.userId!
      )

      const channelList = await service.listChannels()

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

          const modelMapping =
            ModelRedirectService.generateModelMappingForChannel(
              standardModels,
              actualModels
            )

          if (Object.keys(modelMapping).length > 0) {
            await service.updateChannelModelMapping(channel, modelMapping)
            successCount += 1
          }
        } catch (error) {
          errors.push(
            `Channel ${channel.name} (${channel.id}): ${(error as Error).message || "Unknown error"}`
          )
        }
      }

      return {
        success: errors.length === 0,
        updatedChannels: successCount,
        errors
      }
    } catch (error) {
      console.error("[ModelRedirect] Failed to apply redirect:", error)
      return {
        success: false,
        updatedChannels: 0,
        errors: [
          error instanceof Error ? error.message : "Failed to apply redirect"
        ]
      }
    }
  }

  /**
   * Generate model mapping for a single channel
   * Returns an object of standardModel -> actualModel mappings
   * Uses multi-stage extraction pipeline with deduplication
   */
  static generateModelMappingForChannel(
    standardModels: string[],
    actualModels: string[]
  ): Record<string, string> {
    const mapping: Record<string, string> = {}
    const usedActualModels = new Set<string>()
    const actualModelSet = new Set<string>()

    const normalizedActualMap = new Map<string, string[]>()
    for (const rawActual of actualModels) {
      const actualModel = rawActual.trim()
      if (!actualModel) continue
      actualModelSet.add(actualModel)

      const normalizedModelName = renameModel(actualModel, false)?.trim()
      if (!normalizedModelName) continue

      if (!normalizedActualMap.has(normalizedModelName)) {
        normalizedActualMap.set(normalizedModelName, [])
      }
      normalizedActualMap.get(normalizedModelName)!.push(actualModel)
    }

    for (const rawStandard of standardModels) {
      const standardModel = rawStandard.trim()
      if (!standardModel) continue

      if (actualModelSet.has(standardModel)) {
        continue
      }

      if (mapping[standardModel]) {
        continue
      }

      const normalizedStandardModelName = renameModel(
        standardModel,
        false
      )?.trim()
      if (!normalizedStandardModelName) continue

      const candidates = normalizedActualMap.get(normalizedStandardModelName)
      if (!candidates || candidates.length === 0) continue

      const availableCandidate = candidates.find(
        (candidate) => !usedActualModels.has(candidate)
      )
      if (availableCandidate) {
        mapping[standardModel] = availableCandidate
        usedActualModels.add(availableCandidate)
      }
    }

    return mapping
  }
}
