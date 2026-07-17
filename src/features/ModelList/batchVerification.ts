import { MODEL_GROUP_ACCESS_STATES } from "~/features/ModelList/groupContext"
import {
  MODEL_LIST_SOURCE_IDENTITY_KINDS,
  type ModelListSourceIdentity,
  type ModelManagementItemSource,
} from "~/features/ModelList/modelManagementSources"
import {
  hasUsableAccountRuntimeKeySecret,
  isAccountTokenRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
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

export const MODEL_LIST_BATCH_VERIFY_CONCURRENCY = 5
export const MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES = {
  AUTO: "auto",
} as const

export type BatchVerifyApiTypeMode =
  | (typeof MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES)[keyof typeof MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES]
  | ApiVerificationApiType

export type BatchVerifyModelItem = {
  key: string
  modelId: string
  enableGroups: string[] | null
  source: ModelManagementItemSource
  sourceIdentity?: ModelListSourceIdentity
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
    if (
      item.source.capabilities.supportsBatchCredentialVerification === false
    ) {
      continue
    }

    const modelId = item.model.model_name?.trim()
    if (!modelId) continue

    const key = getModelItemKey(item)
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    items.push({
      key,
      modelId,
      enableGroups:
        item.groupContext.accessState ===
        MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE
          ? null
          : item.activeGroupContext.actionGroups,
      source: item.source,
      sourceIdentity: item.sourceIdentity,
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
  if (mode !== MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES.AUTO) return mode

  const providerType = modelId.trim() ? identifyProvider(modelId) : null
  if (providerType === "Claude") return API_TYPES.ANTHROPIC
  if (providerType === "Gemini") return API_TYPES.GOOGLE
  return API_TYPES.OPENAI_COMPATIBLE
}

/** Returns whether a token is compatible with the batch row's model/group scope. */
function isBatchVerifyTokenCompatible(
  token: ApiToken,
  item: Pick<BatchVerifyModelItem, "modelId" | "enableGroups">,
) {
  return isTokenCompatibleWithModel(token, {
    id: item.modelId,
    enableGroups: item.enableGroups,
  })
}

/**
 * Pick the deterministic token used to verify a model for an account source.
 */
export function pickBatchVerifyCompatibleToken(
  tokens: ApiToken[],
  item: Pick<
    BatchVerifyModelItem,
    "modelId" | "enableGroups" | "sourceIdentity"
  >,
): ApiToken | null {
  if (
    item.sourceIdentity?.kind === MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_TOKEN
  ) {
    const sourceIdentity = item.sourceIdentity
    const token = tokens.find(
      (candidate) => candidate.id === sourceIdentity.tokenId,
    )
    return token && isBatchVerifyTokenCompatible(token, item) ? token : null
  }

  return (
    tokens.find((token) => isBatchVerifyTokenCompatible(token, item)) ?? null
  )
}

/**
 * Pick the deterministic runtime key used to verify a model for an account
 * source. Runtime-key scoped rows must match their source identity exactly.
 */
export function pickBatchVerifyCompatibleRuntimeKey(
  runtimeKeys: AccountRuntimeKey[],
  item: Pick<
    BatchVerifyModelItem,
    "modelId" | "enableGroups" | "sourceIdentity"
  >,
): AccountRuntimeKey | null {
  const isCompatible = (runtimeKey: AccountRuntimeKey) => {
    if (isAccountTokenRuntimeKey(runtimeKey)) {
      return isBatchVerifyTokenCompatible(runtimeKey.token, item)
    }

    return hasUsableAccountRuntimeKeySecret(runtimeKey)
  }

  if (
    item.sourceIdentity?.kind === MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_TOKEN
  ) {
    const sourceIdentity = item.sourceIdentity
    const runtimeKey = runtimeKeys.find(
      (candidate) =>
        isAccountTokenRuntimeKey(candidate) &&
        candidate.tokenId === sourceIdentity.tokenId,
    )
    return runtimeKey && isCompatible(runtimeKey) ? runtimeKey : null
  }

  if (
    item.sourceIdentity?.kind ===
    MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_RUNTIME_KEY
  ) {
    const sourceIdentity = item.sourceIdentity
    const runtimeKey = runtimeKeys.find(
      (candidate) => candidate.id === sourceIdentity.runtimeKeyId,
    )
    return runtimeKey && isCompatible(runtimeKey) ? runtimeKey : null
  }

  return runtimeKeys.find((runtimeKey) => isCompatible(runtimeKey)) ?? null
}
