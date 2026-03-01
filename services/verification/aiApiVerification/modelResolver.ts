import type { ApiToken } from "~/types"

import { guessModelIdFromToken } from "./utils"

/**
 * Inputs used to resolve a model id for verification runs.
 */
export type ModelIdContext = {
  modelId?: string
  tokenMeta?: Pick<ApiToken, "models" | "model_limits" | "name" | "id">
}

/**
 * Resolve the model id requested by the caller.
 * Falls back to a best-effort guess from token metadata.
 */
export function resolveRequestedModelId(
  params: ModelIdContext,
): string | undefined {
  const tokenHint = params.tokenMeta
    ? guessModelIdFromToken(params.tokenMeta)
    : undefined
  return params.modelId ?? tokenHint
}
