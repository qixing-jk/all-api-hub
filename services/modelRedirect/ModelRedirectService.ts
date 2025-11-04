/**
 * Model Redirect Service
 * Generates model redirect mappings using AI (OpenAI API)
 */

import type { NewApiChannel } from "~/types"
import { NewApiModelSyncService } from "~/services/newApiModelSync"
import { OpenAIService } from "~/services/openai"
import {
  ALL_PRESET_STANDARD_MODELS,
  CHANNEL_STATUS,
  DEFAULT_MODEL_REDIRECT_PREFERENCES
} from "~/types"
import type { ModelRedirectPreferences } from "~/types/modelRedirect"

import { hasValidNewApiConfig } from "../newApiService"
import { userPreferences } from "../userPreferences"

/**
 * Result of model redirect generation and application
 */
export interface ModelRedirectResult {
  success: boolean
  updatedChannels: number
  errors: string[]
  message?: string
}

/**
 * Configuration for model redirect generation
 */
export interface ModelRedirectGenerationConfig {
  openAIService: OpenAIService
  standardModels: string[]
  newApiService: NewApiModelSyncService
}

/**
 * Model Redirect Service
 * Core algorithm for generating model redirect mappings
 */
export class ModelRedirectService {
  /**
   * Prepare model redirect configuration from user preferences
   * @throws Error if configuration is invalid or missing
   */
  static async prepareModelRedirectConfig(): Promise<ModelRedirectGenerationConfig> {
    const prefs = await userPreferences.getPreferences()

    if (!hasValidNewApiConfig(prefs)) {
      throw new Error("New API configuration is missing")
    }

    const modelRedirectPrefs = Object.assign(
      {},
      DEFAULT_MODEL_REDIRECT_PREFERENCES,
      prefs.modelRedirect
    )

    if (!modelRedirectPrefs.enabled) {
      throw new Error("Model redirect feature is disabled")
    }

    // Validate AI configuration
    if (!modelRedirectPrefs.aiConfig?.apiKey) {
      throw new Error("OpenAI API key is not configured")
    }

    if (!modelRedirectPrefs.aiConfig?.endpoint) {
      throw new Error("OpenAI API endpoint is not configured")
    }

    if (!modelRedirectPrefs.aiConfig?.model) {
      throw new Error("OpenAI model is not configured")
    }

    const standardModels = modelRedirectPrefs.standardModels.length
      ? modelRedirectPrefs.standardModels
      : ALL_PRESET_STANDARD_MODELS

    const openAIService = OpenAIService.getInstance(modelRedirectPrefs.aiConfig)

    const newApiService = new NewApiModelSyncService(
      prefs.newApiBaseUrl,
      prefs.newApiAdminToken,
      prefs.newApiUserId
    )

    return {
      openAIService,
      standardModels,
      newApiService
    }
  }

  /**
   * Check if model redirect is enabled and configured
   */
  static async isModelRedirectEnabled(): Promise<boolean> {
    try {
      const prefs = await userPreferences.getPreferences()
      const modelRedirectPrefs =
        prefs.modelRedirect ?? DEFAULT_MODEL_REDIRECT_PREFERENCES

      return (
        modelRedirectPrefs.enabled &&
        !!modelRedirectPrefs.aiConfig?.apiKey &&
        !!modelRedirectPrefs.aiConfig?.endpoint &&
        !!modelRedirectPrefs.aiConfig?.model
      )
    } catch {
      return false
    }
  }

  /**
   * Get model redirect preferences
   */
  static async getModelRedirectPreferences(): Promise<ModelRedirectPreferences> {
    const prefs = await userPreferences.getPreferences()
    return Object.assign(
      {},
      DEFAULT_MODEL_REDIRECT_PREFERENCES,
      prefs.modelRedirect
    )
  }

  /**
   * Generate and apply model redirects for a list of channels
   * This is the core function used by both manual button and automatic sync
   */
  static async generateAndApplyModelRedirects(
    channels: NewApiChannel[],
    config: ModelRedirectGenerationConfig
  ): Promise<ModelRedirectResult> {
    let successCount = 0
    const errors: string[] = []

    for (const channel of channels) {
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
            config.openAIService,
            config.standardModels,
            actualModels
          )

        if (Object.keys(modelMapping).length > 0) {
          await config.newApiService.updateChannelModelMapping(
            channel,
            modelMapping
          )
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
  }

  /**
   * Run model redirect generation and apply mappings directly
   * This method is used by the manual button trigger
   */
  static async applyModelRedirect(): Promise<ModelRedirectResult> {
    try {
      const config = await ModelRedirectService.prepareModelRedirectConfig()

      // Get all channels
      const channelList = await config.newApiService.listChannels()

      // Generate and apply redirects
      return await ModelRedirectService.generateAndApplyModelRedirects(
        channelList.items,
        config
      )
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
