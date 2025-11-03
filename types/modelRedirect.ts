/**
 * Model Redirect Configuration and Types
 */

/**
 * Rate limiting configuration for OpenAI API
 */
export interface OpenAIRateLimit {
  requestsPerMinute: number // Maximum requests per minute
  burst: number // Maximum burst size (token bucket capacity)
}

/**
 * OpenAI API configuration for AI-powered model mapping
 */
export interface OpenAIConfig {
  endpoint: string // OpenAI API endpoint (e.g., https://api.openai.com/v1)
  apiKey: string // OpenAI API key
  model: string // Model name (e.g., gpt-4o, gpt-4-turbo)
  customPrompt?: string // Optional custom prompt template
  rateLimit?: OpenAIRateLimit // Rate limiting configuration
}

/**
 * Model redirect preferences
 */
export interface ModelRedirectPreferences {
  enabled: boolean
  standardModels: string[]
  aiConfig?: OpenAIConfig // AI configuration for generating mappings
  version: number
}

/**
 * Default rate limiting configuration for OpenAI API
 * Conservative defaults to avoid hitting rate limits
 */
export const DEFAULT_OPENAI_RATE_LIMIT: OpenAIRateLimit = {
  requestsPerMinute: 20, // 20 requests per minute
  burst: 5 // Allow burst of 5 requests
}

/**
 * Default OpenAI configuration
 */
export const DEFAULT_OPENAI_CONFIG: OpenAIConfig = {
  endpoint: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o",
  customPrompt: undefined,
  rateLimit: { ...DEFAULT_OPENAI_RATE_LIMIT }
}

/**
 * Preset standard models by vendor
 */
export const PRESET_STANDARD_MODELS = {
  OpenAI: ["gpt-4o", "gpt-4o-mini", "gpt-o3", "gpt-5"],
  Anthropic: ["claude-4.5-haiku", "claude-4.5-sonnet", "claude-4.1-opus"],
  Google: ["gemini-2.5-pro", "gemini-2.5-flash"],
  Mistral: ["mistral-small", "mistral-large", "mistral-medium"],
  DeepSeek: ["deepseek-chat", "deepseek-reasoner"]
}

/**
 * All preset standard models (flattened)
 */
export const ALL_PRESET_STANDARD_MODELS = Object.values(
  PRESET_STANDARD_MODELS
).flat()

/**
 * Default model redirect preferences
 */
export const DEFAULT_MODEL_REDIRECT_PREFERENCES: ModelRedirectPreferences = {
  enabled: false,
  standardModels: [...ALL_PRESET_STANDARD_MODELS],
  aiConfig: { ...DEFAULT_OPENAI_CONFIG },
  version: 2
}
