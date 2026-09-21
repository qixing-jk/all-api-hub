import { Github, Languages, Sparkles, Star } from "lucide-react"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"

import { LanguageSwitcher } from "~/components/LanguageSwitcher"
import { Modal } from "~/components/ui"
import { Alert, AlertDescription } from "~/components/ui/Alert"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card"
import { BodySmall, Heading3, Heading6, Link } from "~/components/ui/Typography"
import { REPO_URL } from "~/constants/about"
import { OPTIONS_OVERVIEW_TEST_IDS } from "~/features/OptionsOverview/testIds"
import { PermissionList } from "~/features/Permissions/components/PermissionList"
import { useOptionalPermissionControls } from "~/features/Permissions/hooks/useOptionalPermissionControls"
import {
  useStarPromotionActive,
  useStarPromotionPromptImpression,
} from "~/features/StarPromotion/useStarPromotionActive"
import {
  ensurePermissionsDetailed,
  OPTIONAL_PERMISSIONS,
} from "~/services/permissions/permissionManager"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS,
  trackOptionalPermissionRequestResult,
} from "~/services/productAnalytics/permissions"
import { trackStarPromotionAction } from "~/services/productAnalytics/starPromotion"
import { starPromotionState } from "~/services/starPromotion/state"
import { createLogger } from "~/utils/core/logger"
import { showResultToast } from "~/utils/feedback/operationFeedback"
import { openLanguageRequestPage } from "~/utils/navigation"
import { getDocsGetStartedUrl } from "~/utils/navigation/docsLinks"

/**
 * Unified logger scoped to the optional-permissions onboarding dialog.
 */
const logger = createLogger("PermissionOnboardingDialog")

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
  const { t, i18n } = useTranslation(["settings", "common"])
  const [isRequesting, setIsRequesting] = useState(false)
  // Suppressed once the promotion is completed (star click, self-report, or
  // repository page detection) so onboarding stops re-asking.
  const starCtaVisible = useStarPromotionActive(open)
  useStarPromotionPromptImpression(starCtaVisible, {
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.PermissionOnboardingStarCta,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
  const getStartedUrl = getDocsGetStartedUrl(i18n.language)

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
      showResultToast({
        success,
        successFallback: t("permissionsOnboarding.toasts.success"),
        errorFallback: t("permissionsOnboarding.toasts.error"),
      })
    } catch (error) {
      for (const permissionId of OPTIONAL_PERMISSIONS) {
        const wasGrantedBefore = statuses[permissionId] === true
        trackOptionalPermissionRequestResult(permissionId, {
          success: false,
          failureReason:
            PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.ApiException,
          wasGrantedBefore,
          wasGrantedAfter: wasGrantedBefore,
        })
      }
      logger.error("Failed to grant all optional permissions", error)
      success = false
      showResultToast({
        success: false,
        message: t("permissionsOnboarding.toasts.error"),
      })
    } finally {
      await loadStatuses()
      setIsRequesting(false)
    }
  }, [hasOptionalPermissions, loadStatuses, statuses, t])

  const handleOpenGithub = useCallback(() => {
    trackStarPromotionAction(PRODUCT_ANALYTICS_ACTION_IDS.ClickStarPromotion, {
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.PermissionOnboardingStarCta,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    void starPromotionState.markCompleted()
    window.open(REPO_URL, "_blank", "noopener,noreferrer")
  }, [])

  const handleOpenLanguageRequest = useCallback(() => {
    void openLanguageRequestPage()
  }, [])

  if (!hasOptionalPermissions) {
    return null
  }

  const header = (
    <div className="gap-y-density-1 flex flex-col gap-x-1">
      <Heading3>{t("permissionsOnboarding.title")}</Heading3>
      <BodySmall className="dark:text-secondary-foreground text-muted-foreground">
        {t("permissionsOnboarding.subtitle")}
      </BodySmall>
    </div>
  )

  const footer = (
    <div className="gap-y-density-2 grid w-full gap-x-2 sm:grid-cols-2">
      <Button
        onClick={handleGrantAll}
        loading={isRequesting}
        disabled={isAnyPending}
        className="py-density-2 h-auto min-h-(--density-control) w-full text-center whitespace-normal"
      >
        {isRequesting
          ? t("common:status.applying")
          : t("permissionsOnboarding.actions.allowAll")}
      </Button>
      <Button
        variant="outline"
        onClick={onClose}
        className="w-full"
        disabled={isRequesting}
        data-testid={OPTIONS_OVERVIEW_TEST_IDS.permissionOnboardingDeferButton}
      >
        {t("permissionsOnboarding.actions.maybeLater")}
      </Button>
      {starCtaVisible ? (
        <Button
          variant="secondary"
          className="py-density-2 h-auto min-h-(--density-control) w-full text-center whitespace-normal sm:col-span-2"
          onClick={handleOpenGithub}
          disabled={isRequesting}
          leftIcon={<Star className="text-link h-4 w-4" />}
        >
          {t("permissionsOnboarding.project.starCta")}
        </Button>
      ) : null}
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
        className="space-y-density-4"
        data-testid={OPTIONS_OVERVIEW_TEST_IDS.permissionOnboardingDialog}
      >
        <Card padding="none" className="overflow-hidden">
          <CardHeader
            bordered
            padding="sm"
            className="dark:bg-secondary/40 bg-primary-soft"
          >
            <CardTitle className="gap-y-density-2 flex items-center gap-x-2 text-base font-semibold">
              <Languages className="text-theme-600 dark:text-theme-400 h-5 w-5" />
              {t("appearanceLanguage.onboardingLabel")}
            </CardTitle>
            <BodySmall className="dark:text-secondary-foreground text-muted-foreground">
              {t("appearanceLanguage.onboardingHelper")}
            </BodySmall>
          </CardHeader>
          <CardContent
            padding="sm"
            spacing="none"
            className="gap-y-density-2 flex flex-col gap-x-2 sm:flex-row sm:items-center sm:justify-between"
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
              className="h-auto min-h-0 justify-start px-0 py-0 text-xs font-normal sm:justify-center"
            >
              {t("appearanceLanguage.onboardingLanguageRequest")}
            </Button>
          </CardContent>
        </Card>

        {reason === "new-permissions" && (
          <Alert variant="warning">
            <AlertDescription>
              <BodySmall className="dark:text-secondary-foreground text-muted-foreground">
                {t("permissionsOnboarding.reason.newPermissions")}
              </BodySmall>
            </AlertDescription>
          </Alert>
        )}

        <Card
          padding="none"
          className="overflow-hidden"
          data-testid={
            OPTIONS_OVERVIEW_TEST_IDS.permissionOnboardingIntroSection
          }
        >
          <CardHeader bordered padding="sm">
            <CardTitle className="gap-y-density-2 flex items-center gap-x-2 text-base font-semibold">
              <Github className="text-secondary-foreground h-5 w-5" />
              {t("permissionsOnboarding.openSourceBadge")}
            </CardTitle>
            <BodySmall className="dark:text-secondary-foreground text-muted-foreground mt-density-1">
              {t("permissionsOnboarding.intro")}
            </BodySmall>
          </CardHeader>
          <CardContent padding="sm" spacing="sm" className="space-y-density-3">
            <BodySmall className="dark:text-secondary-foreground text-muted-foreground">
              {t("permissionsOnboarding.analyticsDisclosure")}
            </BodySmall>
            <Alert variant="primary" compact className="py-density-2-5">
              <div className="gap-y-density-3 md:gap-y-density-4 grid gap-x-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-x-4">
                <div className="space-y-density-1-5 min-w-0">
                  <div className="gap-y-density-1 flex min-w-0 flex-wrap items-center gap-x-2">
                    <Heading6 className="shrink-0 tracking-tight">
                      {t("permissionsOnboarding.project.label")}
                    </Heading6>
                    <Link
                      href={REPO_URL}
                      target="_blank"
                      rel="noreferrer"
                      size="sm"
                      className="gap-y-density-1 inline-flex max-w-full items-center gap-x-1"
                    >
                      <span className="break-all">{REPO_URL}</span>
                      <Github className="h-4 w-4 shrink-0" />
                    </Link>
                  </div>
                  <BodySmall className="dark:text-secondary-foreground text-muted-foreground">
                    {t("permissionsOnboarding.project.cta")}
                  </BodySmall>
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full md:w-auto"
                >
                  <a href={getStartedUrl} target="_blank" rel="noreferrer">
                    {t("permissionsOnboarding.project.getStartedCta")}
                  </a>
                </Button>
              </div>
            </Alert>
          </CardContent>
        </Card>

        <Card
          padding="none"
          className="overflow-hidden"
          data-testid={
            OPTIONS_OVERVIEW_TEST_IDS.permissionOnboardingPermissionsSection
          }
        >
          <CardHeader bordered padding="sm">
            <CardTitle className="gap-y-density-2 flex items-center gap-x-2 text-base font-semibold">
              <Sparkles className="text-link h-5 w-5" />
              {t("permissionsOnboarding.permissionListTitle")}
            </CardTitle>
            <BodySmall className="dark:text-secondary-foreground text-muted-foreground mt-density-1">
              {t("permissionsOnboarding.permissionListDescription")}
            </BodySmall>
          </CardHeader>
          <CardContent padding="none" spacing="none">
            <PermissionList
              items={permissionItems.map((permission) => ({
                id: permission.id,
                title: permission.title,
                description: permission.description,
                status: permission.granted,
                statusLabel: permission.statusLabel,
                rightContent: (
                  <div className="gap-y-density-3 flex flex-col items-start gap-x-3 [@container(min-width:42rem)]:flex-row [@container(min-width:42rem)]:items-center">
                    <Button
                      size="sm"
                      variant={permission.granted ? "outline" : "default"}
                      onClick={() =>
                        void handleToggle(permission.id, !permission.granted)
                      }
                      disabled={isRequesting || permission.granted === null}
                      loading={permission.pending}
                    >
                      {permission.pending
                        ? t("common:status.applying")
                        : permission.granted
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
