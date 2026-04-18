import { identifyProvider } from "~/services/models/utils/modelProviders"
import { isTokenCompatibleWithModel } from "~/services/models/utils/tokenModelCompatibility"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import type { ApiToken } from "~/types"

import {
  getModelItemKey,
  type CalculatedModelItem,
} from "./hooks/useFilteredModels"
import { type ModelManagementItemSource } from "./modelManagementSources"

export const MODEL_LIST_BATCH_VERIFY_CONCURRENCY = 5

export type BatchVerifyApiTypeMode = "auto" | ApiVerificationApiType

export type BatchVerifyModelItem = {
  key: string
  modelId: string
  enableGroups: string[] | null
  source: ModelManagementItemSource
}

/**
 * Build a stable, de-duplicated snapshot of the currently displayed model rows.
 */
export function createBatchVerifyModelItems(
  models: CalculatedModelItem[],
): BatchVerifyModelItem[] {
  const seenKeys = new Set<string>()
  const items: BatchVerifyModelItem[] = []

  for (const item of models) {
    const modelId = item.model.model_name?.trim()
    if (!modelId) continue

    const key = getModelItemKey(item)
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    items.push({
      key,
      modelId,
      enableGroups: Array.isArray(item.model.enable_groups)
        ? item.model.enable_groups
        : null,
      source: item.source,
    })
  }

  return items
}

/**
 * Resolve the API family for a batch row. `auto` mirrors the single-model
 * verification dialog's model-name based default.
 */
export function resolveBatchVerifyApiType(
  mode: BatchVerifyApiTypeMode,
  modelId: string,
): ApiVerificationApiType {
  if (mode !== "auto") return mode

  const providerType = modelId.trim() ? identifyProvider(modelId) : null
  if (providerType === "Claude") return API_TYPES.ANTHROPIC
  if (providerType === "Gemini") return API_TYPES.GOOGLE
  return API_TYPES.OPENAI_COMPATIBLE
}

/**
 * Pick the deterministic token used to verify a model for an account source.
 */
export function pickBatchVerifyCompatibleToken(
  tokens: ApiToken[],
  item: Pick<BatchVerifyModelItem, "modelId" | "enableGroups">,
): ApiToken | null {
  return (
    tokens.find((token) =>
      isTokenCompatibleWithModel(token, {
        id: item.modelId,
        enableGroups: item.enableGroups,
      }),
    ) ?? null
  )
}
