import { Cookie, Network, ShieldAlert } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Alert } from "~/components/ui/Alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/Card"
import { CardItem } from "~/components/ui/CardItem"
import { CardList } from "~/components/ui/CardList"
import { BodySmall } from "~/components/ui/Typography"
import {
  hasPermission,
  ManifestOptionalPermissions,
  onOptionalPermissionsChanged,
  OPTIONAL_PERMISSION_DEFINITIONS,
  OPTIONAL_PERMISSIONS,
  removePermission,
  requestPermission
} from "~/services/permissions/permissionManager"
import { showResultToast } from "~/utils/toastHelpers"

interface PermissionState {
  statuses: Record<ManifestOptionalPermissions, boolean | null>
  pending: Record<ManifestOptionalPermissions, boolean>
}

const buildState = <T,>(value: T) =>
  Object.fromEntries(OPTIONAL_PERMISSIONS.map((id) => [id, value])) as Record<
    ManifestOptionalPermissions,
    T
  >

const iconMap: Partial<Record<ManifestOptionalPermissions, React.ReactNode>> = {
  cookies: <Cookie className="h-5 w-5 text-amber-500" />,
  webRequest: <Network className="h-5 w-5 text-blue-500" />,
  webRequestBlocking: <ShieldAlert className="h-5 w-5 text-purple-500" />
}

export default function PermissionSettings() {
  const { t } = useTranslation("settings")
  const [state, setState] = useState<PermissionState>(() => ({
    statuses: buildState<boolean | null>(null),
    pending: buildState(false)
  }))
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadStatuses = useCallback(async () => {
    setIsRefreshing(true)
    console.log("[Permissions] Checking optional permission statuses...")
    const results = await Promise.all(
      OPTIONAL_PERMISSIONS.map(async (id) => ({
        id,
        granted: await hasPermission(id)
      }))
    )

    console.table(
      results.map((item) => ({ permission: item.id, granted: item.granted }))
    )

    setState((prev) => ({
      ...prev,
      statuses: results.reduce(
        (acc, curr) => ({
          ...acc,
          [curr.id]: curr.granted
        }),
        {} as Record<ManifestOptionalPermissions, boolean>
      )
    }))
    setIsRefreshing(false)
  }, [])

  useEffect(() => {
    void loadStatuses()
    const unsubscribe = onOptionalPermissionsChanged(() => {
      void loadStatuses()
    })

    return () => {
      unsubscribe()
    }
  }, [loadStatuses])

  const handleToggle = useCallback(
    async (id: ManifestOptionalPermissions, shouldEnable: boolean) => {
      setState((prev) => ({
        ...prev,
        pending: {
          ...prev.pending,
          [id]: true
        }
      }))

      const label = t(
        OPTIONAL_PERMISSION_DEFINITIONS.find((perm) => perm.id === id)
          ?.titleKey ?? id
      )
      console.log(
        `[Permissions] ${shouldEnable ? "Request" : "Revoke"} ${id} triggered by user: ${label}`
      )
      let success = false

      try {
        if (shouldEnable) {
          success = await requestPermission(id)
          console.log(
            `[Permissions] Request ${id} ${success ? "succeeded" : "failed"}`
          )
          showResultToast(
            success,
            t("permissions.messages.granted", { name: label }),
            t("permissions.messages.grantFailed", { name: label })
          )
        } else {
          success = await removePermission(id)
          console.log(
            `[Permissions] Remove ${id} ${success ? "succeeded" : "failed"}`
          )
          showResultToast(
            success,
            t("permissions.messages.revoked", { name: label }),
            t("permissions.messages.revokeFailed", { name: label })
          )
        }

        if (success) {
          setState((prev) => ({
            ...prev,
            statuses: {
              ...prev.statuses,
              [id]: shouldEnable
            }
          }))
        }
      } catch (error) {
        success = false
        console.error(`[Permissions] Failed to toggle ${id}`, error)
        showResultToast(
          false,
          shouldEnable
            ? t("permissions.messages.granted", { name: label })
            : t("permissions.messages.revoked", { name: label }),
          shouldEnable
            ? t("permissions.messages.grantFailed", { name: label })
            : t("permissions.messages.revokeFailed", { name: label })
        )
      } finally {
        setState((prev) => ({
          ...prev,
          pending: {
            ...prev.pending,
            [id]: false
          }
        }))
      }
    },
    [t]
  )

  const isLoading = useMemo(
    () => OPTIONAL_PERMISSIONS.some((id) => state.statuses[id] === null),
    [state.statuses]
  )

  return (
    <SettingSection
      id="permissions"
      title={t("permissions.title")}
      description={t("permissions.description")}
      className="space-y-4">
      <Alert variant="info" description={t("permissions.helper")} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <BodySmall className="dark:text-dark-text-tertiary text-gray-500">
          {t("permissions.statusCaption")}
        </BodySmall>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadStatuses()}
          disabled={isRefreshing || isLoading}
          loading={isRefreshing}>
          {t("permissions.actions.refresh")}
        </Button>
      </div>

      <Card padding="none">
        <CardList>
          {OPTIONAL_PERMISSION_DEFINITIONS.map((permission) => {
            const granted = state.statuses[permission.id]
            const pending = state.pending[permission.id]
            const label = t(permission.titleKey)

            return (
              <CardItem
                key={permission.id}
                icon={iconMap[permission.id]}
                title={label}
                description={t(permission.descriptionKey)}
                rightContent={
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                    <Badge
                      variant={
                        granted
                          ? "success"
                          : granted === false
                            ? "warning"
                            : "info"
                      }>
                      {granted === null
                        ? t("permissions.status.checking")
                        : t(
                            granted
                              ? "permissions.status.granted"
                              : "permissions.status.denied"
                          )}
                    </Badge>
                    <Button
                      size="sm"
                      variant={granted ? "outline" : "default"}
                      onClick={() => void handleToggle(permission.id, !granted)}
                      disabled={pending || granted === null}
                      loading={pending}>
                      {granted
                        ? t("permissions.actions.remove")
                        : t("permissions.actions.allow")}
                    </Button>
                  </div>
                }
              />
            )
          })}
        </CardList>
      </Card>
    </SettingSection>
  )
}
