/**
 * Model Redirect Service
 * Generates model redirect mappings using AI (OpenAI API)
 */

import { NewApiModelSyncService } from "~/services/newApiModelSync"
import { OpenAIService } from "~/services/openai"
import {
  ALL_PRESET_STANDARD_MODELS,
  CHANNEL_STATUS,
  DEFAULT_MODEL_REDIRECT_PREFERENCES
} from "~/types"

import { hasValidNewApiConfig } from "../newApiService"
import { userPreferences } from "../userPreferences"

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

      // Validate AI configuration
      if (!modelRedirectPrefs.aiConfig?.apiKey) {
        return {
          success: false,
          updatedChannels: 0,
          errors: ["OpenAI API key is not configured"],
          message: "OpenAI API key is not configured"
        }
      }

      if (!modelRedirectPrefs.aiConfig?.endpoint) {
        return {
          success: false,
          updatedChannels: 0,
          errors: ["OpenAI API endpoint is not configured"],
          message: "OpenAI API endpoint is not configured"
        }
      }

      const standardModels = modelRedirectPrefs.standardModels.length
        ? modelRedirectPrefs.standardModels
        : ALL_PRESET_STANDARD_MODELS

      const openAIService = new OpenAIService(modelRedirectPrefs.aiConfig)
      const newApiService = new NewApiModelSyncService(
        prefs.newApiBaseUrl,
        prefs.newApiAdminToken,
        prefs.newApiUserId
      )

      const channelList = await newApiService.listChannels()

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
            await ModelRedirectService.generateModelMappingForChannel(
              openAIService,
              standardModels,
              actualModels
            )

          if (Object.keys(modelMapping).length > 0) {
            await newApiService.updateChannelModelMapping(channel, modelMapping)
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
   * Generate model mapping for a single channel using AI
   * Returns an object of standardModel -> actualModel mappings
   */
  static async generateModelMappingForChannel(
    openAIService: OpenAIService,
    standardModels: string[],
    actualModels: string[]
  ): Promise<Record<string, string>> {
    if (standardModels.length === 0 || actualModels.length === 0) {
      return {}
    }

    // Filter out standard models that already exist in actual models
    const modelsToMap = standardModels.filter(
      (model) => !actualModels.includes(model)
    )

    if (modelsToMap.length === 0) {
      return {}
    }

    try {
      // Generate mapping using AI
      const result = await openAIService.generateModelMapping(
        modelsToMap,
        actualModels
      )

      console.log(
        `[ModelRedirect] Generated ${Object.keys(result.mappings).length} mappings using AI`
      )

      if (result.usage) {
        console.log(
          `[ModelRedirect] Token usage: ${result.usage.total_tokens} (prompt: ${result.usage.prompt_tokens}, completion: ${result.usage.completion_tokens})`
        )
      }

      return result.mappings
    } catch (error) {
      console.error(
        "[ModelRedirect] Failed to generate mapping with AI:",
        error
      )
      throw error
    }
  }
}
