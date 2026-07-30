import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  TEMP_CONTEXT_TASK_KINDS,
  type ProtectionBypassExecution,
  type TempContextTask,
} from "~/services/protectionBypass/contracts"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"

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
  params: TempWindowOpenRouterManagementKeyActionParams & {
    protectionBypassExecution: ProtectionBypassExecution
  },
): Promise<TempWindowOpenRouterManagementKeyActionResult> {
  const task: Extract<
    TempContextTask,
    { kind: typeof TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction }
  > = {
    kind: TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction,
    params: {
      requestId: params.requestId,
      operation: params.operation,
      ...(params.suppressMinimize === undefined
        ? {}
        : { suppressMinimize: params.suppressMinimize }),
    },
  }

  const response = await executeProtectionBypassTask({
    execution: params.protectionBypassExecution,
    task,
  })
  return normalizeOpenRouterManagementKeyActionResult(params, response)
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
