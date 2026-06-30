import { PanelRightOpen } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, Notice } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { cn } from "~/lib/utils"
import {
  clearPopupInterruptionHint,
  getPopupInterruptionHint,
  type PopupInterruptionHint,
} from "~/services/popupInterruptionHint"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { openSidePanelPage } from "~/utils/navigation"

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
  const { updateActionClickBehavior } = useUserPreferencesContext()
  const [hint, setHint] = useState<PopupInterruptionHint | null>(null)
  const [isApplying, setIsApplying] = useState(false)

  useEffect(() => {
    let cancelled = false

    void getPopupInterruptionHint().then((nextHint) => {
      if (!cancelled) {
        setHint(nextHint)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (!hint) {
    return null
  }

  const dismiss = async () => {
    await clearPopupInterruptionHint()
    setHint(null)
  }

  const handleUseSidepanel = async () => {
    setIsApplying(true)
    try {
      const writeResult = await updateActionClickBehavior("sidepanel")
      if (!writeResult.ok) {
        showUpdateToast(writeResult, t("popupInterruption.settingName"))
        return
      }

      await dismiss()
      await openSidePanelPage()
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
        description={t("popupInterruption.description")}
        actions={
          <>
            <Button
              type="button"
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={handleUseSidepanel}
              loading={isApplying}
              leftIcon={<PanelRightOpen className="h-3.5 w-3.5" />}
            >
              {t("popupInterruption.actions.useSidepanel")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="dark:text-dark-text-secondary h-7 px-2.5 text-xs text-gray-600 hover:bg-amber-100/70 dark:hover:bg-amber-900/40"
              onClick={dismiss}
            >
              {t("popupInterruption.actions.keepPopup")}
            </Button>
          </>
        }
      />
    </div>
  )
}
