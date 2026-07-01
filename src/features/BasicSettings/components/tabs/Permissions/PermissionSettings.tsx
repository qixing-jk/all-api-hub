import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Alert } from "~/components/ui/Alert"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/Card"
import { BodySmall } from "~/components/ui/Typography"
import { PermissionList } from "~/features/Permissions/components/PermissionList"
import { useOptionalPermissionControls } from "~/features/Permissions/hooks/useOptionalPermissionControls"
import { OPTIONAL_PERMISSIONS } from "~/services/permissions/permissionManager"

/**
 * Settings section for managing optional browser permissions: refresh, request, remove.
 */
export default function PermissionSettings() {
  const { t } = useTranslation("settings")
  const {
    isLoading,
    isRefreshing,
    permissionItems,
    handleToggle,
    loadStatuses,
  } = useOptionalPermissionControls({
    loggerName: "PermissionSettings",
    permissionIds: OPTIONAL_PERMISSIONS,
  })

  return (
    <SettingSection
      id="permissions"
      title={t("permissions.title")}
      description={t("permissions.description")}
      className="space-y-4"
    >
      <Alert variant="info" description={t("permissions.helper")} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <BodySmall className="dark:text-dark-text-tertiary text-gray-500">
          {t("permissions.statusCaption")}
        </BodySmall>
        <Button
          id="permissions-refresh-status"
          variant="outline"
          size="sm"
          onClick={() => void loadStatuses()}
          disabled={isRefreshing || isLoading}
          loading={isRefreshing}
        >
          {t("permissions.actions.refresh")}
        </Button>
      </div>

      <Card padding="none">
        <PermissionList
          items={permissionItems.map((permission) => {
            return {
              id: permission.id,
              title: permission.title,
              description: permission.description,
              status: permission.granted,
              statusLabel:
                permission.granted === null
                  ? t("permissions.status.checking")
                  : permission.granted
                    ? t("permissions.status.granted")
                    : t("permissions.status.denied"),
              rightContent: (
                <div className="flex flex-col items-start gap-3 [@container(min-width:42rem)]:flex-row [@container(min-width:42rem)]:items-center">
                  <Button
                    size="sm"
                    variant={permission.granted ? "outline" : "default"}
                    onClick={() =>
                      void handleToggle(permission.id, !permission.granted)
                    }
                    disabled={permission.pending || permission.granted === null}
                    loading={permission.pending}
                  >
                    {permission.granted
                      ? t("permissions.actions.remove")
                      : t("permissions.actions.allow")}
                  </Button>
                </div>
              ),
            }
          })}
        />
      </Card>
    </SettingSection>
  )
}
