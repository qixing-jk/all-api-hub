import {
  TEMP_CONTEXT_TASK_KINDS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import type {
  OctopusApiResourceBinding,
  TempWindowFetch,
} from "~/types/tempWindowFetch"
import { normalizeRequestInitForMessage } from "~/utils/browser/requestInitMessage"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"

/** Executes one allow-listed Octopus admin request in the site's own context. */
export async function tempWindowOctopusApiFetch(params: {
  originUrl: string
  resourceUsername: string
  fetchUrl: string
  fetchOptions?: RequestInit
  requestId?: string
  resourceBinding?: OctopusApiResourceBinding
  protectionBypassExecution: ProtectionBypassExecution
}): Promise<TempWindowFetch> {
  const {
    protectionBypassExecution: execution,
    fetchOptions,
    ...request
  } = params
  return await executeProtectionBypassTask({
    execution,
    task: {
      kind: TEMP_CONTEXT_TASK_KINDS.OctopusApiFetch,
      params: {
        ...request,
        // AbortSignal is not structured-cloneable. The caller still observes
        // cancellation locally while the temporary context receives only the
        // serializable RequestInit fields.
        ...(fetchOptions
          ? { fetchOptions: normalizeRequestInitForMessage(fetchOptions) }
          : {}),
        responseType: "json",
      },
    },
  })
}
