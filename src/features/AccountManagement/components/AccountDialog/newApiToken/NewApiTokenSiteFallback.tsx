import { useId, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button, InlineMessage } from "~/components/ui"
import type { AccountBootstrapRouteTarget } from "~/services/apiAdapters/contracts/accountBootstrap"
import { createTokenIssuanceJournal } from "~/services/apiService/newApiFamily/accessTokens/issuanceJournal"
import { getActiveTab, getCurrentTab } from "~/utils/browser/tabs"

import { openAccountAccessTokenPage } from "../recovery/openAccountAccessTokenPage"

export const TOKEN_SITE_FALLBACK_REASONS = {
  SLOW: "slow",
  UNAVAILABLE: "unavailable",
} as const

export type NewApiTokenSiteFallbackReason =
  (typeof TOKEN_SITE_FALLBACK_REASONS)[keyof typeof TOKEN_SITE_FALLBACK_REASONS]

const SITE_FALLBACK_ERRORS = { OPEN: "open", UNCERTAIN: "uncertain" } as const
type SiteFallbackError =
  (typeof SITE_FALLBACK_ERRORS)[keyof typeof SITE_FALLBACK_ERRORS]

/** Opens the site's management-token route in the current browsing context. */
export function NewApiTokenSiteFallback({
  target,
  userId,
  reason,
  onOpeningChange,
  onOpened,
  disabled,
  promotedActions,
}: {
  target: AccountBootstrapRouteTarget
  userId: string
  reason: NewApiTokenSiteFallbackReason
  onOpeningChange: (opening: boolean) => void
  onOpened: () => void
  disabled?: boolean
  promotedActions?: { footer: HTMLElement | null; secondaryAction: ReactNode }
}) {
  const { t } = useTranslation("accountDialog")
  const guidanceId = useId()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<SiteFallbackError>()
  const opening = useRef(false)

  const open = async () => {
    if (disabled || opening.current) return
    opening.current = true
    setPending(true)
    onOpeningChange(true)
    setError(undefined)
    try {
      const journal = createTokenIssuanceJournal(
        new URL(target.baseUrl).origin,
        userId,
      )
      if (await journal.pending()) {
        setError(SITE_FALLBACK_ERRORS.UNCERTAIN)
        return
      }
      const current = (await getCurrentTab()) ?? (await getActiveTab())
      const opened = await openAccountAccessTokenPage(target, {
        windowId: current?.windowId,
        cookieStoreId: current?.cookieStoreId,
      })
      if (!opened) {
        setError(SITE_FALLBACK_ERRORS.OPEN)
        return
      }
      onOpened()
    } catch {
      setError(SITE_FALLBACK_ERRORS.OPEN)
    } finally {
      opening.current = false
      setPending(false)
      onOpeningChange(false)
    }
  }

  const action = (
    <Button
      type="button"
      size={promotedActions ? "default" : "sm"}
      variant={promotedActions ? "default" : "outline"}
      loading={pending}
      disabled={disabled}
      aria-describedby={promotedActions ? undefined : guidanceId}
      leftIcon={<WorkflowTransitionIcon className="size-4" />}
      onClick={open}
    >
      {t("tokenCreation.createOnSite")}
    </Button>
  )
  const feedback = error && (
    <InlineMessage role="alert" tone="warning" size="sm">
      {error === SITE_FALLBACK_ERRORS.UNCERTAIN
        ? t("tokenCreation.uncertain")
        : t("accessTokenVerification.openSecurityFailed")}
    </InlineMessage>
  )
  if (promotedActions) {
    const actions = (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {promotedActions.secondaryAction}
        {action}
      </div>
    )
    return (
      <>
        {feedback}
        {promotedActions.footer
          ? createPortal(actions, promotedActions.footer)
          : actions}
      </>
    )
  }
  return (
    <div className="space-y-density-2 border-t border-border-subtle pt-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-density-3">
        <p
          id={guidanceId}
          className="min-w-0 flex-1 basis-64 text-xs leading-relaxed text-muted-foreground"
        >
          {reason === TOKEN_SITE_FALLBACK_REASONS.SLOW
            ? t("tokenCreation.siteFallbackSlow")
            : t("tokenCreation.siteFallbackUnavailable")}
        </p>
        {action}
      </div>
      {feedback}
    </div>
  )
}
