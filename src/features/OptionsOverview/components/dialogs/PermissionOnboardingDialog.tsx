import { Github, Languages, Sparkles, Star } from "lucide-react"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"

import { LanguageSwitcher } from "~/components/LanguageSwitcher"
import { Modal } from "~/components/ui"
import { Alert, AlertDescription } from "~/components/ui/Alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card"
import { BodySmall, Heading3, Link } from "~/components/ui/Typography"
import { OPTIONS_OVERVIEW_TEST_IDS } from "~/features/OptionsOverview/testIds"
import { PermissionList } from "~/features/Permissions/components/PermissionList"
import { useOptionalPermissionControls } from "~/features/Permissions/hooks/useOptionalPermissionControls"
import {
  ensurePermissionsDetailed,
  OPTIONAL_PERMISSIONS,
} from "~/services/permissions/permissionManager"
import { trackOptionalPermissionRequestResult } from "~/services/productAnalytics/permissions"
import { createLogger } from "~/utils/core/logger"
import { showResultToast } from "~/utils/core/toastHelpers"
import { openLanguageRequestPage } from "~/utils/navigation"

/**
 * Unified logger scoped to the optional-permissions onboarding dialog.
 */
const logger = createLogger("PermissionOnboardingDialog")

const GITHUB_URL = "https://github.com/qixing-jk/all-api-hub"

interface PermissionOnboardingDialogProps {
  open: boolean
  onClose: () => void
  reason?: string | null
}

/**
 * Onboarding modal that explains optional permissions and lets users grant them.
 * @param props Component props container.
 * @param props.open Controls dialog visibility.
 * @param props.onClose Callback executed when modal requests closure.
 * @param props.reason Optional reason code to adjust messaging (e.g., new-permissions).
 */
export function PermissionOnboardingDialog({
  open,
  onClose,
  reason,
}: PermissionOnboardingDialogProps) {
  const { t } = useTranslation("settings")
  const [isRequesting, setIsRequesting] = useState(false)

  const hasOptionalPermissions = OPTIONAL_PERMISSIONS.length > 0
  const {
    statuses,
    permissionItems,
    isAnyPending,
    handleToggle,
    loadStatuses,
  } = useOptionalPermissionControls({
    enabled: open,
    loggerName: "PermissionOnboardingDialog",
    permissionIds: OPTIONAL_PERMISSIONS,
  })

  const handleGrantAll = useCallback(async () => {
    if (!hasOptionalPermissions) return
    setIsRequesting(true)
    let success = false

    try {
      const result = await ensurePermissionsDetailed(OPTIONAL_PERMISSIONS)
      success = result.success
      for (const permissionResult of result.requestedResults) {
        trackOptionalPermissionRequestResult(permissionResult.id, {
          success: permissionResult.success,
          failureReason: permissionResult.failureReason
            ? permissionResult.failureReason
            : undefined,
          wasGrantedBefore: permissionResult.wasGrantedBefore,
          wasGrantedAfter: permissionResult.wasGrantedAfter,
        })
      }
      showResultToast(
        success,
        t("permissionsOnboarding.toasts.success"),
        t("permissionsOnboarding.toasts.error"),
      )
    } catch (error) {
      for (const permissionId of OPTIONAL_PERMISSIONS) {
        const wasGrantedBefore = statuses[permissionId] === true
        trackOptionalPermissionRequestResult(permissionId, {
          success: false,
          failureReason: error,
          wasGrantedBefore,
          wasGrantedAfter: wasGrantedBefore,
        })
      }
      logger.error("Failed to grant all optional permissions", error)
      success = false
      showResultToast(false, t("permissionsOnboarding.toasts.error"))
    } finally {
      await loadStatuses()
      setIsRequesting(false)
    }
  }, [hasOptionalPermissions, loadStatuses, statuses, t])

  const handleOpenGithub = useCallback(() => {
    window.open(GITHUB_URL, "_blank", "noopener,noreferrer")
  }, [])

  const handleOpenLanguageRequest = useCallback(() => {
    void openLanguageRequestPage()
  }, [])

  if (!hasOptionalPermissions) {
    return null
  }

  const header = (
    <div className="flex flex-col gap-1">
      <Heading3>{t("permissionsOnboarding.title")}</Heading3>
      <BodySmall className="dark:text-dark-text-secondary text-gray-500">
        {t("permissionsOnboarding.subtitle")}
      </BodySmall>
    </div>
  )

  const footer = (
    <div className="grid w-full gap-2 sm:grid-cols-2">
      <Button
        onClick={handleGrantAll}
        loading={isRequesting}
        disabled={isAnyPending}
        className="h-auto min-h-9 w-full py-2 text-center whitespace-normal"
      >
        {t("permissionsOnboarding.actions.allowAll")}
      </Button>
      <Button
        variant="outline"
        onClick={onClose}
        className="w-full"
        disabled={isRequesting}
      >
        {t("permissionsOnboarding.actions.maybeLater")}
      </Button>
      <Button
        variant="secondary"
        className="h-auto min-h-9 w-full py-2 text-center whitespace-normal sm:col-span-2"
        onClick={handleOpenGithub}
        disabled={isRequesting}
        leftIcon={<Star className="h-4 w-4" />}
      >
        {t("permissionsOnboarding.project.starCta")}
      </Button>
    </div>
  )

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      size="xl"
      header={header}
      footer={footer}
    >
      <div
        className="space-y-4"
        data-testid={OPTIONS_OVERVIEW_TEST_IDS.permissionOnboardingDialog}
      >
        <Card padding="none" className="overflow-hidden">
          <CardHeader
            bordered
            padding="sm"
            className="dark:bg-dark-bg-tertiary/40 bg-sky-50/80"
          >
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Languages className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              {t("appearanceLanguage.onboardingLabel")}
            </CardTitle>
            <BodySmall className="dark:text-dark-text-secondary text-gray-500">
              {t("appearanceLanguage.onboardingHelper")}
            </BodySmall>
          </CardHeader>
          <CardContent
            padding="sm"
            spacing="none"
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <LanguageSwitcher
              variant="select"
              compact
              showIcon={false}
              className="w-full sm:w-40"
            />
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={handleOpenLanguageRequest}
              className="h-auto justify-start px-0 py-0 text-xs font-normal sm:justify-center"
            >
              {t("appearanceLanguage.onboardingLanguageRequest")}
            </Button>
          </CardContent>
        </Card>

        {reason === "new-permissions" && (
          <Alert variant="warning">
            <AlertDescription>
              <BodySmall className="dark:text-dark-text-secondary text-gray-500">
                {t("permissionsOnboarding.reason.newPermissions")}
              </BodySmall>
            </AlertDescription>
          </Alert>
        )}

        <Card padding="none" className="overflow-hidden">
          <CardHeader bordered padding="sm">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="h-5 w-5" />
              {t("permissionsOnboarding.permissionListTitle")}
            </CardTitle>
            <BodySmall className="dark:text-dark-text-secondary mt-1 text-gray-500">
              {t("permissionsOnboarding.permissionListDescription")}
            </BodySmall>
          </CardHeader>
          <CardContent padding="sm" spacing="sm" className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="info">
                {t("permissionsOnboarding.openSourceBadge")}
              </Badge>
              <BodySmall className="dark:text-dark-text-secondary text-gray-500">
                {t("permissionsOnboarding.intro")}
              </BodySmall>
            </div>
            <BodySmall className="dark:text-dark-text-secondary text-gray-500">
              {t("permissionsOnboarding.analyticsDisclosure")}
            </BodySmall>
            <Alert
              variant="info"
              title={t("permissionsOnboarding.project.label")}
            >
              <AlertDescription>
                <div>
                  <Link
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1"
                  >
                    {GITHUB_URL}
                    <Github className="h-4 w-4" />
                  </Link>
                  <BodySmall className="dark:text-dark-text-secondary text-gray-500">
                    {t("permissionsOnboarding.project.cta")}
                  </BodySmall>
                </div>
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardContent padding="none" spacing="none">
            <PermissionList
              items={permissionItems.map((permission) => ({
                id: permission.id,
                title: permission.title,
                description: permission.description,
                status: permission.granted,
                statusLabel: permission.statusLabel,
                rightContent: (
                  <div className="flex flex-col items-start gap-3 [@container(min-width:42rem)]:flex-row [@container(min-width:42rem)]:items-center">
                    <Button
                      size="sm"
                      variant={permission.granted ? "outline" : "default"}
                      onClick={() =>
                        void handleToggle(permission.id, !permission.granted)
                      }
                      disabled={
                        isRequesting ||
                        permission.pending ||
                        permission.granted === null
                      }
                      loading={permission.pending}
                    >
                      {permission.granted
                        ? t("permissions.actions.remove")
                        : t("permissions.actions.allow")}
                    </Button>
                  </div>
                ),
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </Modal>
  )
}
