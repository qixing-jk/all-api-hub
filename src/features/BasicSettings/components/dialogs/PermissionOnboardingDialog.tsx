import { Github, Languages, Sparkles, Star } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { LanguageSwitcher } from "~/components/LanguageSwitcher"
import { Modal } from "~/components/ui"
import { Alert, AlertDescription } from "~/components/ui/Alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card"
import { BodySmall, Heading3, Link } from "~/components/ui/Typography"
import {
  ensurePermissions,
  hasPermission,
  ManifestOptionalPermissions,
  onOptionalPermissionsChanged,
  OPTIONAL_PERMISSION_DEFINITIONS,
  OPTIONAL_PERMISSIONS,
} from "~/services/permissions/permissionManager"
import { createLogger } from "~/utils/core/logger"
import { showResultToast } from "~/utils/core/toastHelpers"

import { PermissionList } from "../tabs/Permissions/PermissionList"

/**
 * Unified logger scoped to the optional-permissions onboarding dialog.
 */
const logger = createLogger("PermissionOnboardingDialog")

const GITHUB_URL = "https://github.com/qixing-jk/all-api-hub"

const buildState = <T,>(value: T) =>
  Object.fromEntries(OPTIONAL_PERMISSIONS.map((id) => [id, value])) as Record<
    ManifestOptionalPermissions,
    T
  >

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
  const [statuses, setStatuses] = useState<
    Record<ManifestOptionalPermissions, boolean | null>
  >(() => buildState<boolean | null>(null))
  const [isRequesting, setIsRequesting] = useState(false)

  const hasOptionalPermissions = OPTIONAL_PERMISSIONS.length > 0

  const loadStatuses = useCallback(async () => {
    if (!hasOptionalPermissions) return
    const results = await Promise.all(
      OPTIONAL_PERMISSIONS.map(async (id) => ({
        id,
        granted: await hasPermission(id),
      })),
    )

    setStatuses((prev) => ({
      ...prev,
      ...results.reduce(
        (acc, curr) => ({
          ...acc,
          [curr.id]: curr.granted,
        }),
        {} as Record<ManifestOptionalPermissions, boolean>,
      ),
    }))
  }, [hasOptionalPermissions])

  useEffect(() => {
    if (open) {
      void loadStatuses()
    }

    const unsubscribe = onOptionalPermissionsChanged(() => {
      void loadStatuses()
    })

    return () => {
      unsubscribe()
    }
  }, [open, loadStatuses])

  const handleGrantAll = useCallback(async () => {
    if (!hasOptionalPermissions) return
    setIsRequesting(true)
    let success = false

    try {
      success = await ensurePermissions(OPTIONAL_PERMISSIONS)
      showResultToast(
        success,
        t("permissionsOnboarding.toasts.success"),
        t("permissionsOnboarding.toasts.error"),
      )
    } catch (error) {
      logger.error("Failed to grant all optional permissions", error)
      success = false
      showResultToast(false, t("permissionsOnboarding.toasts.error"))
    } finally {
      await loadStatuses()
      setIsRequesting(false)
    }

    if (success) {
      onClose()
    }
  }, [hasOptionalPermissions, loadStatuses, onClose, t])

  const handleOpenGithub = useCallback(() => {
    window.open(GITHUB_URL, "_blank", "noopener,noreferrer")
  }, [])

  const permissionList = useMemo(() => {
    return OPTIONAL_PERMISSION_DEFINITIONS.map((permission) => ({
      ...permission,
      granted: statuses[permission.id],
    }))
  }, [statuses])

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
      size="lg"
      header={header}
      footer={footer}
    >
      <div className="space-y-4">
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
          <CardContent padding="sm" spacing="sm" className="space-y-3">
            <LanguageSwitcher
              showIcon={false}
              className="w-full justify-between sm:w-auto sm:justify-start"
            />
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
              items={permissionList.map((permission) => ({
                id: permission.id,
                title: t(permission.titleKey),
                description: t(permission.descriptionKey),
                rightContent: (
                  <Badge
                    variant={
                      permission.granted
                        ? "success"
                        : permission.granted === false
                          ? "warning"
                          : "info"
                    }
                  >
                    {permission.granted === null
                      ? t("permissions.status.checking")
                      : t(
                          permission.granted
                            ? "permissions.status.granted"
                            : "permissions.status.denied",
                        )}
                  </Badge>
                ),
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </Modal>
  )
}

export default PermissionOnboardingDialog
