import type { ApiToken } from "~/types"

/**
 * Parses a comma-separated model allow-list string into a normalized string array.
 *
 * Normalization rules:
 * - Split by comma
 * - Trim whitespace
 * - Drop empty entries
 * - De-duplicate while preserving original order
 */
export function parseTokenModelAllowList(
  value: string | null | undefined,
): string[] {
  if (typeof value !== "string") return []

  const seen = new Set<string>()
  const parsed: string[] = []

  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (seen.has(item)) return
      seen.add(item)
      parsed.push(item)
    })

  return parsed
}

const getTokenActiveModelAllowList = (
  token: Pick<ApiToken, "model_limits_enabled" | "model_limits" | "models">,
): string[] | null => {
  if (typeof token.models === "string" && token.models.trim().length > 0) {
    return parseTokenModelAllowList(token.models)
  }

  if (token.model_limits_enabled === true) {
    return parseTokenModelAllowList(token.model_limits)
  }

  return null
}

const normalizeTokenGroup = (
  group: Pick<ApiToken, "group">["group"],
): string => {
  const normalized = typeof group === "string" ? group.trim() : ""
  return normalized || "default"
}

/**
 * Determines whether a token can be used with a specific model id.
 *
 * Rules:
 * - Token must be enabled (`status === 1`).
 * - Model must be available for the token's group (model's enable_groups includes token group).
 * - If no allow-list is active/present, token is compatible with all models.
 * - If an allow-list is active/present, token is compatible only when it includes the model id.
 */
export function isTokenCompatibleWithModel(
  token: Pick<
    ApiToken,
    "status" | "group" | "model_limits_enabled" | "model_limits" | "models"
  >,
  model: { id: string; enableGroups: string[] },
): boolean {
  if (token.status !== 1) return false

  const normalizedModelId = model.id.trim()
  if (!normalizedModelId) return false

  const tokenGroup = normalizeTokenGroup(token.group)
  if (!model.enableGroups.includes(tokenGroup)) {
    return false
  }

  const allowList = getTokenActiveModelAllowList(token)
  if (allowList === null) return true
  if (allowList.length === 0) return false
  return allowList.includes(normalizedModelId)
}
