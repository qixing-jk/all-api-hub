import { extractActualModel } from "~/services/models/modelRedirect/modelNormalization"
import {
  removeDateSuffix,
  toModelTokenKey,
} from "~/services/models/utils/modelName"
import { createLogger } from "~/utils/core/logger"

import {
  MODEL_METADATA_REFRESH_INTERVAL,
  MODEL_METADATA_URL,
} from "./constants"
import type {
  ModelMetadata,
  ModelMetadataCache,
  ModelMetadataCapabilities,
  ModelMetadataLimits,
  ModelMetadataModalities,
  VendorRule,
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
 * - Build lookup maps for fuzzy vendor/model resolution.
 * - Provide cache info and vendor rules for downstream consumers.
 */
class ModelMetadataService {
  private cache: ModelMetadataCache | null = null
  private vendorRules: VendorRule[] = []
  private metadataMap: Map<string, ModelMetadata> = new Map()
  private initPromise: Promise<void> | null = null
  private lastFetch: number = 0

  private addMetadataLookupKeys(model: ModelMetadata): void {
    const normalizedId = model.id.trim().toLowerCase()
    if (normalizedId) {
      this.metadataMap.set(normalizedId, model)
    }

    const actualModel = extractActualModel(model.id)
    if (actualModel) {
      this.metadataMap.set(actualModel, model)
    }
  }

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
   * Refreshes cache, metadata map, and vendor rules on success.
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
      this.buildMetaDataMapFromCache()
      this.buildVendorRules()

      logger.info("Refreshed successfully", { models: models.length })
    } catch (error) {
      logger.error("Failed to refresh metadata", error)
      if (!this.cache) {
        this.initializeFallback()
      }
    }
  }

  /**
   * Build internal map from cleaned model id to metadata.
   *
   * Uses extractActualModel to strip prefixes/suffixes for lookup.
   */
  private buildMetaDataMapFromCache(): void {
    if (!this.cache) return

    this.metadataMap.clear()

    for (const model of this.cache.models) {
      this.addMetadataLookupKeys(model)
    }
  }

  /**
   * Build vendor detection rules from cached models.
   * Groups by provider and derives regex prefixes.
   *
   * Populates vendorRules with provider display names and regex patterns.
   */
  private buildVendorRules(): void {
    if (!this.cache) return

    // 按 providerId 分组，收集模型前缀
    const providerPrefixes: Map<string, Set<string>> = new Map()

    for (const model of this.cache.models) {
      if (!model.provider_id || !model.id) {
        continue
      }

      if (!providerPrefixes.has(model.provider_id)) {
        providerPrefixes.set(model.provider_id, new Set())
      }

      const actualModel = extractActualModel(model.id)
      // 提取前缀（取第一个 '-' 前的部分）
      const parts = actualModel.split("-")
      if (parts.length > 0) {
        const prefix = parts[0].toLowerCase().trim()
        if (prefix) {
          providerPrefixes.get(model.provider_id)!.add(prefix)
        }
      }

      // 如果没有 '-'，使用完整ID作为前缀（某些简短模型名）
      if (!actualModel.includes("-")) {
        const prefix = actualModel.toLowerCase().trim()
        if (prefix && prefix.length <= 15) {
          providerPrefixes.get(model.provider_id)!.add(prefix)
        }
      }
    }

    // 生成规则
    const rules: VendorRule[] = []

    for (const [providerID, prefixes] of providerPrefixes) {
      if (prefixes.size === 0) continue

      const displayName =
        PROVIDER_DISPLAY_NAMES[providerID] || this.capitalizeFirst(providerID)

      // 构建正则表达式（匹配任意前缀）
      const prefixList = Array.from(prefixes).map((prefix) =>
        prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      )

      const patternStr = `^(${prefixList.join("|")})`

      try {
        const pattern = new RegExp(patternStr, "i")
        rules.push({ providerID, displayName, pattern })
      } catch (error) {
        logger.warn("Failed to build pattern for provider", {
          providerID,
          error,
        })
      }
    }

    this.vendorRules = rules
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
   * Initialize fallback metadata/rules when remote fetch is unavailable.
   *
   * Seeds cache, metadata map, and vendor rules with bundled defaults.
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

    const defaultRules: VendorRule[] = [
      {
        providerID: "anthropic",
        displayName: "Anthropic",
        pattern: /^claude/i,
      },
      {
        providerID: "openai",
        displayName: "OpenAI",
        pattern: /^(gpt|chatgpt|o1|o3)/i,
      },
      { providerID: "google", displayName: "Google", pattern: /^gemini/i },
      { providerID: "alibaba", displayName: "阿里巴巴", pattern: /^qwen/i },
      {
        providerID: "alibaba-cn",
        displayName: "通义千问",
        pattern: /^(qwen|tongyi)/i,
      },
      {
        providerID: "deepseek",
        displayName: "DeepSeek",
        pattern: /^deepseek/i,
      },
      {
        providerID: "moonshot",
        displayName: "Moonshot",
        pattern: /^moonshot/i,
      },
      { providerID: "zhipu", displayName: "智谱", pattern: /^(glm|bigmodel)/i },
      { providerID: "mistral", displayName: "MistralAI", pattern: /^mistral/i },
      { providerID: "xai", displayName: "xAI", pattern: /^grok/i },
      { providerID: "meta", displayName: "Meta", pattern: /^llama/i },
    ]

    this.cache = {
      models: defaultMetadata,
      lastUpdated: Date.now(),
      version: "1.0-fallback",
    }

    this.lastFetch = Date.now()

    this.metadataMap.clear()
    for (const model of defaultMetadata) {
      this.addMetadataLookupKeys(model)
    }

    this.vendorRules = defaultRules
  }

  /**
   * Resolve a model name to a standard id and vendor display name.
   * Uses exact match first, then fuzzy match if no date suffix is present.
   */
  findStandardModelName(
    modelName: string,
  ): { standardName: string; vendorName: string } | null {
    if (!this.cache) return null

    const cleaned = modelName.trim().toLowerCase()
    if (!cleaned) return null

    // 精确匹配
    const metadata = this.metadataMap.get(cleaned)
    if (metadata) {
      const vendorName =
        PROVIDER_DISPLAY_NAMES[metadata.provider_id] ||
        this.capitalizeFirst(metadata.provider_id)
      return {
        standardName: metadata.id,
        vendorName,
      }
    }

    // 但如果输入已包含日期后缀（如 claude-3-haiku-20240307），则不进行模糊匹配
    // 因为这表示用户指定了特定的模型版本，不应该被重命名为其他版本
    if (removeDateSuffix(modelName) !== modelName) {
      return null
    }

    // 模糊匹配（处理同版本别名格式，如 claude-4.5-sonnet ↔ claude-sonnet-4-5）
    for (const [key, metadata] of this.metadataMap) {
      if (this.isFuzzyMatch(cleaned, key)) {
        const vendorName =
          PROVIDER_DISPLAY_NAMES[metadata.provider_id] ||
          this.capitalizeFirst(metadata.provider_id)
        return {
          standardName: metadata.id,
          vendorName,
        }
      }
    }

    return null
  }

  /**
   * Check if an input model name fuzzily matches a candidate.
   *
   * This is intentionally conservative: it supports harmless alias formats
   * (separator/order differences) but MUST NOT match across model versions.
   */
  private isFuzzyMatch(input: string, candidate: string): boolean {
    const cleanedInput = removeDateSuffix(input)
    const cleanedCandidate = removeDateSuffix(candidate)

    if (cleanedInput === cleanedCandidate) return true

    const inputParts = cleanedInput.split("-")
    const candidateParts = cleanedCandidate.split("-")

    if (inputParts.length === 0 || candidateParts.length === 0) return false

    // Require the same vendor/model-family prefix to reduce accidental matches
    if (inputParts[0] !== candidateParts[0]) return false

    const inputKey = toModelTokenKey(cleanedInput)
    const candidateKey = toModelTokenKey(cleanedCandidate)
    if (!inputKey || !candidateKey) return false

    return inputKey === candidateKey
  }

  /**
   * Find vendor display name by regex pattern match.
   */
  findVendorByPattern(modelName: string): string | null {
    const cleaned = modelName.toLowerCase().trim()

    for (const rule of this.vendorRules) {
      if (rule.pattern.test(cleaned)) {
        return rule.displayName
      }
    }

    return null
  }

  /**
   * Return a copy of vendor rules for callers.
   */
  getVendorRules(): VendorRule[] {
    return [...this.vendorRules]
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
   * Clear in-memory cache and derived maps/rules.
   */
  clearCache(): void {
    this.cache = null
    this.metadataMap.clear()
    this.vendorRules = []
    this.lastFetch = 0
  }
}

export const modelMetadataService = new ModelMetadataService()
