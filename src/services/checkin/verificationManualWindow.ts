import { RuntimeActionIds } from "~/constants/runtimeActions"
import { TURNSTILE_MANUAL_WAIT_MS } from "~/constants/turnstile"
import { onRuntimeMessage } from "~/utils/browser/runtimeMessages"

/** Gives a live verification one fresh manual budget when its reminder is opened. */
export function createVerificationManualWindow(requestId?: string | null) {
  let deadline = 0
  const dispose = requestId
    ? onRuntimeMessage((message, _sender, respond) => {
        if (
          message?.action !==
            RuntimeActionIds.ContentVerificationAssistOpened ||
          message.requestId !== requestId
        )
          return
        // Repeated clicks cannot retain an otherwise abandoned window forever.
        if (!deadline) deadline = Date.now() + TURNSTILE_MANUAL_WAIT_MS
        respond({ success: true })
      })
    : () => {}
  return { getDeadline: () => deadline, dispose }
}
