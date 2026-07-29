import {
  OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES,
  OPENROUTER_BOOTSTRAP_MUTATION_STATES,
} from "~/constants/openRouterBootstrap"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { resolveTempWindowRequestPolicy } from "~/utils/browser/tempWindowRequestSource"

import type {
  TempWindowOpenRouterManagementKeyActionParams,
  TempWindowOpenRouterManagementKeyActionResult,
  TempWindowOpenRouterManagementKeyCancelResult,
} from "./managementKeyPageContract"
import {
  normalizeOpenRouterManagementKeyActionResult,
  normalizeOpenRouterManagementKeyCancelResult,
} from "./managementKeyPageContract"

/** Executes the canonical OpenRouter Management Keys page action. */
export async function tempWindowOpenRouterManagementKeyAction(
  params: TempWindowOpenRouterManagementKeyActionParams,
): Promise<TempWindowOpenRouterManagementKeyActionResult> {
  const policy = resolveTempWindowRequestPolicy({
    tempWindowRequestSource: params.tempWindowRequestSource,
    suppressMinimize: params.suppressMinimize,
  })
  if (policy.blockedReason) {
    return {
      requestId: params.requestId,
      operation: "create",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
      label: params.operation.label,
    }
  }
  const payload: TempWindowOpenRouterManagementKeyActionParams = {
    requestId: params.requestId,
    operation: params.operation,
    tempWindowRequestSource: policy.tempWindowRequestSource,
    suppressMinimize: policy.suppressMinimize,
  }

  const response = await sendRuntimeMessage({
    action: RuntimeActionIds.TempWindowOpenRouterManagementKeyAction,
    ...payload,
  })
  return normalizeOpenRouterManagementKeyActionResult(payload, response)
}

/** Requests cancellation using only the opaque action request ID. */
export async function cancelTempWindowOpenRouterManagementKeyAction(
  requestId: string,
): Promise<TempWindowOpenRouterManagementKeyCancelResult> {
  try {
    const response = await sendRuntimeMessage({
      action: RuntimeActionIds.TempWindowCancelOpenRouterManagementKeyAction,
      requestId,
    })
    return normalizeOpenRouterManagementKeyCancelResult(requestId, response)
  } catch {
    return normalizeOpenRouterManagementKeyCancelResult(requestId, undefined)
  }
}
