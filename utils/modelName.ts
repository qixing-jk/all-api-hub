/**
 * Utilities for model name parsing and normalization
 */

/**
 * Normalize a model name by converting to lowercase and removing special characters
 * except hyphens and underscores
 */
export function normalizeModelName(modelName: string): string {
  return modelName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-_]/g, "")
}

/**
 * Extract tokens from a model name
 * Splits by common delimiters (hyphen, underscore, dot) and filters empty strings
 */
export function extractModelTokens(modelName: string): string[] {
  return modelName
    .toLowerCase()
    .split(/[-_.]/)
    .filter((token) => token.length > 0)
}

/**
 * Date format patterns to match in model names
 * Supports formats like:
 * - YYYY-MM-DD (2024-04-09)
 * - YYYYMMDD (20240409)
 * - YYYY.MM.DD (2024.04.09)
 */
const DATE_PATTERNS = [
  // YYYY-MM-DD or YYYY_MM_DD
  /(\d{4})[-_](\d{2})[-_](\d{2})/,
  // YYYYMMDD
  /(\d{4})(\d{2})(\d{2})/,
  // YYYY.MM.DD
  /(\d{4})\.(\d{2})\.(\d{2})/
]

/**
 * Parse date segments from a model name
 * Returns the date in YYYY-MM-DD format if found, undefined otherwise
 */
export function parseDateFromModelName(modelName: string): string | undefined {
  for (const pattern of DATE_PATTERNS) {
    const match = modelName.match(pattern)
    if (match) {
      const [, year, month, day] = match
      // Validate it's a reasonable date
      const yearNum = parseInt(year, 10)
      const monthNum = parseInt(month, 10)
      const dayNum = parseInt(day, 10)

      if (
        yearNum >= 2020 &&
        yearNum <= 2099 &&
        monthNum >= 1 &&
        monthNum <= 12 &&
        dayNum >= 1 &&
        dayNum <= 31
      ) {
        return `${year}-${month}-${day}`
      }
    }
  }
  return undefined
}

/**
 * Extract version numbers from a model name
 * Returns array of version segments like ["4", "1", "2"] for "gpt-4.1.2"
 */
export function extractVersionSegments(modelName: string): string[] {
  const tokens = extractModelTokens(modelName)
  const versions: string[] = []

  for (const token of tokens) {
    // Check if token is numeric or starts with 'v' followed by numbers
    if (/^\d+$/.test(token)) {
      versions.push(token)
    } else if (/^v\d+/.test(token)) {
      versions.push(token.substring(1))
    }
  }

  return versions
}

/**
 * Extract provider name from model name
 * Common patterns: gpt-*, claude-*, gemini-*, llama-*, etc.
 */
export function extractProviderName(modelName: string): string | undefined {
  const tokens = extractModelTokens(modelName)
  if (tokens.length === 0) return undefined

  const firstToken = tokens[0]

  // Known providers
  const providers = [
    "gpt",
    "claude",
    "gemini",
    "llama",
    "mistral",
    "palm",
    "bard",
    "codex",
    "davinci",
    "curie",
    "babbage",
    "ada",
    "yi",
    "qwen",
    "deepseek",
    "moonshot",
    "glm",
    "chatglm"
  ]

  if (providers.includes(firstToken)) {
    return firstToken
  }

  return undefined
}

/**
 * Calculate similarity score between two model names
 * Returns a score between 0 and 1
 */
export function calculateModelSimilarity(
  model1: string,
  model2: string
): number {
  const tokens1 = new Set(extractModelTokens(model1))
  const tokens2 = new Set(extractModelTokens(model2))

  if (tokens1.size === 0 || tokens2.size === 0) return 0

  // Calculate Jaccard similarity
  const intersection = new Set([...tokens1].filter((t) => tokens2.has(t)))
  const union = new Set([...tokens1, ...tokens2])

  return intersection.size / union.size
}

/**
 * Check if a channel model matches a standard model
 * Uses token-based matching to determine if they refer to the same model
 */
export function isModelMatch(
  channelModel: string,
  standardModel: string,
  similarityThreshold: number = 0.5
): boolean {
  // Exact match
  if (normalizeModelName(channelModel) === normalizeModelName(standardModel)) {
    return true
  }

  // Token-based similarity
  const similarity = calculateModelSimilarity(channelModel, standardModel)
  return similarity >= similarityThreshold
}

/**
 * Build comparison weight for a model based on its characteristics
 * Used for deterministic tie-breaking in scoring
 */
export function buildModelComparisonWeight(modelName: string): {
  date?: string
  version: string[]
  lexicographic: string
} {
  return {
    date: parseDateFromModelName(modelName),
    version: extractVersionSegments(modelName),
    lexicographic: normalizeModelName(modelName)
  }
}

/**
 * Compare two models for deterministic ordering
 * Returns:
 * - negative if model1 should come before model2
 * - positive if model2 should come before model1
 * - 0 if they are equal
 */
export function compareModels(model1: string, model2: string): number {
  const weight1 = buildModelComparisonWeight(model1)
  const weight2 = buildModelComparisonWeight(model2)

  // Compare by date (latest first)
  if (weight1.date && weight2.date) {
    if (weight1.date > weight2.date) return -1
    if (weight1.date < weight2.date) return 1
  } else if (weight1.date) {
    return -1 // model1 has date, model2 doesn't - prefer model1
  } else if (weight2.date) {
    return 1 // model2 has date, model1 doesn't - prefer model2
  }

  // Compare by version (lexicographic comparison of version arrays)
  const minVersionLength = Math.min(
    weight1.version.length,
    weight2.version.length
  )
  for (let i = 0; i < minVersionLength; i++) {
    const v1 = parseInt(weight1.version[i], 10) || 0
    const v2 = parseInt(weight2.version[i], 10) || 0
    if (v1 > v2) return -1
    if (v1 < v2) return 1
  }

  // If versions are equal up to min length, prefer longer version
  if (weight1.version.length > weight2.version.length) return -1
  if (weight1.version.length < weight2.version.length) return 1

  // Finally, compare lexicographically
  if (weight1.lexicographic < weight2.lexicographic) return -1
  if (weight1.lexicographic > weight2.lexicographic) return 1

  return 0
}
