import { Shield } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button, ConfirmDialog, Modal } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { PermissionRow } from "~/features/Permissions/components/PermissionList"
import {
  detectBrowserFamily,
  isDesktopDevice,
  isFirefox,
} from "~/utils/browser/index"
import { getRuntimeId, isAllowedIncognitoAccess } from "~/utils/browser/runtime"
import { createTab } from "~/utils/browser/tabs"

/** Browser-owned permission guidance, shared by account login and permission management. */
export function IncognitoAccessNotice({
  management = false,
  refreshKey = 0,
}: {
  management?: boolean
  refreshKey?: number
}) {
  const { t } = useTranslation(["settings", "common"])
  const [access, setAccess] = useState<boolean | null | undefined>(undefined)
  const [settingsFailed, setSettingsFailed] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [opening, setOpening] = useState(false)
  const family = isFirefox() ? "firefox" : detectBrowserFamily()
  const desktop = isDesktopDevice()
  const runtimeId = getRuntimeId()
  const chromium = family === "chromium" || family === "edge"
  const settingsUrl =
    desktop && chromium && runtimeId
      ? `${family === "edge" ? "edge" : "chrome"}://extensions/?id=${encodeURIComponent(runtimeId)}`
      : null

  useEffect(() => {
    let active = true
    let generation = 0
    const check = async () => {
      const current = ++generation
      const allowed = await isAllowedIncognitoAccess()
      if (active && current === generation) setAccess(allowed)
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") void check()
    }
    void check()
    window.addEventListener("focus", check)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      active = false
      window.removeEventListener("focus", check)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refreshKey])

  if (!management && access === true) return null

  const instructions = (() => {
    if (family === "safari")
      return t("permissions.incognito.safariInstructions")
    if (!desktop)
      return family === "firefox"
        ? t("permissions.incognito.firefoxMobileInstructions")
        : t("permissions.incognito.mobileInstructions")
    switch (family) {
      case "firefox":
        return t("permissions.incognito.firefoxInstructions")
      case "edge":
        return t("permissions.incognito.edgeInstructions")
      case "chromium":
        return t("permissions.incognito.chromeInstructions")
      default:
        return t("permissions.incognito.genericInstructions")
    }
  })()

  const status =
    access === undefined
      ? t("permissions.incognito.checking")
      : access === true
        ? t("permissions.incognito.enabled")
        : access === false
          ? management
            ? t("permissions.incognito.denied")
            : t("permissions.incognito.recommended")
          : t("permissions.incognito.unknown")

  const action =
    access === true ? null : (
      <Button
        type="button"
        variant={management ? "outline" : "link"}
        size="sm"
        disabled={access === undefined}
        onClick={() => {
          setSettingsFailed(false)
          setDialogOpen(true)
        }}
      >
        {settingsUrl
          ? t("permissions.incognito.details")
          : t("permissions.incognito.manualSteps")}
        {settingsUrl && <WorkflowTransitionIcon aria-hidden="true" />}
      </Button>
    )

  const warning = t("permissions.incognito.reloadWarning")
  const instructionsContent = (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">{instructions}</p>
      {settingsFailed && (
        <p role="alert">{t("permissions.incognito.settingsFailed")}</p>
      )}
    </div>
  )
  return (
    <>
      {management ? (
        <PermissionRow
          item={{
            id: SETTINGS_ANCHORS.INCOGNITO_ACCESS,
            icon: <Shield className="text-link size-5" />,
            title: t("permissions.incognito.title"),
            description: t("permissions.incognito.summary"),
            status: access,
            statusLabel:
              access === undefined
                ? t("permissions.status.checking")
                : access === true
                  ? t("permissions.status.granted")
                  : access === false
                    ? t("permissions.status.denied")
                    : t("permissions.status.unavailable"),
            rightContent: action,
          }}
        />
      ) : (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <p
              className="text-foreground min-w-0 text-sm font-medium"
              role="status"
            >
              {status}
            </p>
            {action}
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t("permissions.incognito.summary")}
          </p>
        </div>
      )}
      {settingsUrl ? (
        <ConfirmDialog
          isOpen={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title={t("permissions.incognito.title")}
          icon={Shield}
          description={warning}
          details={instructionsContent}
          confirmLabel={
            family === "edge"
              ? t("permissions.incognito.openEdgeSettings")
              : t("permissions.incognito.openChromeSettings")
          }
          cancelLabel={t("common:actions.cancel")}
          isWorking={opening}
          onConfirm={async () => {
            setOpening(true)
            setSettingsFailed(false)
            try {
              await createTab(settingsUrl)
              setDialogOpen(false)
            } catch {
              setSettingsFailed(true)
            } finally {
              setOpening(false)
            }
          }}
        />
      ) : (
        <Modal
          isOpen={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title={t("permissions.incognito.title")}
          size="sm"
          footer={
            <Button onClick={() => setDialogOpen(false)}>
              {t("common:actions.close")}
            </Button>
          }
        >
          <div className="space-y-3">
            <p className="text-sm">{warning}</p>
            {instructionsContent}
          </div>
        </Modal>
      )}
    </>
  )
}
