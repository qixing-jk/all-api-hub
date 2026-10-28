import {
  TEMP_CONTEXT_TASK_KINDS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"

/** Requests a read-only rendered capability observation with explicit caller intent. */
export async function inspectRenderedCredentialPage(
  originUrl: string,
  execution: ProtectionBypassExecution,
): Promise<"credential" | "not_found" | "unknown"> {
  try {
    const result = await executeProtectionBypassTask({
      execution,
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.CredentialPageInspect,
        params: { originUrl },
      },
    })
    return result?.success &&
      (result.state === "credential" || result.state === "not_found")
      ? result.state
      : "unknown"
  } catch {
    return "unknown"
  }
}
