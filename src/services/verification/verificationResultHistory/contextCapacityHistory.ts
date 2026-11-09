import { API_VERIFICATION_MODES } from "~/services/verification/aiApiVerification/types"
import {
  CONTEXT_ATTEMPT_FAILURE_REASONS,
  CONTEXT_ATTEMPT_OUTCOMES,
  CONTEXT_CAPACITY_REASONS,
} from "~/services/verification/modelQuality/contextCapacityConstants"
import type {
  ContextCapacityRunResult,
  RunContextCapacityParams,
} from "~/services/verification/modelQuality/contextCapacityRun"
import { CONTEXT_CAPACITY_INCONCLUSIVE_REASONS } from "~/services/verification/verificationResultHistory/types"

import {
  digestIdentity,
  getVerificationScopeKey,
  modelTarget,
} from "./requestIdentity"
import { verificationResultHistoryStorage } from "./storage"
import type {
  ApiVerificationHistoryTarget,
  ContextCapacitySummary,
} from "./types"
import { API_VERIFICATION_HISTORY_TARGET_KINDS } from "./types"

export type ContextHistoryRequest = Pick<
  RunContextCapacityParams,
  | "apiType"
  | "baseUrl"
  | "apiKey"
  | "modelId"
  | "mode"
  | "requestProfile"
  | "requestProfileEnhanced"
  | "requestHeaders"
>

/** A historical measurement can outlive our ability to verify a masked secret. */
export type ContextCapacityHistoryView = ContextCapacitySummary & {
  requiresCredentialVerification?: boolean
}

/** Restore an inventory-bound historical fact without revealing a secret. */
export async function getAccountInventoryContextHistory(
  target: ApiVerificationHistoryTarget,
  identity: string,
): Promise<ContextCapacityHistoryView | null> {
  const summary =
    await verificationResultHistoryStorage.getContextSummaryByInventory(
      target,
      await digestIdentity(identity),
    )
  return summary ? { ...summary, requiresCredentialVerification: true } : null
}

export const contextCapacityHistory = {
  async get(
    request: ContextHistoryRequest,
    target?: ApiVerificationHistoryTarget,
  ) {
    return verificationResultHistoryStorage.getContextSummary(
      await getVerificationScopeKey(request),
      modelTarget(target, request.modelId),
    )
  },
  async save(
    request: ContextHistoryRequest,
    result: ContextCapacityRunResult | null,
    target?: ApiVerificationHistoryTarget,
    inventoryIdentity?: string,
  ): Promise<ContextCapacitySummary> {
    const verifiedAt = Date.now()
    const lastAttempt = result?.attempts.at(-1)
    const summary: ContextCapacitySummary = {
      target: modelTarget(target, request.modelId),
      targetKey: "",
      scopeKey: await getVerificationScopeKey(request),
      ...(target?.kind === API_VERIFICATION_HISTORY_TARGET_KINDS.AccountModel &&
      inventoryIdentity
        ? { inventoryKey: await digestIdentity(inventoryIdentity) }
        : {}),
      verifiedAt,
      apiType: request.apiType,
      modelId: request.modelId,
      latencyMs: result?.latencyMs,
      mode: request.mode ?? API_VERIFICATION_MODES.Streaming,
      lowerBoundTokens: result?.lowerBoundTokens ?? 0,
      declaredContext: result?.counter.declaredContext,
      ...(result
        ? {
            counter: {
              encoding: result.counter.encoding,
              estimated: result.counter.estimated,
            },
          }
        : {}),
      upperBoundTokens: result?.upperBoundTokens,
      reason: result?.reason ?? CONTEXT_CAPACITY_REASONS.Error,
      ...(result?.reason === CONTEXT_CAPACITY_REASONS.Inconclusive
        ? {
            inconclusiveReason:
              lastAttempt?.failureReason ===
              CONTEXT_ATTEMPT_FAILURE_REASONS.Interrupted
                ? CONTEXT_CAPACITY_INCONCLUSIVE_REASONS.Interrupted
                : lastAttempt?.failureReason ===
                    CONTEXT_ATTEMPT_FAILURE_REASONS.Timeout
                  ? CONTEXT_CAPACITY_INCONCLUSIVE_REASONS.Timeout
                  : lastAttempt?.finishReason === "stop"
                    ? CONTEXT_CAPACITY_INCONCLUSIVE_REASONS.EmptyResponse
                    : undefined,
          }
        : {}),
      requests: result?.attempts.length ?? 0,
      outputLimited:
        result?.attempts.at(-1)?.outcome ===
          CONTEXT_ATTEMPT_OUTCOMES.Accepted &&
        result.attempts.at(-1)?.finishReason === "length",
    }
    await verificationResultHistoryStorage.upsertContextSummary(summary)
    return summary
  },
}

export type ContextCapacityHistoryAccess = typeof contextCapacityHistory
