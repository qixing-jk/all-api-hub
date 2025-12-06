import { extractActualModel } from "~/services/modelRedirect/modelNormalization"
import { removeDateSuffix } from "~/utils/modelName"

import {
  MODEL_METADATA_REFRESH_INTERVAL,
  MODEL_METADATA_URL,
} from "./constants"
import type { ModelMetadata, ModelMetadataCache, VendorRule } from "./types"

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

  /**
   * Initialize metadata (idempotent). Reuses in-flight init promise.
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this._initialize()
    return this.initPromise
  }

  /**
   * Internal initialize: skip fetch if cache is fresh, otherwise refresh.
   */
  private async _initialize(): Promise<void> {
    try {
      const now = Date.now()

      if (
        this.cache &&
        now - this.lastFetch < MODEL_METADATA_REFRESH_INTERVAL
      ) {
        console.log("[ModelMetadata] Using in-memory cache")
        return
      }

      await this.refreshMetadata()
    } catch (error) {
      console.error("[ModelMetadata] Failed to initialize:", error)
      this.initializeFallback()
    }
  }

  /**
   * Fetch metadata from remote endpoint and rebuild caches.
   * Falls back to existing cache if fetch fails.
   */
  async refreshMetadata(): Promise<void> {
    try {
      console.log("[ModelMetadata] Fetching from", MODEL_METADATA_URL)
      const response = await fetch(MODEL_METADATA_URL)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (!data || typeof data !== "object") {
        throw new Error("Invalid metadata format: expected object")
      }

      const modelsArray = data.models || data
      if (!Array.isArray(modelsArray)) {
        throw new Error("Invalid metadata format: models should be array")
      }

      const models: ModelMetadata[] = modelsArray.map((item: any) => ({
        id: item.id || "",
        name: item.name || item.id || "",
        provider_id: item.providerId || item.provider_id || "",
      }))

      this.cache = {
        models,
        lastUpdated: Date.now(),
        version: "1.0",
      }

      this.lastFetch = Date.now()
      this.buildMetaDataMapFromCache()
      this.buildVendorRules()

      console.log("[ModelMetadata] Refreshed successfully", {
        models: models.length,
      })
    } catch (error) {
      console.error("[ModelMetadata] Failed to refresh metadata:", error)
      if (!this.cache) {
        this.initializeFallback()
      }
    }
  }

  /**
   * Build internal map from cleaned model id to metadata.
   */
  private buildMetaDataMapFromCache(): void {
    if (!this.cache) return

    this.metadataMap.clear()

    for (const model of this.cache.models) {
      const actualModel = extractActualModel(model.id)
      if (actualModel) {
        this.metadataMap.set(actualModel, model)
      }
    }
  }

  /**
   * Build vendor detection rules from cached models.
   * Groups by provider and derives regex prefixes.
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

      // 提取前缀（取第一个 '-' 前的部分）
      const parts = model.id.split("-")
      if (parts.length > 0) {
        const prefix = parts[0].toLowerCase().trim()
        if (prefix) {
          providerPrefixes.get(model.provider_id)!.add(prefix)
        }
      }

      // 如果没有 '-'，使用完整ID作为前缀（某些简短模型名）
      if (!model.id.includes("-")) {
        const prefix = model.id.toLowerCase().trim()
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
        console.warn(
          `[ModelMetadata] Failed to build pattern for ${providerID}:`,
          error,
        )
      }
    }

    this.vendorRules = rules
  }

  /**
   * Capitalize hyphen/space-delimited provider id for display.
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
   */
  private initializeFallback(): void {
    console.warn("[ModelMetadata] Using fallback default data")

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
      const actualModel = extractActualModel(model.id)
      if (actualModel) {
        this.metadataMap.set(actualModel, model)
      }
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

    // 模糊匹配（处理别名情况，如 claude-haiku-4-5 → claude-3.5-haiku）
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
   * Ignores date suffixes and requires shared vendor keyword overlap.
   */
  private isFuzzyMatch(input: string, candidate: string): boolean {
    const cleanedInput = removeDateSuffix(input)
    const cleanedCandidate = removeDateSuffix(candidate)

    if (cleanedInput === cleanedCandidate) return true

    const inputParts = cleanedInput.split("-")
    const candidateParts = cleanedCandidate.split("-")

    if (inputParts.length === 0 || candidateParts.length === 0) {
      return false
    }

    if (inputParts[0] !== candidateParts[0]) {
      return false
    }

    const isVersionNumber = (value: string) => /^\d+(\.\d+)?$/.test(value)

    const toKeywordSet = (parts: string[]) => {
      const set = new Set<string>()
      for (const part of parts) {
        if (!isVersionNumber(part)) {
          set.add(part)
        }
      }
      return set
    }

    const inputKeywords = toKeywordSet(inputParts)
    const candidateKeywords = toKeywordSet(candidateParts)

    if (inputKeywords.size === 0 || candidateKeywords.size === 0) {
      return false
    }

    // 新增：检查输入是否有候选名没有的额外关键词
    for (const keyword of inputKeywords) {
      if (!candidateKeywords.has(keyword)) {
        return false // 有额外关键词，直接拒绝匹配
      }
    }

    // 然后才检查匹配数量
    let matchCount = 0
    for (const keyword of candidateKeywords) {
      if (inputKeywords.has(keyword)) {
        matchCount++
      }
    }
    return matchCount >= 2
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
    return [...this.cache.models]
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
