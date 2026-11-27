import { Cookie, ShieldCheck } from "lucide-react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Button, Notice } from "~/components/ui"
import { NOTICE_ACTION_LAYOUTS } from "~/components/ui/Notice"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"

export interface CookieAuthPermissionRecommendationProps {
  /** @deprecated Non-compact recommendations always use inline actions. */
  inlineAction?: boolean
  compact?: boolean
  cookieAuthPermissionsGranted?: boolean | null
  isRequestingCookieAuthPermissions?: boolean
  onRequestCookieAuthPermissions?: () => void
}

/**
 * Compact, non-blocking recommendation for Cookie auth accounts.
 */
export function CookieAuthPermissionRecommendation({
  compact = false,
  cookieAuthPermissionsGranted,
  isRequestingCookieAuthPermissions = false,
  onRequestCookieAuthPermissions,
}: CookieAuthPermissionRecommendationProps) {
  const { t } = useTranslation(["accountDialog", "common"])
  const shouldShowAction =
    cookieAuthPermissionsGranted === false && !!onRequestCookieAuthPermissions

  if (!shouldShowAction) {
    return null
  }

  const grantButton = (
    <Button
      type="button"
      variant={compact ? "link" : "outline"}
      className={
        compact
          ? "h-auto min-h-0 p-0 text-xs"
          : "h-auto min-h-(--density-control-sm) max-w-full justify-center py-1.5 text-center whitespace-normal @md/notice:whitespace-nowrap"
      }
      size="sm"
      loading={isRequestingCookieAuthPermissions}
      aria-label={
        isRequestingCookieAuthPermissions
          ? t("common:status.applying")
          : t("form.cookiePermissionEnableCookieAuth")
      }
      onClick={onRequestCookieAuthPermissions}
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.cookiePermissionGrantButton}
      leftIcon={
        <ShieldCheck className={compact ? "h-4 w-4" : "size-3.5 shrink-0"} />
      }
    >
      {isRequestingCookieAuthPermissions ? (
        t("common:status.applying")
      ) : compact ? (
        t("form.cookiePermissionEnableShort")
      ) : (
        <>
          <span className="@md/notice:hidden">
            {t("form.cookiePermissionEnableShort")}
          </span>
          <span className="hidden @md/notice:inline">
            {t("form.cookiePermissionEnableCookieAuth")}
          </span>
        </>
      )}
    </Button>
  )

  if (compact) {
    return (
      <div
        role="note"
        className="flex flex-wrap items-center justify-between gap-density-2 text-xs text-muted-foreground"
        data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.cookiePermissionRecommendation}
      >
        <Tooltip
          anchorAsChild
          content={t("form.cookiePermissionRecommendationDesc")}
        >
          <span tabIndex={0} className="flex items-center gap-density-1">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {t("form.cookiePermissionNeeded")}
          </span>
        </Tooltip>
        {grantButton}
      </div>
    )
  }

  return (
    <Notice
      tone="neutral"
      size="sm"
      role="note"
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.cookiePermissionRecommendation}
      icon={
        <Cookie aria-hidden="true" className="size-4 text-muted-foreground" />
      }
      description={
        <span className="text-xs leading-relaxed">
          {t("form.cookiePermissionRecommendationDesc")}
        </span>
      }
      actionsLayout={NOTICE_ACTION_LAYOUTS.Inline}
      actions={grantButton}
    />
  )
}
