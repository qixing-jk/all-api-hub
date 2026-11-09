import {
  toProtocolRoot,
  toVersionedProtocolMount,
} from "~/services/aiApi/protocolAddress"
import type { NeedleResult } from "~/services/verification/modelQuality/needleRun"

import type { ContextHistoryRequest } from "./contextCapacityHistory"
import { getVerificationScopeKey, modelTarget } from "./requestIdentity"
import { verificationResultHistoryStorage } from "./storage"
import type { ApiVerificationHistoryTarget, NeedleSummary } from "./types"

/** Needle execution, checkpoints and history share the same protocol base address. */
export function getNeedleScopeKey(request: ContextHistoryRequest) {
  const mount = toVersionedProtocolMount(request.apiType, request.baseUrl)
  const baseUrl = mount && toProtocolRoot(request.apiType, mount)
  if (!baseUrl) throw new Error("Invalid base URL")
  return getVerificationScopeKey({ ...request, baseUrl })
}

export const needleHistory = {
  async get(
    request: ContextHistoryRequest,
    target?: ApiVerificationHistoryTarget,
  ) {
    return verificationResultHistoryStorage.getNeedleSummary(
      await getNeedleScopeKey(request),
      modelTarget(target, request.modelId),
    )
  },
  async save(
    request: ContextHistoryRequest,
    result: NeedleResult,
    target?: ApiVerificationHistoryTarget,
  ) {
    const verifiedAt = Date.now()
    const summary: NeedleSummary = {
      target: modelTarget(target, request.modelId),
      targetKey: "",
      scopeKey: await getNeedleScopeKey(request),
      verifiedAt,
      result,
    }
    await verificationResultHistoryStorage.upsertNeedleSummary(summary)
  },
}
export type NeedleHistoryAccess = typeof needleHistory
