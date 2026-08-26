import { ShieldCheck } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Alert, Button } from "~/components/ui"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"

export interface CookieAuthPermissionRecommendationProps {
  cookieAuthPermissionsGranted?: boolean | null
  isRequestingCookieAuthPermissions?: boolean
  onRequestCookieAuthPermissions?: () => void
}

/**
 * Compact, non-blocking recommendation for Cookie auth accounts.
 */
export function CookieAuthPermissionRecommendation({
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

  return (
    <Alert
      variant="info"
      compact
      role="note"
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.cookiePermissionRecommendation}
      description={t("form.cookiePermissionRecommendationDesc")}
      className="text-xs"
    >
      <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
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
      </div>
    </Alert>
  )
}
