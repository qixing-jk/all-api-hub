import { RotateCcw } from "lucide-react"
import { useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { SettingsResetButton } from "~/components/SettingsResetButton"
import { BodySmall, ConfirmDialog, Heading3 } from "~/components/ui"
import toast from "~/lib/notify"
import type { PreferenceWriteResult } from "~/services/preferences/userPreferences"
import { createLogger } from "~/utils/core/logger"
import { getPreferenceWriteFailureMessage } from "~/utils/feedback/preferenceFeedback"

/**
 * Unified logger scoped to shared settings section UI primitives.
 */
const logger = createLogger("SettingSection")

interface SettingSectionProps {
  title: string
  description?: string
  /** Contextual help displayed immediately after the section title. */
  titleActions?: ReactNode
  actions?: ReactNode
  onReset?: () => Promise<{
    ok: boolean
    reason?: Extract<PreferenceWriteResult, { ok: false }>["reason"]
  }>
  resetDisabled?: boolean
  resetRequiresConfirmation?: boolean
  resetDescription?: string
  resetButtonLabel?: string
  children: ReactNode
  id?: string
  className?: string
}

/**
 * Unified setting section component that provides consistent UI structure
 * with optional header actions and reset functionality
 */
export function SettingSection({
  title,
  description,
  titleActions,
  actions,
  onReset,
  resetButtonLabel,
  resetDisabled = false,
  resetRequiresConfirmation = true,
  resetDescription,
  children,
  id,
  className = "",
}: SettingSectionProps) {
  const { t } = useTranslation("settings")
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  const resettingRef = useRef(false)

  const handleResetClick = () => {
    if (resetRequiresConfirmation) setIsResetDialogOpen(true)
    else void handleResetConfirm()
  }

  const handleResetConfirm = async () => {
    if (!onReset || resetDisabled || resettingRef.current) return
    resettingRef.current = true

    try {
      setIsResetting(true)
      const result = await onReset()

      if (result.ok) {
        setIsResetDialogOpen(false)
        toast.success(t("messages.resetSuccess", { name: title }))
      } else {
        toast.error(
          result.reason
            ? getPreferenceWriteFailureMessage(result.reason, {
                fallback: t("messages.resetFailed", { name: title }),
              })
            : t("messages.resetFailed", { name: title }),
        )
      }
    } catch (error) {
      logger.error("Failed to reset setting section", { title, error })
      toast.error(t("messages.resetFailed", { name: title }))
    } finally {
      setIsResetting(false)
      resettingRef.current = false
    }
  }

  const handleResetCancel = () => {
    if (!resettingRef.current) setIsResetDialogOpen(false)
  }

  const resetButton = onReset && (
    <SettingsResetButton
      onClick={handleResetClick}
      disabled={resetDisabled || isResetting}
      disabledLabel={
        resetDisabled && !isResetting ? t("messages.alreadyDefault") : undefined
      }
      label={resetButtonLabel || t("common:actions.reset")}
    />
  )

  return (
    <>
      <section
        id={id}
        data-slot="setting-section"
        className={`space-y-density-6 ${className}`.trim()}
      >
        {actions || titleActions ? (
          <div
            data-slot="setting-section-header"
            className="space-y-density-1-5"
          >
            <div className="gap-y-density-2 flex flex-wrap items-center justify-between gap-x-4">
              <div className="gap-y-density-1 flex min-w-0 flex-wrap items-baseline gap-x-2">
                <Heading3>{title}</Heading3>
                {titleActions}
              </div>
              <div className="gap-y-density-2 flex max-w-full flex-wrap items-center gap-x-2">
                {actions}
                {resetButton}
              </div>
            </div>
            {description && <BodySmall>{description}</BodySmall>}
          </div>
        ) : (
          <div
            data-slot="setting-section-header"
            className="gap-y-density-4 flex items-start justify-between gap-x-4"
          >
            <div className="space-y-density-1-5 flex-1">
              <Heading3>{title}</Heading3>
              {description && <BodySmall>{description}</BodySmall>}
            </div>
            {resetButton}
          </div>
        )}

        <fieldset disabled={isResetting} className="space-y-density-6 min-w-0">
          {children}
        </fieldset>
      </section>

      <ConfirmDialog
        isOpen={isResetDialogOpen}
        onClose={handleResetCancel}
        intent="warning"
        icon={RotateCcw}
        title={t("messages.confirmReset")}
        description={
          resetDescription ?? t("messages.resetConfirmDesc", { name: title })
        }
        cancelLabel={t("common:actions.cancel")}
        confirmLabel={resetButtonLabel || t("common:actions.reset")}
        workingLabel={t("common:status.resetting")}
        onConfirm={() => void handleResetConfirm()}
        isWorking={isResetting}
      />
    </>
  )
}
