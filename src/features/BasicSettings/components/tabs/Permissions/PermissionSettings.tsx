import { useTranslation } from "react-i18next"

import { Alert } from "~/components/ui/Alert"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/Card"
import { BodySmall } from "~/components/ui/Typography"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { PermissionList } from "~/features/Permissions/components/PermissionList"
import { useOptionalPermissionControls } from "~/features/Permissions/hooks/useOptionalPermissionControls"
import { OPTIONAL_PERMISSIONS } from "~/services/permissions/permissionManager"

/**
 * Settings section for managing optional browser permissions: refresh, request, remove.
 */
export default function PermissionSettings() {
  const { t } = useTranslation(["settings", "common"])
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
      resetNotApplicable="browser-permissions"
      id="permissions"
      title={t("permissions.title")}
      description={t("permissions.description")}
      className="space-y-density-4"
    >
      <Alert variant="default" description={t("permissions.helper")} />

      <div className="gap-y-density-3 flex flex-wrap items-center justify-between gap-x-3">
        <BodySmall className="text-muted-foreground">
          {t("permissions.statusCaption")}
        </BodySmall>
        <Button
          id="permissions-refresh-status"
          variant="outline"
          size="sm"
          onClick={() => void loadStatuses()}
          disabled={isLoading}
          loading={isRefreshing}
        >
          {isRefreshing
            ? t("common:status.refreshing")
            : t("permissions.actions.refresh")}
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
              statusLabel: permission.statusLabel,
              rightContent: (
                <div className="gap-y-density-3 flex flex-col items-start gap-x-3 [@container(min-width:42rem)]:flex-row [@container(min-width:42rem)]:items-center">
                  <Button
                    size="sm"
                    variant={permission.granted ? "outline" : "default"}
                    onClick={() =>
                      void handleToggle(permission.id, !permission.granted)
                    }
                    disabled={permission.granted === null}
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
            }
          })}
        />
      </Card>
    </SettingSection>
  )
}
