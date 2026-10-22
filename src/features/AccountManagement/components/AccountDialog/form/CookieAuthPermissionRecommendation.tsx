import { ShieldCheck } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Alert, Button, Notice } from "~/components/ui"
import { NOTICE_ACTION_LAYOUTS } from "~/components/ui/Notice"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"

export interface CookieAuthPermissionRecommendationProps {
  inlineAction?: boolean
  cookieAuthPermissionsGranted?: boolean | null
  isRequestingCookieAuthPermissions?: boolean
  onRequestCookieAuthPermissions?: () => void
}

/**
 * Compact, non-blocking recommendation for Cookie auth accounts.
 */
export function CookieAuthPermissionRecommendation({
  inlineAction = false,
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
      variant="outline"
      size="sm"
      loading={isRequestingCookieAuthPermissions}
      onClick={onRequestCookieAuthPermissions}
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.cookiePermissionGrantButton}
      leftIcon={<ShieldCheck className="h-4 w-4" />}
    >
      {isRequestingCookieAuthPermissions
        ? t("common:status.applying")
        : t("form.cookiePermissionEnableCookieAuth")}
    </Button>
  )

  if (inlineAction) {
    return (
      <Notice
        tone="neutral"
        size="sm"
        role="note"
        data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.cookiePermissionRecommendation}
        description={t("form.cookiePermissionRecommendationDesc")}
        actionsLayout={NOTICE_ACTION_LAYOUTS.Inline}
        actions={grantButton}
      />
    )
  }

  return (
    <Alert
      variant="default"
      compact
      role="note"
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.cookiePermissionRecommendation}
      description={t("form.cookiePermissionRecommendationDesc")}
      className="text-xs"
    >
      <div className="gap-y-density-2 pt-density-1 flex flex-col gap-x-2 sm:flex-row sm:flex-wrap">
        {grantButton}
      </div>
    </Alert>
  )
}
