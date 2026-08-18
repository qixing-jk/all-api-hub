import {
  TEMP_CONTEXT_TASK_KINDS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import type { TempWindowFetch } from "~/types/tempWindowFetch"
import { normalizeRequestInitForMessage } from "~/utils/browser/requestInitMessage"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"

/** Executes one allow-listed Octopus admin request in the site's own context. */
export async function tempWindowOctopusApiFetch(params: {
  originUrl: string
  fetchUrl: string
  fetchOptions?: RequestInit
  requestId?: string
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
        ...(fetchOptions
          ? { fetchOptions: normalizeRequestInitForMessage(fetchOptions) }
          : {}),
        responseType: "json",
      },
    },
  })
}
