import { BROWSER_LOGIN_FAILURE_REASONS } from "~/constants/browserLogin"
import { TURNSTILE_MANUAL_WAIT_MS } from "~/constants/turnstile"
import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import { waitForTabComplete } from "~/services/browsingContext/tempPage/browserAdapter"
import { ProtectionPageTimeoutError } from "~/services/browsingContext/tempPage/tempContextProtectionGuards"

import { requestLoginVerificationAssist } from "./verificationContexts"

const PROTECTION_RECHECK_DELAY_MS = 750

/** The page could not be inspected; no site action has been admitted. */
class BrowserLoginPageUnavailableError extends Error {}

/** Preserve readiness failures separately from errors in dispatched site work. */
export function getBrowserLoginPageFailureReason(error: unknown) {
  if (error instanceof ProtectionPageTimeoutError)
    return BROWSER_LOGIN_FAILURE_REASONS.VerificationRequired
  if (error instanceof BrowserLoginPageUnavailableError)
    return BROWSER_LOGIN_FAILURE_REASONS.PageUnavailable
  return undefined
}

/** Waits in the owned login page, including the existing reminder's bounded extension. */
export async function waitForBrowserLoginPageProtection(context: {
  tabId: number
  origin: string
  requestId: string
  signal?: AbortSignal
  assertOrigin(): Promise<void>
  interactionDeadline(): number
}): Promise<void> {
  const { signal } = context
  let manualDeadline = 0
  const deadline = () => Math.max(manualDeadline, context.interactionDeadline())
  for (;;) {
    const remaining = deadline() - Date.now()
    if (manualDeadline && remaining <= 0) throw new ProtectionPageTimeoutError()
    try {
      await context.assertOrigin()
      await runAbortableTask(
        (signal) =>
          waitForTabComplete(context.tabId, {
            requestId: context.requestId,
            origin: context.origin,
            signal,
          }),
        {
          signals: [signal],
          ...(manualDeadline ? { timeoutMs: remaining } : {}),
        },
      )
      await context.assertOrigin()
      if (manualDeadline && Date.now() >= deadline())
        throw new ProtectionPageTimeoutError()
      return
    } catch (error) {
      signal?.throwIfAborted()
      if (manualDeadline && Date.now() >= deadline())
        throw new ProtectionPageTimeoutError()
      // Opening the existing reminder can extend its deadline while an
      // earlier guard attempt is in flight. Resume only the page check.
      if (
        manualDeadline &&
        error instanceof Error &&
        error.name === "TimeoutError"
      )
        continue
      if (!(error instanceof ProtectionPageTimeoutError))
        throw new BrowserLoginPageUnavailableError()
      if (!manualDeadline) {
        manualDeadline = Date.now() + TURNSTILE_MANUAL_WAIT_MS
        // Reminder delivery is observational; it cannot hold the live login.
        void requestLoginVerificationAssist(context.requestId).catch(
          () => false,
        )
      }
      await runAbortableTask(
        () =>
          new Promise<void>((resolve) =>
            setTimeout(resolve, PROTECTION_RECHECK_DELAY_MS),
          ),
        { signals: [signal] },
      )
    }
  }
}
