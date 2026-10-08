import { PanelRightOpen } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button, Notice } from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { ACCOUNT_MANAGEMENT_ROUTE_ACTIONS } from "~/features/AccountManagement/routeParams"
import { cn } from "~/lib/utils"
import {
  clearPopupInterruptionHint,
  getPopupInterruptionHint,
  type PopupInterruptionHint,
} from "~/services/popupInterruptionHint"
import { isExtensionPopup } from "~/utils/browser"
import { getSidePanelSupport } from "~/utils/browser/sidePanel"
import { openOrFocusOptionsMenuItem } from "~/utils/navigation/optionsPage"
import { closeIfPopup } from "~/utils/navigation/popup"
import { openSidePanelWithFallback } from "~/utils/navigation/sidepanel"

interface PopupInterruptionHintBannerProps {
  className?: string
  surfaceClassName?: string
}

/**
 * Shows one-shot recovery guidance when a previous popup auto-detect flow was
 * interrupted before it could finish.
 */
export default function PopupInterruptionHintBanner({
  className,
  surfaceClassName,
}: PopupInterruptionHintBannerProps) {
  const { t } = useTranslation("ui")
  const inPopup = isExtensionPopup()
  const sidePanelSupported = getSidePanelSupport().supported
  const [hint, setHint] = useState<PopupInterruptionHint | null>(null)
  const [isApplying, setIsApplying] = useState(false)
  const [navigationFailed, setNavigationFailed] = useState(false)

  useEffect(() => {
    if (!inPopup) return
    let cancelled = false

    void getPopupInterruptionHint().then((nextHint) => {
      if (!cancelled) {
        setHint(nextHint)
      }
    })

    return () => {
      cancelled = true
    }
  }, [inPopup])

  if (!inPopup || !hint) {
    return null
  }

  const dismiss = async () => {
    await clearPopupInterruptionHint(hint)
    setHint(null)
  }

  const handleContinue = async () => {
    setIsApplying(true)
    setNavigationFailed(false)
    const openOptions = () =>
      openOrFocusOptionsMenuItem(MENU_ITEM_IDS.ACCOUNT, {
        action: ACCOUNT_MANAGEMENT_ROUTE_ACTIONS.Add,
      })
    try {
      if (sidePanelSupported)
        await openSidePanelWithFallback(undefined, openOptions)
      else await openOptions()
      await dismiss()
      closeIfPopup()
    } catch {
      setNavigationFailed(true)
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <div className={cn("shrink-0", className)}>
      <Notice
        tone="warning"
        className={surfaceClassName}
        icon={<PanelRightOpen className="h-3.5 w-3.5" />}
        title={t("popupInterruption.title")}
        description={
          sidePanelSupported
            ? t("popupInterruption.description")
            : t("popupInterruption.optionsDescription")
        }
        actions={
          <>
            <Button
              type="button"
              size="sm"
              className="min-h-(--density-control-tight) px-2.5 text-xs"
              onClick={handleContinue}
              loading={isApplying}
              leftIcon={
                sidePanelSupported ? (
                  <PanelRightOpen className="h-3.5 w-3.5" />
                ) : (
                  <WorkflowTransitionIcon className="h-3.5 w-3.5" />
                )
              }
            >
              {isApplying
                ? t("common:status.applying")
                : sidePanelSupported
                  ? t("popupInterruption.actions.useSidepanel")
                  : t("popupInterruption.actions.useOptions")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="dark:text-secondary-foreground text-muted-foreground hover:bg-warning-soft min-h-(--density-control-tight) px-2.5 text-xs"
              onClick={dismiss}
              disabled={isApplying}
            >
              {t("popupInterruption.actions.keepPopup")}
            </Button>
          </>
        }
      />
      {navigationFailed && (
        <p role="alert" className="px-3 py-2 text-sm">
          {t("popupInterruption.openFailed")}
        </p>
      )}
    </div>
  )
}
