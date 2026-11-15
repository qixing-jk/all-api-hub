import type { MouseEvent } from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { WorkflowTransitionButton } from "~/components/ui"
import {
  openAccountCredentialRecoverySettings,
  supportsAccountCredentialRecovery,
  supportsCheckInAccountLogin,
} from "~/features/AccountManagement/credentialRecovery/guidance"
import type { DisplaySiteData } from "~/types"

/** Explains the available recovery and takes the user to the account's login configuration. */
export function AccountCredentialRecoveryGuidance({
  account,
  onConfigure,
  onNavigate,
  failure = false,
  compact = false,
  checkInMethodId,
}: {
  account: Pick<DisplaySiteData, "siteType" | "authType" | "baseUrl"> &
    Partial<Pick<DisplaySiteData, "id" | "disabled">>
  onConfigure?: () => void
  onNavigate?: () => void
  failure?: boolean
  compact?: boolean
  checkInMethodId?: string
}) {
  const { t } = useTranslation(["accountDialog", "messages"])
  const checkInLogin = supportsCheckInAccountLogin(account, checkInMethodId)
  if (
    (!checkInLogin && !supportsAccountCredentialRecovery(account)) ||
    (!onConfigure && !account.id)
  )
    return null

  const handleConfigure = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (onConfigure) {
      onConfigure()
      return
    }
    onNavigate?.()
    void openAccountCredentialRecoverySettings(account.id!).catch(() => {
      // The shared command reports the error; this event handler owns no retry state.
    })
  }

  const action = (
    <WorkflowTransitionButton
      type="button"
      variant="link"
      size="sm"
      className={
        compact
          ? "h-auto min-h-0 p-0 text-left text-xs"
          : "h-auto min-h-0 p-0 text-left"
      }
      aria-label={
        checkInLogin
          ? t("accountDialog:login.configure")
          : t("accountDialog:login.configureRecovery")
      }
      onClick={handleConfigure}
    >
      {checkInLogin
        ? t("accountDialog:login.configure")
        : compact
          ? t("accountDialog:login.configureRecoveryShort")
          : t("accountDialog:login.configureRecovery")}
    </WorkflowTransitionButton>
  )
  if (compact) {
    return (
      <Tooltip
        anchorAsChild
        content={
          failure
            ? t("accountDialog:login.recoveryFailureDescription")
            : t("accountDialog:login.recoveryGuideSummary")
        }
      >
        {action}
      </Tooltip>
    )
  }
  return (
    <div className="space-y-density-1">
      <p className="text-xs text-muted-foreground">
        {checkInLogin
          ? t("accountDialog:login.checkInFailureDescription")
          : failure
            ? t("accountDialog:login.recoveryFailureDescription")
            : t("accountDialog:login.recoveryGuideDescription")}
      </p>
      {action}
    </div>
  )
}
