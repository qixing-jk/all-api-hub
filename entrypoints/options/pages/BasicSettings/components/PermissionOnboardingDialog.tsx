import { Github, Sparkles, Star } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Modal } from "~/components/ui"
import { Alert, AlertDescription } from "~/components/ui/Alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card"
import { CardItem } from "~/components/ui/CardItem"
import { CardList } from "~/components/ui/CardList"
import { BodySmall, Heading3, Link } from "~/components/ui/Typography"
import {
  ensurePermissions,
  hasPermission,
  ManifestOptionalPermissions,
  onOptionalPermissionsChanged,
  OPTIONAL_PERMISSION_DEFINITIONS,
  OPTIONAL_PERMISSIONS
} from "~/services/permissions/permissionManager"
import { showResultToast } from "~/utils/toastHelpers"

const GITHUB_URL = "https://github.com/qixing-jk/all-api-hub"

const buildState = <T,>(value: T) =>
  Object.fromEntries(OPTIONAL_PERMISSIONS.map((id) => [id, value])) as Record<
    ManifestOptionalPermissions,
    T
  >

const iconMap: Partial<Record<ManifestOptionalPermissions, React.ReactNode>> = {
  cookies: <Sparkles className="h-5 w-5 text-amber-500" />,
  webRequest: <Sparkles className="h-5 w-5 text-blue-500" />,
  webRequestBlocking: <Sparkles className="h-5 w-5 text-purple-500" />
}

interface PermissionOnboardingDialogProps {
  open: boolean
  onClose: () => void
}

export function PermissionOnboardingDialog({
  open,
  onClose
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
        granted: await hasPermission(id)
      }))
    )

    setStatuses((prev) => ({
      ...prev,
      ...results.reduce(
        (acc, curr) => ({
          ...acc,
          [curr.id]: curr.granted
        }),
        {} as Record<ManifestOptionalPermissions, boolean>
      )
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
    const success = await ensurePermissions(OPTIONAL_PERMISSIONS)
    showResultToast(
      success,
      t("permissionsOnboarding.toasts.success"),
      t("permissionsOnboarding.toasts.error")
    )
    await loadStatuses()
    setIsRequesting(false)
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
      granted: statuses[permission.id]
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
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 gap-2">
        <Button
          onClick={handleGrantAll}
          loading={isRequesting}
          className="flex-1">
          {t("permissionsOnboarding.actions.allowAll")}
        </Button>
        <Button
          variant="outline"
          onClick={onClose}
          className="flex-1"
          disabled={isRequesting}>
          {t("permissionsOnboarding.actions.maybeLater")}
        </Button>
      </div>
      <Button
        variant="secondary"
        className="flex-1"
        onClick={handleOpenGithub}
        disabled={isRequesting}
        leftIcon={<Star className="h-4 w-4" />}>
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
      footer={footer}>
      <div className="space-y-4">
        <Card padding="md" className="space-y-4">
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
            title={t("permissionsOnboarding.project.label")}>
            <AlertDescription>
              <div className="flex flex-col gap-2">
                <Link
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1">
                  {GITHUB_URL}
                  <Github className="h-4 w-4" />
                </Link>
                <BodySmall className="dark:text-dark-text-secondary text-gray-500">
                  {t("permissionsOnboarding.project.cta")}
                </BodySmall>
              </div>
            </AlertDescription>
          </Alert>
        </Card>

        <Card padding="none">
          <CardHeader bordered padding="sm">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="h-5 w-5" />
              {t("permissionsOnboarding.permissionListTitle")}
            </CardTitle>
            <BodySmall className="dark:text-dark-text-secondary mt-1 text-gray-500">
              {t("permissionsOnboarding.permissionListDescription")}
            </BodySmall>
          </CardHeader>
          <CardContent padding="none" spacing="none">
            <CardList>
              {permissionList.map((permission) => (
                <CardItem
                  key={permission.id}
                  icon={iconMap[permission.id]}
                  title={t(permission.titleKey)}
                  description={t(permission.descriptionKey)}
                  rightContent={
                    <Badge
                      variant={
                        permission.granted
                          ? "success"
                          : permission.granted === false
                            ? "warning"
                            : "info"
                      }>
                      {permission.granted === null
                        ? t("permissions.status.checking")
                        : t(
                            permission.granted
                              ? "permissions.status.granted"
                              : "permissions.status.denied"
                          )}
                    </Badge>
                  }
                />
              ))}
            </CardList>
          </CardContent>
        </Card>
      </div>
    </Modal>
  )
}

export default PermissionOnboardingDialog
