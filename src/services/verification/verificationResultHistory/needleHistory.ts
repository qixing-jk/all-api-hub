import type { NeedleResult } from "~/services/verification/modelQuality/needleRun"

import type { ContextHistoryRequest } from "./contextCapacityHistory"
import { getVerificationScopeKey, modelTarget } from "./requestIdentity"
import { verificationResultHistoryStorage } from "./storage"
import type { ApiVerificationHistoryTarget, NeedleSummary } from "./types"

export const needleHistory = {
  async get(
    request: ContextHistoryRequest,
    target?: ApiVerificationHistoryTarget,
  ) {
    return verificationResultHistoryStorage.getNeedleSummary(
      await getVerificationScopeKey(request),
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
      scopeKey: await getVerificationScopeKey(request),
      verifiedAt,
      result,
    }
    await verificationResultHistoryStorage.upsertNeedleSummary(summary)
  },
}
export type NeedleHistoryAccess = typeof needleHistory
