import type { AccountRuntimeKeyModelAccess } from "~/services/accounts/runtimeKeyModelAccess"
import { DEFAULT_MODEL_GROUP } from "~/services/models/constants"

/** Translate the remaining token protocol fields before runtime consumers see them. */
export function projectNewApiTokenModelAccess(token: {
  group?: string
  model_limits_enabled?: boolean
  model_limits?: string
  models?: string
}): AccountRuntimeKeyModelAccess {
  const parseAllowedModels = (value: string | undefined) => [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ]
  // Compatible providers may use `models` for the token's own restrictions.
  // Preserve that precedence, including an explicitly enabled empty allow-list.
  const allowedModelIds = token.models?.trim()
    ? parseAllowedModels(token.models)
    : token.model_limits_enabled === true
      ? parseAllowedModels(token.model_limits)
      : null
  const suggestedModelIds = [
    ...new Set(
      [token.models, token.model_limits]
        .filter((value): value is string => typeof value === "string")
        .flatMap((value) => value.split(/[, \n]+/g))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ]

  return {
    groups: [token.group?.trim() || DEFAULT_MODEL_GROUP],
    allowedModelIds,
    suggestedModelIds,
  }
}
