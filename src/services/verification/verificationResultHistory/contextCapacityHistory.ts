import {
  API_VERIFICATION_MODES,
  API_VERIFICATION_REQUEST_PROFILES,
} from "~/services/verification/aiApiVerification/types"
import {
  CONTEXT_ATTEMPT_OUTCOMES,
  CONTEXT_CAPACITY_REASONS,
} from "~/services/verification/modelQuality/contextCapacityConstants"
import type {
  ContextCapacityRunResult,
  RunContextCapacityParams,
} from "~/services/verification/modelQuality/contextCapacityRun"

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

/** Hash the complete request identity; neither credentials nor the URL are stored. */
export async function getContextCapacityScopeKey(
  request: ContextHistoryRequest,
) {
  return digestIdentity(getContextCapacityRequestIdentity(request))
}

/** In-memory equality only; never persist the unhashed request identity. */
export function getContextCapacityRequestIdentity(
  request: ContextHistoryRequest,
) {
  const headers = Object.entries(request.requestHeaders ?? {})
    .map(([name, value]) => [name.toLowerCase(), value])
    .sort()
  return JSON.stringify([
    request.apiType,
    request.baseUrl.trim().replace(/\/+$/, ""),
    request.apiKey,
    request.modelId.trim(),
    request.mode ?? API_VERIFICATION_MODES.Streaming,
    request.requestProfile ?? API_VERIFICATION_REQUEST_PROFILES.Default,
    request.requestProfileEnhanced ?? false,
    headers,
  ])
}

/** Only digests are persisted; the unhashed connection identity stays in memory. */
async function digestIdentity(identity: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

/** Bind profile-level entry points to the model actually tested. */
function modelTarget(
  target: ApiVerificationHistoryTarget | undefined,
  modelId: string,
) {
  return target?.kind === API_VERIFICATION_HISTORY_TARGET_KINDS.Profile
    ? ({
        kind: API_VERIFICATION_HISTORY_TARGET_KINDS.ProfileModel,
        profileId: target.profileId,
        modelId,
      } as const)
    : target
}

export const contextCapacityHistory = {
  async get(
    request: ContextHistoryRequest,
    target?: ApiVerificationHistoryTarget,
  ) {
    return verificationResultHistoryStorage.getContextSummary(
      await getContextCapacityScopeKey(request),
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
      scopeKey: await getContextCapacityScopeKey(request),
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
      upperBoundTokens: result?.upperBoundTokens,
      reason: result?.reason ?? CONTEXT_CAPACITY_REASONS.Error,
      ...(result?.reason === CONTEXT_CAPACITY_REASONS.Inconclusive
        ? {
            inconclusiveReason:
              lastAttempt?.failureReason === "interrupted"
                ? ("interrupted" as const)
                : lastAttempt?.failureReason === "timeout"
                  ? ("timeout" as const)
                  : lastAttempt?.finishReason === "stop"
                    ? ("empty-response" as const)
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
