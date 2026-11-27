import { Check } from "lucide-react"
import { useId, useLayoutEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"

import {
  getSub2ApiSessionHandoffHelp,
  Sub2ApiSessionAction,
  Sub2ApiSessionContinuationError,
  type Sub2ApiSessionActionState,
} from "./Sub2ApiSessionAction"

export type Sub2ApiLoginSessionState =
  | { configured: true }
  | { configured: false; action: Sub2ApiSessionActionState }

/** Owns the Account Login acquisition action and its focusable confirmation. */
export function Sub2ApiLoginSession({
  session,
}: {
  session: Sub2ApiLoginSessionState
}) {
  const { t } = useTranslation("accountDialog")
  const sessionHelpId = useId()
  const sessionActionBlockRef = useRef<HTMLDivElement>(null)
  const sessionConfirmationRef = useRef<HTMLDivElement>(null)
  const sessionActionHadFocus = useRef(false)
  const sessionConfigured = session.configured
  useLayoutEffect(() => {
    if (sessionConfigured === false || !sessionActionHadFocus.current) return
    sessionActionHadFocus.current = false
    const status = sessionConfirmationRef.current
    if (!sessionConfigured || !status) return
    const { activeElement, body } = status.ownerDocument
    if (
      activeElement === body ||
      sessionActionBlockRef.current?.contains(activeElement)
    ) {
      status.focus({ preventScroll: true })
    }
  }, [sessionConfigured])

  const sessionAction = session.configured ? undefined : session.action
  const continuation = sessionAction?.continuation
  return (
    <div
      ref={sessionActionBlockRef}
      className="space-y-density-2 border-t border-border-subtle pt-density-3"
      onFocusCapture={() => {
        if (!sessionConfigured) sessionActionHadFocus.current = true
      }}
      onBlurCapture={({ currentTarget, relatedTarget }) => {
        // Disabling the acquire button can blur it without a new focus target.
        if (relatedTarget && !currentTarget.contains(relatedTarget)) {
          sessionActionHadFocus.current = false
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-density-2">
        {sessionAction && (
          <>
            <div
              id={sessionHelpId}
              className="min-w-[min(100%,10rem)] flex-1 space-y-density-1 text-xs text-muted-foreground"
            >
              <p>{t("login.sub2apiSessionPrompt")}</p>
              {continuation && (
                <p>{getSub2ApiSessionHandoffHelp(t, continuation)}</p>
              )}
            </div>
            <Sub2ApiSessionAction
              action={sessionAction}
              testId={
                ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiLoginSectionAcquireButton
              }
              aria-describedby={sessionHelpId}
            />
          </>
        )}
        <div
          ref={sessionConfirmationRef}
          role="status"
          tabIndex={sessionConfigured ? -1 : undefined}
          className={sessionConfigured ? "focus:outline-none" : "sr-only"}
        >
          {session.configured && (
            <p className="flex items-start gap-2 text-sm font-medium text-foreground">
              <Check
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-success-text"
              />
              {t("login.sub2apiSessionReady")}
            </p>
          )}
        </div>
      </div>
      <Sub2ApiSessionContinuationError continuation={continuation} />
    </div>
  )
}
