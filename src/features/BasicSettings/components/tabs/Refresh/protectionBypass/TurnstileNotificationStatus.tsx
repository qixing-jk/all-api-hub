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
import {
  resolveTurnstileAssistPresentation,
  type TurnstileAssistPresentation,
} from "~/services/checkin/turnstile/assistPresentation"
import {
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
    permission_required: t(
      "refresh.turnstileNotificationStatus.permission_required",
    ),
    unavailable: t("refresh.turnstileNotificationStatus.unavailable"),
    blocked: t("refresh.turnstileNotificationStatus.blocked"),
    available: t("refresh.turnstileNotificationStatus.available"),
    unknown: t("refresh.turnstileNotificationStatus.unknown"),
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
      <div className="border-border/60 bg-muted/20 flex items-start gap-4 rounded-lg border p-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <BodySmall className="text-foreground font-medium">
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
      <div className="border-border/60 bg-muted/20 flex items-start gap-4 rounded-lg border p-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <BodySmall className="text-foreground font-medium">
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
              if (current === "available") changeChannels(channels.page, true)
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
      {channels.notify && status !== "loading" && status !== "available" && (
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
        confirmLabel={
          status === "permission_required"
            ? t("refresh.turnstileNotificationEnable")
            : t("refresh.turnstileNotificationManage")
        }
        onConfirm={async () => {
          if (status !== "permission_required") {
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
            if (current === "available") {
              changeChannels(channels.page, true)
              setPermissionDialog(false)
            }
          } catch {
            setStatus("unknown")
          } finally {
            setPending(false)
          }
        }}
      />
    </div>
  )
}
