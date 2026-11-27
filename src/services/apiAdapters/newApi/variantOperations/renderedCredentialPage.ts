import {
  CREDENTIAL_PAGE_STATES,
  TEMP_CONTEXT_TASK_KINDS,
  type CredentialPageState,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"

/** Requests a read-only rendered capability observation with explicit caller intent. */
export async function inspectRenderedCredentialPage(
  originUrl: string,
  execution: ProtectionBypassExecution,
): Promise<CredentialPageState> {
  try {
    const result = await executeProtectionBypassTask({
      execution,
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.CredentialPageInspect,
        params: { originUrl },
      },
    })
    return result?.success &&
      (result.state === CREDENTIAL_PAGE_STATES.Credential ||
        result.state === CREDENTIAL_PAGE_STATES.NotFound)
      ? result.state
      : CREDENTIAL_PAGE_STATES.Unknown
  } catch {
    return CREDENTIAL_PAGE_STATES.Unknown
  }
}
