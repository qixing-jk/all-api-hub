import { RuntimeActionIds } from "~/constants/runtimeActions"
import { CHECKIN_FEEDBACK_TAB_HINT_PREFIX } from "~/services/core/storageKeys"
import { sendTabMessageWithRetry } from "~/utils/browser/runtimeMessages"
import {
  getSessionStorageValues,
  removeSessionStorageValues,
  setSessionStorageValues,
} from "~/utils/browser/storage"
import {
  createTab,
  onTabRemoved,
  onTabUpdated,
  updateTab,
} from "~/utils/browser/tabs"
import { createLogger } from "~/utils/core/logger"

import type { GitHubFeedbackHint } from "./githubHint"
import {
  CHECKIN_FEEDBACK_ISSUE_LIMITS,
  CHECKIN_FEEDBACK_ISSUE_URL,
  type GitHubFeedbackHintPresentation,
} from "./githubIssue"

const logger = createLogger("CheckInFeedbackTab")
const target = new URL(CHECKIN_FEEDBACK_ISSUE_URL)
type PendingHint = { hint: GitHubFeedbackHint; expiresAt: number }
const keyForTab = (tabId: number) =>
  `${CHECKIN_FEEDBACK_TAB_HINT_PREFIX}${tabId}`

/** Restricts guidance to this repository's issue composer, independent of query parameters. */
function isIssueComposer(url: string): boolean {
  try {
    const candidate = new URL(url)
    return (
      candidate.origin === target.origin &&
      candidate.pathname === target.pathname
    )
  } catch {
    return false
  }
}

/** Background owns opening and arming, so closing the originating popup cannot interrupt it. */
export async function openCheckInFeedbackIssueTab(
  url: string,
  hint: GitHubFeedbackHint,
) {
  if (
    !isIssueComposer(url) ||
    url.length > CHECKIN_FEEDBACK_ISSUE_LIMITS.urlLength ||
    !hint ||
    ![hint.title, hint.description, hint.dismiss].every(
      (value) =>
        typeof value === "string" &&
        value.length > 0 &&
        value.length <= CHECKIN_FEEDBACK_ISSUE_LIMITS.hintTextLength,
    )
  ) {
    throw new Error("Invalid feedback destination or guidance")
  }
  const tab = await createTab("about:blank", false)
  if (typeof tab?.id !== "number")
    throw new Error("Feedback tab was not created")
  await setSessionStorageValues({
    [keyForTab(tab.id)]: {
      hint,
      expiresAt: Date.now() + CHECKIN_FEEDBACK_ISSUE_LIMITS.hintLifetimeMs,
    },
  })
  try {
    await updateTab(tab.id, { url, active: true })
  } catch (error) {
    await dismissCheckInFeedbackTabHint(tab.id).catch(() => {})
    throw error
  }
}

/** Removing one independent tab key requires no read-modify-write transaction. */
export async function dismissCheckInFeedbackTabHint(tabId: number) {
  await removeSessionStorageValues(keyForTab(tabId))
}

/** Restores a live composer hint and retires it once the tab reaches an issue. */
async function showHint(tabId: number, url: string) {
  let page: URL
  try {
    page = new URL(url)
  } catch {
    return
  }
  if (page.origin !== target.origin) return
  const key = keyForTab(tabId)
  const values = await getSessionStorageValues(key)
  const pending = values[key] as PendingHint | undefined
  if (!pending) return
  const presentation: GitHubFeedbackHintPresentation = {
    ...pending.hint,
    expiresAt: pending.expiresAt,
    targetUrl: target.href,
  }
  if (page.pathname !== target.pathname) {
    const issuePrefix = target.pathname.replace(/new$/, "")
    if (
      page.pathname.startsWith(issuePrefix) &&
      /^\d+\/?$/.test(page.pathname.slice(issuePrefix.length))
    ) {
      await dismissCheckInFeedbackTabHint(tabId)
    }
    // SPA navigation preserves the content runtime; withdraw its existing toast.
    await sendTabMessageWithRetry(
      tabId,
      {
        action: RuntimeActionIds.ContentCheckInFeedbackHint,
        hint: { ...presentation, withdraw: true },
      },
      { frameId: 0, maxAttempts: 1 },
    ).catch(() => {})
    return
  }
  if (pending.expiresAt <= Date.now()) {
    await dismissCheckInFeedbackTabHint(tabId)
    return
  }
  await sendTabMessageWithRetry(
    tabId,
    {
      action: RuntimeActionIds.ContentCheckInFeedbackHint,
      hint: presentation,
    },
    { frameId: 0 },
  )
}

/** Register synchronously on each worker start; session markers survive worker suspension. */
export function setupCheckInFeedbackTabHints() {
  const stopUpdates = onTabUpdated((tabId, change, tab) => {
    if (change.status !== "complete" && !change.url) return
    const url = change.url ?? tab.url
    if (!url) return
    void showHint(tabId, url).catch((error) =>
      logger.debug("Could not show feedback guidance", { error }),
    )
  })
  const stopRemoved = onTabRemoved((tabId) => {
    void dismissCheckInFeedbackTabHint(tabId).catch(() => {})
  })
  return () => {
    stopUpdates()
    stopRemoved()
  }
}
