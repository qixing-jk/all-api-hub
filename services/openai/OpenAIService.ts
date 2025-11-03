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
 * OpenAI Service for generating model mappings
 */
export class OpenAIService {
  private config: OpenAIConfig

  constructor(config: OpenAIConfig) {
    this.config = config
  }

  /**
   * Test connection to OpenAI API
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.config.apiKey) {
        return { success: false, error: "API key is required" }
      }

      if (!this.config.endpoint) {
        return { success: false, error: "API endpoint is required" }
      }

      // Make a simple request to test the connection
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
    if (!this.config.apiKey) {
      throw new Error("OpenAI API key is not configured")
    }

    if (!this.config.endpoint) {
      throw new Error("OpenAI API endpoint is not configured")
    }

    if (standardModels.length === 0) {
      return { mappings: {} }
    }

    if (availableModels.length === 0) {
      return { mappings: {} }
    }

    const prompt = this.buildPrompt(standardModels, availableModels)

    try {
      const response = await this.callOpenAI(prompt)
      return this.parseResponse(response, availableModels)
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

    let parsedContent: { mappings: Record<string, string> }
    try {
      parsedContent = JSON.parse(content)
    } catch (error) {
      throw new Error(`Failed to parse OpenAI response as JSON: ${content}`)
    }

    if (!parsedContent.mappings || typeof parsedContent.mappings !== "object") {
      throw new Error("Invalid response format: missing or invalid 'mappings'")
    }

    // Validate that all mapped models exist in available models
    const validatedMappings: Record<string, string> = {}
    const availableSet = new Set(availableModels)

    for (const [standardModel, targetModel] of Object.entries(
      parsedContent.mappings
    )) {
      if (availableSet.has(targetModel)) {
        validatedMappings[standardModel] = targetModel
      } else {
        console.warn(
          `[OpenAIService] Skipping invalid mapping: ${standardModel} -> ${targetModel} (target not in available models)`
        )
      }
    }

    return {
      mappings: validatedMappings,
      usage: response.usage
    }
  }
}
