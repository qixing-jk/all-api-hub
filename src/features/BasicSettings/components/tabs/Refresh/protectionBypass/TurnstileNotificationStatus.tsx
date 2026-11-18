import { Bell } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  BodySmall,
  Button,
  ConfirmDialog,
  Muted,
  Switch,
} from "~/components/ui"
import { BASIC_SETTINGS_TEST_IDS } from "~/features/BasicSettings/testIds"
import {
  resolveTurnstileAssistPresentation,
  type TurnstileAssistPresentation,
} from "~/services/checkin/turnstile/assistPresentation"
import {
  BROWSER_NOTIFICATION_AVAILABILITY,
  getBrowserNotificationAvailability,
  type BrowserNotificationAvailability,
} from "~/services/notifications/browserNotificationAvailability"
import {
  OPTIONAL_PERMISSION_IDS,
  requestPermissionDetailed,
} from "~/services/permissions/permissionManager"
import {
  onPermissionsAdded,
  onPermissionsRemoved,
} from "~/utils/browser/permissions"
import { openSettingsTab } from "~/utils/navigation"

/** Reports system notification permission without prompting during settings render. */
export function TurnstileNotificationStatus({
  preference,
  onChange,
}: {
  preference: TurnstileAssistPresentation
  onChange: (preference: TurnstileAssistPresentation) => void
}) {
  const { t } = useTranslation(["settings", "common"])
  const [status, setStatus] = useState<
    BrowserNotificationAvailability | "loading"
  >("loading")
  const [pending, setPending] = useState(false)
  const [permissionDialog, setPermissionDialog] = useState(false)
  const channels = resolveTurnstileAssistPresentation({
    preference,
    canNotify: true,
  })
  const changeChannels = (page: boolean, system: boolean) =>
    onChange(page ? (system ? "both" : "page") : system ? "notify" : "quiet")
  const statusText = {
    loading: t("refresh.turnstileNotificationStatus.loading"),
    [BROWSER_NOTIFICATION_AVAILABILITY.PermissionRequired]: t(
      "refresh.turnstileNotificationStatus.permission_required",
    ),
    [BROWSER_NOTIFICATION_AVAILABILITY.Unavailable]: t(
      "refresh.turnstileNotificationStatus.unavailable",
    ),
    [BROWSER_NOTIFICATION_AVAILABILITY.Blocked]: t(
      "refresh.turnstileNotificationStatus.blocked",
    ),
    [BROWSER_NOTIFICATION_AVAILABILITY.Available]: t(
      "refresh.turnstileNotificationStatus.available",
    ),
    [BROWSER_NOTIFICATION_AVAILABILITY.Unknown]: t(
      "refresh.turnstileNotificationStatus.unknown",
    ),
  }
  useEffect(() => {
    let active = true
    const refresh = () => {
      void getBrowserNotificationAvailability().then((value) => {
        if (active) setStatus(value)
      })
    }
    refresh()
    const added = onPermissionsAdded(refresh)
    const removed = onPermissionsRemoved(refresh)
    window.addEventListener("focus", refresh)
    return () => {
      active = false
      added()
      removed()
      window.removeEventListener("focus", refresh)
    }
  }, [])
  return (
    <div className="flex w-full flex-col gap-3 text-left">
      <div className="flex items-start gap-4 rounded-lg border border-border/60 bg-muted/20 p-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <BodySmall className="font-medium text-foreground">
            {t("refresh.shieldTurnstileAssistPage")}
          </BodySmall>
          <BodySmall className="text-muted-foreground">
            {t("refresh.shieldTurnstileAssistPageHint")}
          </BodySmall>
        </div>
        <Switch
          aria-label={t("refresh.shieldTurnstileAssistPage")}
          checked={channels.page}
          disabled={pending}
          onChange={(checked) => changeChannels(checked, channels.notify)}
        />
      </div>
      <div className="flex items-start gap-4 rounded-lg border border-border/60 bg-muted/20 p-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <BodySmall className="font-medium text-foreground">
            {t("refresh.shieldTurnstileAssistNotify")}
          </BodySmall>
          <BodySmall className="text-muted-foreground">
            {t("refresh.shieldTurnstileAssistNotifyHint")}
          </BodySmall>
        </div>
        <Switch
          aria-label={t("refresh.shieldTurnstileAssistNotify")}
          checked={channels.notify}
          disabled={pending}
          onChange={async (checked) => {
            if (!checked) {
              changeChannels(channels.page, false)
              return
            }
            setPending(true)
            try {
              const current = await getBrowserNotificationAvailability()
              setStatus(current)
              if (current === BROWSER_NOTIFICATION_AVAILABILITY.Available)
                changeChannels(channels.page, true)
              else setPermissionDialog(true)
            } finally {
              setPending(false)
            }
          }}
        />
      </div>
      {!channels.page && !channels.notify && (
        <Muted role="status" className="text-xs">
          {t("refresh.shieldTurnstileAssistQuietNotice")}
        </Muted>
      )}
      {channels.notify && <Muted role="status">{statusText[status]}</Muted>}
      {channels.notify &&
        status !== "loading" &&
        status !== BROWSER_NOTIFICATION_AVAILABILITY.Available && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPermissionDialog(true)}
          >
            {t("refresh.turnstileNotificationManage")}
          </Button>
        )}
      <ConfirmDialog
        intent="confirm"
        icon={Bell}
        isOpen={permissionDialog}
        onClose={() => setPermissionDialog(false)}
        title={t("refresh.turnstileNotificationPermissionTitle")}
        description={statusText[status]}
        size="md"
        isWorking={pending}
        cancelLabel={t("common:actions.cancel")}
        confirmButtonTestId={
          BASIC_SETTINGS_TEST_IDS.turnstileNotificationPermissionConfirmButton
        }
        confirmLabel={
          status === BROWSER_NOTIFICATION_AVAILABILITY.PermissionRequired
            ? t("refresh.turnstileNotificationEnable")
            : t("refresh.turnstileNotificationManage")
        }
        onConfirm={async () => {
          if (status !== BROWSER_NOTIFICATION_AVAILABILITY.PermissionRequired) {
            void openSettingsTab("permissions", { preserveHistory: true })
            setPermissionDialog(false)
            return
          }
          setPending(true)
          try {
            await requestPermissionDetailed(
              OPTIONAL_PERMISSION_IDS.Notifications,
            )
            const current = await getBrowserNotificationAvailability()
            setStatus(current)
            if (current === BROWSER_NOTIFICATION_AVAILABILITY.Available) {
              changeChannels(channels.page, true)
              setPermissionDialog(false)
            }
          } catch {
            setStatus(BROWSER_NOTIFICATION_AVAILABILITY.Unknown)
          } finally {
            setPending(false)
          }
        }}
      />
    </div>
  )
}
