import { useEffect } from "react"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import notify from "~/lib/notify"
import { showTurnstileAssistPageNotice } from "~/services/checkin/turnstile/assistPageNotice"
import { onRuntimeMessage } from "~/utils/browser/runtimeMessages"

/** Listens only while an extension UI with a toast host is mounted. */
export function useTurnstileAssistPageNotice() {
  useEffect(
    () =>
      onRuntimeMessage((request, _sender, sendResponse) => {
        if (request.action !== RuntimeActionIds.TurnstileAssistPageNotice)
          return
        const shown = showTurnstileAssistPageNotice(request, notify)
        // Hidden extension pages must not win the response race against the focused UI.
        if (shown) sendResponse({ presented: true })
      }),
    [],
  )
}
