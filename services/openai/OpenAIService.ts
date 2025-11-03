/**
 * OpenAI API Service for Model Mapping Generation
 * Supports OpenAI-compatible endpoints with structured outputs
 */

import type { OpenAIConfig } from "~/types/modelRedirect"

/**
 * Default prompt template for model mapping generation
 */
export const DEFAULT_MAPPING_PROMPT = `You are a model name mapping expert. Given a list of standard model names and a list of available model names, create a JSON mapping that redirects standard names to available names.

Rules:
1. ALLOWED mappings:
   - Date suffix changes: "claude-3.5-sonnet" → "claude-3-5-sonnet-20241022"
   - Format changes: "anthropic/claude-3.5-sonnet" → "claude-sonnet-3-5" or "claude-sonnet-3.5"
   - Prefix/org changes: "glm-4.6" → "zai-org/GLM-4.6"
   - Case changes: "GPT-4" → "gpt-4"

2. FORBIDDEN mappings (DO NOT create these):
   - Version changes: "claude-sonnet-3-5" ✗ "claude-sonnet-3-7"
   - Size/spec changes: "claude-sonnet-3-5" ✗ "claude-sonnet-3-5-70B"
   - Variant changes: "claude-sonnet-3-5" ✗ "claude-sonnet-3-5-mini", "gpt-4o" ✗ "gpt-4o-mini"
   - Different model families: "gpt-4" ✗ "claude-3"

3. Only map to models that exist in the available models list.
4. If no suitable match exists, omit that mapping.
5. Prioritize exact matches or closest naming conventions.

Standard models: {standardModels}
Available models: {availableModels}

Return a JSON object with format: { "standard-model-name": "available-model-name", ... }`

/**
 * JSON Schema for structured output
 */
const MODEL_MAPPING_SCHEMA = {
  name: "model_mapping",
  strict: true,
  schema: {
    type: "object",
    properties: {
      mappings: {
        type: "object",
        additionalProperties: {
          type: "string"
        },
        description: "Mapping from standard model names to available model names"
      }
    },
    required: ["mappings"],
    additionalProperties: false
  }
}

/**
 * OpenAI API response type
 */
interface OpenAIResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * Model mapping result
 */
export interface ModelMappingResult {
  mappings: Record<string, string>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * Normalized OpenAI configuration used internally by the service
 */
type NormalizedOpenAIConfig = Required<
  Pick<OpenAIConfig, "endpoint" | "apiKey" | "model">
> & { customPrompt?: string }

/**
 * OpenAI Service for generating model mappings
 */
export class OpenAIService {
  private static instance: OpenAIService | null = null

  private config: NormalizedOpenAIConfig

  private constructor(config: OpenAIConfig) {
    this.config = OpenAIService.validateAndNormalizeConfig(config)
  }

  /**
   * Retrieve a global shared instance of the service.
   * Passing a configuration will initialize or refresh the underlying instance.
   */
  static getInstance(config?: OpenAIConfig): OpenAIService {
    if (!OpenAIService.instance) {
      if (!config) {
        throw new Error(
          "OpenAIService has not been initialized. Provide configuration on first use."
        )
      }
      OpenAIService.instance = new OpenAIService(config)
      return OpenAIService.instance
    }

    if (config) {
      OpenAIService.instance.updateConfig(config)
    }

    return OpenAIService.instance
  }

  /**
   * Reset the singleton instance (mainly for testing or forcing reinitialization).
   */
  static resetInstance(): void {
    OpenAIService.instance = null
  }

  /**
   * Expose the current configuration (as a shallow clone to avoid external mutation).
   */
  getConfig(): OpenAIConfig {
    return { ...this.config }
  }

  /**
   * Update configuration for the current instance.
   */
  updateConfig(config: OpenAIConfig): void {
    this.config = OpenAIService.validateAndNormalizeConfig(config)
  }

  /**
   * Test connection to OpenAI API
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.config.endpoint}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json"
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        return {
          success: false,
          error: `API returned ${response.status}: ${errorText}`
        }
      }

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }
    }
  }

  /**
   * Generate model mappings using OpenAI API
   */
  async generateModelMapping(
    standardModels: string[],
    availableModels: string[]
  ): Promise<ModelMappingResult> {
    const sanitizedStandardModels = this.sanitizeModelList(
      standardModels,
      "standardModels"
    )
    const sanitizedAvailableModels = this.sanitizeModelList(
      availableModels,
      "availableModels"
    )

    if (sanitizedStandardModels.length === 0) {
      return { mappings: {} }
    }

    if (sanitizedAvailableModels.length === 0) {
      return { mappings: {} }
    }

    const modelsToMap = sanitizedStandardModels.filter(
      (model) => !sanitizedAvailableModels.includes(model)
    )

    if (modelsToMap.length === 0) {
      return { mappings: {} }
    }

    const prompt = this.buildPrompt(modelsToMap, sanitizedAvailableModels)

    try {
      const response = await this.callOpenAI(prompt)
      return this.parseResponse(response, sanitizedAvailableModels)
    } catch (error) {
      console.error("[OpenAIService] Failed to generate mapping:", error)
      throw new Error(
        `Failed to generate model mapping: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    }
  }

  /**
   * Build prompt with standard and available models
   */
  private buildPrompt(
    standardModels: string[],
    availableModels: string[]
  ): string {
    const template = this.config.customPrompt || DEFAULT_MAPPING_PROMPT

    return template
      .replace("{standardModels}", JSON.stringify(standardModels))
      .replace("{availableModels}", JSON.stringify(availableModels))
  }

  /**
   * Call OpenAI API with structured outputs
   */
  private async callOpenAI(prompt: string): Promise<OpenAIResponse> {
    const endpoint = `${this.config.endpoint}/chat/completions`

    const requestBody = {
      model: this.config.model,
      messages: [
        {
          role: "system",
          content:
            "You are a precise model name mapping assistant. Follow the rules strictly and return only valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: MODEL_MAPPING_SCHEMA
      },
      temperature: 0.1 // Low temperature for consistent results
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `OpenAI API error (${response.status}): ${errorText.substring(0, 500)}`
      )
    }

    const data = (await response.json()) as OpenAIResponse
    return data
  }

  /**
   * Parse OpenAI response and validate mappings
   */
  private parseResponse(
    response: OpenAIResponse,
    availableModels: string[]
  ): ModelMappingResult {
    if (!response.choices || response.choices.length === 0) {
      throw new Error("No response from OpenAI API")
    }

    const content = response.choices[0].message.content

    if (!content) {
      throw new Error("Empty response from OpenAI API")
    }

    let parsedContent: { mappings: Record<string, unknown> }
    try {
      parsedContent = JSON.parse(content)
    } catch (error) {
      throw new Error(`Failed to parse OpenAI response as JSON: ${content}`)
    }

    if (
      !parsedContent.mappings ||
      typeof parsedContent.mappings !== "object" ||
      Array.isArray(parsedContent.mappings)
    ) {
      throw new Error("Invalid response format: missing or invalid 'mappings'")
    }

    const validatedMappings: Record<string, string> = {}
    const availableSet = new Set(availableModels)

    for (const [standardModel, targetModel] of Object.entries(
      parsedContent.mappings
    )) {
      if (typeof standardModel !== "string" || !standardModel.trim()) {
        continue
      }

      if (typeof targetModel !== "string") {
        continue
      }

      const trimmedTarget = targetModel.trim()
      if (!trimmedTarget) {
        continue
      }

      if (availableSet.has(trimmedTarget)) {
        validatedMappings[standardModel.trim()] = trimmedTarget
      } else {
        console.warn(
          `[OpenAIService] Skipping invalid mapping: ${standardModel} -> ${trimmedTarget} (target not in available models)`
        )
      }
    }

    return {
      mappings: validatedMappings,
      usage: response.usage
    }
  }

  /**
   * Normalize and validate model lists to ensure they contain usable strings
   */
  private sanitizeModelList(models: unknown[], label: string): string[] {
    if (!Array.isArray(models)) {
      throw new Error(`Invalid ${label}: expected an array of strings`)
    }

    const sanitized = models
      .map((model) => (typeof model === "string" ? model.trim() : ""))
      .filter((model) => model.length > 0)

    return Array.from(new Set(sanitized))
  }

  /**
   * Validate and normalize OpenAI configuration to enforce invariants
   */
  private static validateAndNormalizeConfig(
    config: OpenAIConfig
  ): NormalizedOpenAIConfig {
    if (!config) {
      throw new Error("OpenAI configuration is required")
    }

    const endpoint = (config.endpoint ?? "").trim()
    if (!endpoint) {
      throw new Error("OpenAI API endpoint is required")
    }

    let endpointUrl: URL
    try {
      endpointUrl = new URL(endpoint)
    } catch (error) {
      throw new Error("OpenAI API endpoint must be a valid URL")
    }

    if (!["http:", "https:"].includes(endpointUrl.protocol)) {
      throw new Error("OpenAI API endpoint must use HTTP or HTTPS")
    }

    const normalizedEndpoint = endpoint.replace(/\/+$/, "")

    const apiKey = (config.apiKey ?? "").trim()
    if (!apiKey) {
      throw new Error("OpenAI API key is required")
    }

    const model = (config.model ?? "").trim()
    if (!model) {
      throw new Error("OpenAI model is required")
    }

    const customPrompt =
      typeof config.customPrompt === "string" && config.customPrompt.trim()
        ? config.customPrompt.trim()
        : undefined

    return {
      endpoint: normalizedEndpoint,
      apiKey,
      model,
      customPrompt
    }
  }
}
