import { RuntimeActionIds } from "~/constants/runtimeActions"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"

/** Reuses the existing content-to-background diagnostic channel without awaiting it. */
export function relayContentLog(
  event: string,
  details?: Record<string, unknown>,
) {
  try {
    void sendRuntimeMessage({
      action: RuntimeActionIds.CloudflareGuardLog,
      event,
      details: details ?? null,
    }).catch(() => {})
  } catch {
    // A closed page or unavailable background must not affect the observed task.
  }
}
