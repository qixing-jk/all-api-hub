import { createLogger } from "~/utils/core/logger"

import {
  MODEL_METADATA_REFRESH_INTERVAL,
  MODEL_METADATA_URL,
} from "./constants"
import {
  createModelIdentityIndex,
  resolveModelIdentity as resolveIndexedModelIdentity,
  resolveRedirectModelIdentity,
  type ModelIdentityIndex,
} from "./modelIdentityIndex"
import type {
  ModelMetadata,
  ModelMetadataCache,
  ModelMetadataCapabilities,
  ModelMetadataLimits,
  ModelMetadataModalities,
} from "./types"

const logger = createLogger("ModelMetadata")

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  deepseek: "DeepSeek",
  "deepseek-ai": "deepseek-ai",
  mistral: "Mistral",
  meta: "Meta",
  qwen: "Qwen",
  moonshot: "Moonshot",
  zhipu: "ZhipuAI",
  cohere: "Cohere",
  baidu: "Baidu",
  tencent: "Tencent",
  yi: "Yi",
  baichuan: "Baichuan",
  xai: "xAI",
  alibaba: "阿里巴巴",
  "alibaba-cn": "通义千问",
  doubao: "豆包",
}

const MODELS_DEV_MODEL_ID_PATTERN = /^[^/]+\/.+$/

/**
 * Normalizes optional array fields from the remote metadata payload.
 */
function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * Keeps non-empty string fields and drops missing or blank values.
 */
function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

/**
 * Keeps boolean metadata flags without coercing truthy or falsy strings.
 */
function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

/**
 * Keeps finite numeric metadata limits.
 */
function normalizeOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

/**
 * Resolves provider ids from explicit fields or models.dev path-style ids.
 */
function deriveProviderId(item: any, id: string): string {
  const explicitProviderId =
    normalizeOptionalString(item.providerId) ??
    normalizeOptionalString(item.provider_id) ??
    normalizeOptionalString(item.provider)

  if (explicitProviderId) {
    return explicitProviderId
  }

  // models.dev ids are provider-prefixed paths; nested model ids keep the first path segment as provider.
  if (MODELS_DEV_MODEL_ID_PATTERN.test(id)) {
    return id.slice(0, id.indexOf("/"))
  }

  return ""
}

/**
 * Converts models.dev modality arrays into the internal metadata shape.
 */
function normalizeModalities(
  value: unknown,
): ModelMetadataModalities | undefined {
  if (!value || typeof value !== "object") {
    return undefined
  }

  const record = value as Record<string, unknown>
  const input = normalizeStringArray(record.input)
  const output = normalizeStringArray(record.output)

  if (input.length === 0 && output.length === 0) {
    return undefined
  }

  return { input, output }
}

/**
 * Converts models.dev capability flags into camelCase internal fields.
 */
function normalizeCapabilities(
  item: any,
): ModelMetadataCapabilities | undefined {
  const flags = item.flags && typeof item.flags === "object" ? item.flags : {}
  const capabilities: ModelMetadataCapabilities = {}
  const attachment =
    normalizeOptionalBoolean(item.attachment) ??
    normalizeOptionalBoolean(flags.attachment)
  const reasoning =
    normalizeOptionalBoolean(item.reasoning) ??
    normalizeOptionalBoolean(flags.reasoning)
  const toolCall =
    normalizeOptionalBoolean(item.tool_call) ??
    normalizeOptionalBoolean(item.toolCall) ??
    normalizeOptionalBoolean(flags.tool_call) ??
    normalizeOptionalBoolean(flags.toolCall)
  const structuredOutput =
    normalizeOptionalBoolean(item.structured_output) ??
    normalizeOptionalBoolean(item.structuredOutput) ??
    normalizeOptionalBoolean(flags.structured_output) ??
    normalizeOptionalBoolean(flags.structuredOutput)
  const temperature =
    normalizeOptionalBoolean(item.temperature) ??
    normalizeOptionalBoolean(flags.temperature)

  if (attachment !== undefined) {
    capabilities.attachment = attachment
  }
  if (reasoning !== undefined) {
    capabilities.reasoning = reasoning
  }
  if (toolCall !== undefined) {
    capabilities.toolCall = toolCall
  }
  if (structuredOutput !== undefined) {
    capabilities.structuredOutput = structuredOutput
  }
  if (temperature !== undefined) {
    capabilities.temperature = temperature
  }

  return Object.keys(capabilities).length > 0 ? capabilities : undefined
}

/**
 * Converts context/input/output limit fields into the internal metadata shape.
 */
function normalizeLimits(value: unknown): ModelMetadataLimits | undefined {
  if (!value || typeof value !== "object") {
    return undefined
  }

  const record = value as Record<string, unknown>
  const limits: ModelMetadataLimits = {}
  const context = normalizeOptionalNumber(record.context)
  const input = normalizeOptionalNumber(record.input)
  const output = normalizeOptionalNumber(record.output)

  if (context !== undefined) {
    limits.context = context
  }
  if (input !== undefined) {
    limits.input = input
  }
  if (output !== undefined) {
    limits.output = output
  }

  return Object.keys(limits).length > 0 ? limits : undefined
}

/**
 * Converts one remote metadata record into the cached internal shape.
 */
function normalizeModelMetadataItem(item: any, key?: string): ModelMetadata {
  const id = item.id || key || ""
  const metadata: ModelMetadata = {
    id,
    name: item.name || id,
    provider_id: deriveProviderId(item, id),
  }
  const description = normalizeOptionalString(item.description)
  const family = normalizeOptionalString(item.family)
  const capabilities = normalizeCapabilities(item)
  const modalities = normalizeModalities(item.modalities)
  const openWeights = normalizeOptionalBoolean(item.open_weights)
  const limits = normalizeLimits(item.limit ?? item.limits)
  const releaseDate = normalizeOptionalString(item.release_date)
  const lastUpdated =
    normalizeOptionalString(item.last_updated) ??
    normalizeOptionalString(item.updated)

  if (description) {
    metadata.description = description
  }
  if (family) {
    metadata.family = family
  }
  if (capabilities) {
    metadata.capabilities = capabilities
  }
  if (modalities) {
    metadata.modalities = modalities
  }
  if (openWeights !== undefined) {
    metadata.open_weights = openWeights
  }
  if (limits) {
    metadata.limits = limits
  }
  if (releaseDate) {
    metadata.release_date = releaseDate
  }
  if (lastUpdated) {
    metadata.last_updated = lastUpdated
  }

  return metadata
}

/**
 * Accepts both legacy array payloads and models.dev object-map payloads.
 */
function normalizeMetadataPayload(data: any): ModelMetadata[] {
  const modelsPayload = data.models || data

  if (Array.isArray(modelsPayload)) {
    return modelsPayload.map((item: any) => normalizeModelMetadataItem(item))
  }

  if (modelsPayload && typeof modelsPayload === "object") {
    const entries = Object.entries(modelsPayload)
    if (
      entries.length === 0 ||
      entries.some(
        ([, item]) => !item || typeof item !== "object" || Array.isArray(item),
      )
    ) {
      throw new Error(
        "Invalid metadata format: model map values should be objects",
      )
    }

    return entries.map(([key, item]) => normalizeModelMetadataItem(item, key))
  }

  throw new Error("Invalid metadata format: models should be array or object")
}

/**
 * Returns defensive copies of nested metadata objects exposed to consumers.
 */
function cloneMetadata(model: ModelMetadata): ModelMetadata {
  return {
    ...model,
    ...(model.capabilities ? { capabilities: { ...model.capabilities } } : {}),
    ...(model.modalities
      ? {
          modalities: {
            input: [...model.modalities.input],
            output: [...model.modalities.output],
          },
        }
      : {}),
    ...(model.limits ? { limits: { ...model.limits } } : {}),
  }
}

/**
 * Loads and caches model metadata from a remote source with fallback defaults.
 * Responsibilities:
 * - Fetch remote metadata (with refresh interval).
 * - Delegate vendor/model identity lookup to the shared metadata index.
 * - Provide cache info and normalized metadata for downstream consumers.
 */
class ModelMetadataService {
  private cache: ModelMetadataCache | null = null
  private metadataIndex: ModelIdentityIndex = createModelIdentityIndex([])
  private initPromise: Promise<void> | null = null
  private lastFetch: number = 0

  /**
   * Initialize metadata (idempotent). Reuses in-flight init promise.
   * @returns Promise that resolves when initialization completes or reuses the in-flight promise.
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this._initialize().finally(() => {
      this.initPromise = null
    })
    return this.initPromise
  }

  /**
   * Internal initialize: skip fetch if cache is fresh, otherwise refresh.
   *
   * Uses MODEL_METADATA_REFRESH_INTERVAL to decide reuse; falls back on failure.
   */
  private async _initialize(): Promise<void> {
    try {
      const now = Date.now()

      if (
        this.cache &&
        now - this.lastFetch < MODEL_METADATA_REFRESH_INTERVAL
      ) {
        logger.debug("Using in-memory cache")
        return
      }

      await this.refreshMetadata()
    } catch (error) {
      logger.error("Failed to initialize", error)
      this.initializeFallback()
    }
  }

  /**
   * Fetch metadata from remote endpoint and rebuild caches.
   * Falls back to existing cache if fetch fails.
   *
   * Refreshes cache and identity index on success.
   */
  async refreshMetadata(): Promise<void> {
    try {
      logger.debug("Fetching from remote metadata URL", {
        url: MODEL_METADATA_URL,
      })
      const response = await fetch(MODEL_METADATA_URL)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (!data || typeof data !== "object") {
        throw new Error("Invalid metadata format: expected object")
      }

      const models = normalizeMetadataPayload(data)

      this.cache = {
        models,
        lastUpdated: Date.now(),
        version: "1.0",
      }

      this.lastFetch = Date.now()
      this.buildMetadataIndexFromCache()

      logger.info("Refreshed successfully", { models: models.length })
    } catch (error) {
      logger.error("Failed to refresh metadata", error)
      if (!this.cache) {
        this.initializeFallback()
      }
    }
  }

  /**
   * Build the shared identity index from cached metadata.
   */
  private buildMetadataIndexFromCache(): void {
    if (!this.cache) return

    this.metadataIndex = createModelIdentityIndex(this.cache.models)
  }

  /**
   * Capitalize hyphen/space-delimited provider id for display.
   * @param str Provider id.
   * @returns Capitalized display string.
   */
  private capitalizeFirst(str: string): string {
    if (!str) return ""
    const parts = str.replace(/-/g, " ").split(/\s+/)
    return parts
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  }

  /**
   * Initialize fallback metadata when remote fetch is unavailable.
   *
   * Seeds cache and the metadata index with bundled defaults.
   */
  private initializeFallback(): void {
    logger.warn("Using fallback default data")

    const defaultMetadata: ModelMetadata[] = [
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        provider_id: "anthropic",
      },
      {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        provider_id: "anthropic",
      },
      {
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus",
        provider_id: "anthropic",
      },
      {
        id: "claude-sonnet-4-5-20250929",
        name: "Claude 4.5 Sonnet",
        provider_id: "anthropic",
      },
      {
        id: "claude-haiku-4-5-20251001",
        name: "Claude 4.5 Haiku",
        provider_id: "anthropic",
      },
      { id: "gpt-4o", name: "GPT-4o", provider_id: "openai" },
      { id: "gpt-4o-mini", name: "GPT-4o mini", provider_id: "openai" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", provider_id: "openai" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider_id: "openai" },
      {
        id: "gemini-2.0-flash-exp",
        name: "Gemini 2.0 Flash",
        provider_id: "google",
      },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider_id: "google" },
      {
        id: "gemini-1.5-flash",
        name: "Gemini 1.5 Flash",
        provider_id: "google",
      },
      { id: "deepseek-chat", name: "DeepSeek Chat", provider_id: "deepseek" },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek Reasoner",
        provider_id: "deepseek",
      },
    ]

    this.cache = {
      models: defaultMetadata,
      lastUpdated: Date.now(),
      version: "1.0-fallback",
    }

    this.lastFetch = Date.now()

    this.metadataIndex = createModelIdentityIndex(defaultMetadata)
  }

  /** Resolve a displayed model id without discarding ambiguity information. */
  resolveModelIdentity(modelName: string) {
    return resolveIndexedModelIdentity(this.metadataIndex, modelName)
  }

  /**
   * Resolve a model name to a standard id and vendor display name.
   * Uses exact match first, then fuzzy match if no date suffix is present.
   */
  findStandardModelName(
    modelName: string,
  ): { standardName: string; vendorName: string } | null {
    if (!this.cache) return null

    const result = resolveRedirectModelIdentity(this.metadataIndex, modelName)
    if (result.state !== "resolved") return null

    const vendorName =
      PROVIDER_DISPLAY_NAMES[result.metadata.provider_id] ||
      this.capitalizeFirst(result.metadata.provider_id)
    return {
      standardName: result.metadata.id,
      vendorName,
    }
  }

  /**
   * Return cache summary info (loaded flag, count, lastUpdated).
   */
  getCacheInfo(): {
    isLoaded: boolean
    modelCount: number
    lastUpdated: number | null
  } {
    return {
      isLoaded: !!this.cache,
      modelCount: this.cache?.models.length || 0,
      lastUpdated: this.cache?.lastUpdated || null,
    }
  }

  /**
   * Return all cached metadata (empty array when not loaded).
   */
  getAllMetadata(): ModelMetadata[] {
    if (!this.cache) {
      return []
    }
    return this.cache.models.map(cloneMetadata)
  }

  /**
   * Clear in-memory cache and the derived identity index.
   */
  clearCache(): void {
    this.cache = null
    this.metadataIndex = createModelIdentityIndex([])
    this.lastFetch = 0
  }
}

export const modelMetadataService = new ModelMetadataService()
