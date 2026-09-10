import { RefreshCw } from "lucide-react"
import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { BodySmall, Button, Heading3 } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
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
  actions?: ReactNode
  onReset?: () => Promise<PreferenceWriteResult>
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
  actions,
  onReset,
  resetButtonLabel,
  children,
  id,
  className = "",
}: SettingSectionProps) {
  const { t } = useTranslation("settings")
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  const handleResetClick = () => {
    setIsResetDialogOpen(true)
  }

  const handleResetConfirm = async () => {
    if (!onReset) return

    try {
      setIsResetting(true)
      const result = await onReset()

      if (result.ok) {
        toast.success(t("messages.resetSuccess", { name: title }))
      } else {
        toast.error(
          getPreferenceWriteFailureMessage(result.reason, {
            fallback: t("messages.resetFailed", { name: title }),
          }),
        )
      }
    } catch (error) {
      logger.error("Failed to reset setting section", { title, error })
      toast.error(t("messages.resetFailed", { name: title }))
    } finally {
      setIsResetting(false)
      setIsResetDialogOpen(false)
    }
  }

  const handleResetCancel = () => {
    setIsResetDialogOpen(false)
  }

  const resetButton = onReset && (
    <Button
      onClick={handleResetClick}
      variant="outline"
      size="sm"
      className="shrink-0"
      leftIcon={<RefreshCw className="h-4 w-4" />}
    >
      {resetButtonLabel || t("common:actions.reset")}
    </Button>
  )

  return (
    <>
      <section id={id} className={`space-y-6 ${className}`.trim()}>
        {actions ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Heading3>{title}</Heading3>
              <div className="flex max-w-full flex-wrap items-center gap-2">
                {actions}
                {resetButton}
              </div>
            </div>
            {description && <BodySmall>{description}</BodySmall>}
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-1.5">
              <Heading3>{title}</Heading3>
              {description && <BodySmall>{description}</BodySmall>}
            </div>
            {resetButton}
          </div>
        )}

        {children}
      </section>

      {/* Reset Confirmation Dialog */}
      <Modal
        isOpen={isResetDialogOpen}
        onClose={handleResetCancel}
        size="sm"
        header={
          <div className="pr-8">
            <h3 className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
              {t("messages.confirmReset")}
            </h3>
          </div>
        }
        footer={
          <div className="flex justify-end gap-3">
            <Button
              onClick={handleResetCancel}
              variant="outline"
              disabled={isResetting}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              onClick={handleResetConfirm}
              variant="destructive"
              loading={isResetting}
            >
              {isResetting
                ? t("common:status.resetting")
                : t("common:actions.reset")}
            </Button>
          </div>
        }
      >
        <p className="dark:text-dark-text-secondary text-sm text-gray-600">
          {t("messages.resetConfirmDesc", { name: title })}
        </p>
      </Modal>
    </>
  )
}
