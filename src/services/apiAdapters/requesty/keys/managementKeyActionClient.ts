import {
  createRequestyManagementKeyFailure,
  REQUESTY_PROVISIONING_FAILURE_REASONS,
  REQUESTY_PROVISIONING_STATES,
  type TempWindowRequestyManagementKeyActionParams,
  type TempWindowRequestyManagementKeyActionResult,
} from "~/services/apiAdapters/requesty/keys/managementKeyPageContract"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { TEMP_CONTEXT_TASK_KINDS } from "~/services/protectionBypass/contracts"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"

/**
 * Runs one Requesty manage-key page action through the shared temp-window task
 * boundary. The page action creates the key inside the console tab, where the
 * Clerk JWT lives; this module only owns the task envelope.
 */
export async function tempWindowRequestyManagementKeyAction(params: {
  requestId: string
  name: string
  suppressMinimize?: boolean
  protectionBypassExecution: ProtectionBypassExecution
}): Promise<TempWindowRequestyManagementKeyActionResult> {
  const task = {
    kind: TEMP_CONTEXT_TASK_KINDS.RequestyManagementKeyAction,
    params: {
      requestId: params.requestId,
      operation: { kind: "create", name: params.name },
      ...(params.suppressMinimize === undefined
        ? {}
        : { suppressMinimize: params.suppressMinimize }),
    },
  } as const satisfies {
    kind: typeof TEMP_CONTEXT_TASK_KINDS.RequestyManagementKeyAction
    params: TempWindowRequestyManagementKeyActionParams
  }

  const response = await executeProtectionBypassTask({
    execution: params.protectionBypassExecution,
    task,
  })
  const result = response as
    | TempWindowRequestyManagementKeyActionResult
    | null
    | undefined
  if (
    result &&
    result.requestId === params.requestId &&
    result.operation === "create" &&
    (result.state === REQUESTY_PROVISIONING_STATES.Created ||
      result.state === REQUESTY_PROVISIONING_STATES.NotDispatched ||
      result.state === REQUESTY_PROVISIONING_STATES.DispatchedUnconfirmed)
  ) {
    return result
  }
  return createRequestyManagementKeyFailure(
    params.requestId,
    params.name,
    REQUESTY_PROVISIONING_STATES.DispatchedUnconfirmed,
    REQUESTY_PROVISIONING_FAILURE_REASONS.PlaintextMissing,
  )
}
