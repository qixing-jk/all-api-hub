/**
 * Model redirect settings
 * Used to map local model names to standard/remote model names
 */

/**
 * Single model mapping entry
 */
export interface ModelMappingEntry {
  /**
   * Local model name (e.g., the model name in New API)
   */
  localModel: string

  /**
   * Target model name to redirect to (e.g., standard OpenAI model name)
   */
  targetModel: string

  /**
   * Optional description/notes for this mapping
   */
  description?: string
}

/**
 * Model redirect settings
 */
export interface ModelRedirectSettings {
  /**
   * Whether model redirect is enabled globally
   */
  enabled: boolean

  /**
   * List of standard model names to be used as targets
   * These are common model names like "gpt-4", "gpt-3.5-turbo", etc.
   */
  standardModels: string[]

  /**
   * Whether to automatically generate mappings based on detected models
   * When true, the system will suggest mappings for new models
   */
  autoGenerateMapping: boolean

  /**
   * User-defined model mappings
   */
  mappings: ModelMappingEntry[]
}
