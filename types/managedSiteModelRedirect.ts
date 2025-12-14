/**
 * Model redirect preferences
 */
export interface ModelRedirectPreferences {
  enabled: boolean
  standardModels: string[]
}

/**
 * Preset standard models by vendor
 */
export const PRESET_STANDARD_MODELS = {
  OpenAI: [
    "gpt-4o",
    "gpt-4o-mini",
    "o3",
    "o3-mini",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-codex",
  ],
  Anthropic: ["claude-4.5-haiku", "claude-4.5-sonnet", "claude-4.1-opus"],
  Google: ["gemini-2.5-pro", "gemini-2.5-flash"],
  Mistral: ["mistral-small", "mistral-large", "mistral-medium"],
  DeepSeek: ["deepseek-chat", "deepseek-reasoner"],
  ZhipuAI: ["glm-4.6", "glm-4.5", "glm-4.5-air"],
  Alibaba: ["qwen-max", "qwen-plus", "qwen-flash", "qwen-coder"],
}

/**
 * All preset standard models (flattened)
 */
export const ALL_PRESET_STANDARD_MODELS = Object.values(
  PRESET_STANDARD_MODELS,
).flat()

/**
 * Default model redirect preferences
 */
export const DEFAULT_MODEL_REDIRECT_PREFERENCES: ModelRedirectPreferences = {
  enabled: false,
  standardModels: [...ALL_PRESET_STANDARD_MODELS],
}
