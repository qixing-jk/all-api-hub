import { CircleAlert, CircleCheck, Info, ShieldCheck } from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Button } from "~/components/ui"
import {
  ACCOUNT_COOKIE_VALIDATION_REASONS,
  ACCOUNT_COOKIE_VALIDATION_STATUS,
} from "~/constants/accountCookieValidation"
import {
  getAccountCookieUnavailableMessage,
  validateAccountCookie,
} from "~/services/accounts/cookieValidation"
import type { AccountSiteType } from "~/services/accountSiteDefinitions"
import type {
  AccountCookieValidationEvidence,
  AccountCookieValidationResult,
} from "~/services/apiAdapters/contracts/accountLogin"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { isHttpUrl } from "~/utils/core/urlParsing"

/** Diagnostic evidence is local to the exact draft Cookie, origin and identity. */
export function AccountCookieVerification({
  siteUrl,
  siteType,
  userId,
  cookie,
  verifiedCookie,
  recovery,
  busy = false,
}: {
  siteUrl: string
  siteType: AccountSiteType
  userId: string
  cookie: string
  verifiedCookie?: AccountCookieValidationEvidence | null
  busy?: boolean
  recovery?: {
    configured: boolean
    pending: boolean
    onRecover: () => void
    onConfigure: () => void
  }
}) {
  const { t } = useTranslation("accountDialog")
  const [result, setResult] = useState<AccountCookieValidationResult | null>(
    null,
  )
  const [pending, setPending] = useState(false)
  const active = useRef<AbortController | null>(null)
  useLayoutEffect(() => {
    active.current?.abort()
    active.current = null
    setPending(false)
    setResult(
      verifiedCookie?.cookie === cookie &&
        verifiedCookie.siteUrl === siteUrl &&
        verifiedCookie.siteType === siteType &&
        verifiedCookie.userId === userId.trim()
        ? { status: ACCOUNT_COOKIE_VALIDATION_STATUS.Valid }
        : null,
    )
    return () => {
      active.current?.abort()
    }
  }, [siteType, siteUrl, userId, cookie, verifiedCookie])

  const verify = async () => {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    setPending(true)
    setResult(null)
    try {
      const source = getCurrentTempWindowRequestSource()
      const next = await withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
        source,
        (protectionBypassExecution) =>
          validateAccountCookie({
            site_type: siteType,
            site_url: siteUrl,
            account_info: { id: userId },
            cookieAuth: { sessionCookie: cookie },
            abortSignal: controller.signal,
            protectionBypassExecution,
            tempWindowRequestSource: source,
          }),
      )
      if (!controller.signal.aborted) setResult(next)
    } catch {
      if (!controller.signal.aborted)
        setResult({
          status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
          reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Network,
        })
    } finally {
      if (active.current === controller && !controller.signal.aborted) {
        active.current = null
        setPending(false)
      }
    }
  }
  let message: string | undefined
  switch (result?.status) {
    case ACCOUNT_COOKIE_VALIDATION_STATUS.Valid:
      message = t("cookieValidation.valid")
      break
    case ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid:
      message = t("cookieValidation.invalid")
      break
    case ACCOUNT_COOKIE_VALIDATION_STATUS.IdentityMismatch:
      message = t("cookieValidation.identityMismatch")
      break
    case ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable:
      message = getAccountCookieUnavailableMessage(result.reason)
  }

  return (
    <div className="border-border bg-surface-subtle gap-density-2 py-density-1 flex items-start border-t px-1">
      <Tooltip
        anchorAsChild
        positionStrategy="fixed"
        content={t("cookieValidation.validationExplanation")}
        className="max-w-[min(22rem,calc(100vw-2rem))]! text-left leading-relaxed font-normal whitespace-normal"
      >
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="shrink-0 px-2 text-xs leading-5"
          aria-label={
            pending
              ? t("cookieValidation.checking")
              : t("cookieValidation.action")
          }
          leftIcon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
          disabled={
            pending ||
            busy ||
            recovery?.pending ||
            !cookie.trim() ||
            !userId.trim() ||
            !isHttpUrl(siteUrl)
          }
          onClick={() => void verify()}
        >
          {pending
            ? t("cookieValidation.checking")
            : t("cookieValidation.shortAction")}
        </Button>
      </Tooltip>
      {message && (
        <p
          role="status"
          // Match the button's first line, including its density-dependent height.
          className="gap-density-1 flex min-w-0 items-start py-[calc((var(--density-control-sm)-1.25rem)/2)] text-xs leading-5"
        >
          {result?.status === ACCOUNT_COOKIE_VALIDATION_STATUS.Valid ? (
            <CircleCheck
              className="text-success-text mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
          ) : result?.status ===
            ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable ? (
            <Info
              className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
          ) : (
            <CircleAlert
              className="text-warning-text mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
          )}
          <span className="gap-density-1 flex min-w-0 flex-wrap items-center">
            <span>{message}</span>
            {recovery &&
              (result?.status === ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid ||
                result?.status ===
                  ACCOUNT_COOKIE_VALIDATION_STATUS.IdentityMismatch) && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto min-h-0 p-0 text-left text-xs leading-5"
                  disabled={recovery.pending || busy}
                  onClick={
                    recovery.configured
                      ? recovery.onRecover
                      : recovery.onConfigure
                  }
                >
                  {recovery.pending
                    ? t("cookieValidation.recovering")
                    : recovery.configured
                      ? t("cookieValidation.recover")
                      : t("login.configureRecovery")}
                </Button>
              )}
          </span>
        </p>
      )}
    </div>
  )
}
