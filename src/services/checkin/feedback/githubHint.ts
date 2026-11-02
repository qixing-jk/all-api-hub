import { RuntimeActionIds } from "~/constants/runtimeActions"
import type { NotificationOptions } from "~/lib/notify"
import { sendRuntimeActionMessage } from "~/utils/browser/runtimeMessages"

import type { GitHubFeedbackHintPresentation } from "./githubIssue"

export type { GitHubFeedbackHint } from "./githubIssue"

let dismissedExpiresAt: number | null = null
const toastId = "checkin-feedback-paste"

/** Presents feedback guidance through the existing isolated content notification UI. */
export function showGitHubFeedbackHint(
  options: GitHubFeedbackHintPresentation,
  notify: {
    info: (message: string, options: NotificationOptions) => unknown
    dismiss: (id: string) => void
  },
): boolean {
  if (options.withdraw) {
    notify.dismiss(toastId)
    return true
  }
  const expected = new URL(options.targetUrl)
  if (
    location.origin !== expected.origin ||
    location.pathname !== expected.pathname ||
    Date.now() >= options.expiresAt ||
    dismissedExpiresAt === options.expiresAt
  )
    return false
  notify.info(options.description, {
    id: toastId,
    title: options.title,
    duration: options.expiresAt - Date.now(),
    action: {
      label: options.dismiss,
      onClick: async () => {
        const result = await sendRuntimeActionMessage<{ success: boolean }>(
          { action: RuntimeActionIds.DismissCheckInFeedbackHint },
          { maxAttempts: 1 },
        )
        if (!result?.success)
          throw new Error("Could not dismiss feedback guidance")
        dismissedExpiresAt = options.expiresAt
        notify.dismiss(toastId)
      },
    },
  })
  return true
}
