import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  BodySmall,
  Button,
  DestructiveConfirmDialog,
  Heading5,
} from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { showResetToast } from "~/utils/toastHelpers"

/**
 * Renders the destructive reset section with confirmation dialog for settings.
 */
export default function DangerousZone() {
  const { t } = useTranslation("settings")
  const { resetToDefaults } = useUserPreferencesContext()
  const [isResetting, setIsResetting] = useState(false)
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)

  const handleOpenConfirmDialog = () => {
    setIsConfirmDialogOpen(true)
  }

  const handleCloseConfirmDialog = () => {
    if (!isResetting) {
      setIsConfirmDialogOpen(false)
    }
  }

  const handleResetConfirm = async () => {
    setIsResetting(true)
    try {
      const success = await resetToDefaults()
      showResetToast(success)
    } finally {
      setIsResetting(false)
      setIsConfirmDialogOpen(false)
    }
  }

  return (
    <>
      <section>
        <Heading5
          className={`mb-4 text-lg font-medium text-red-600 dark:text-red-400`}
        >
          {t("danger.title")}
        </Heading5>
        <Alert variant="destructive" className="p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3 sm:items-center">
            <div className="min-w-0">
              <AlertTitle className="text-sm">
                {t("danger.resetAllSettings")}
              </AlertTitle>
              <AlertDescription className="mt-0.5">
                <BodySmall>{t("danger.resetDesc")}</BodySmall>
              </AlertDescription>
            </div>
            <Button
              onClick={handleOpenConfirmDialog}
              disabled={isResetting}
              variant="destructive"
            >
              {t("danger.resetSettings")}
            </Button>
          </div>
        </Alert>
      </section>

      <DestructiveConfirmDialog
        isOpen={isConfirmDialogOpen}
        onClose={handleCloseConfirmDialog}
        size="sm"
        title={t("messages.confirmReset")}
        description={t("messages.resetConfirmDesc", {
          name: t("danger.resetAllSettings"),
        })}
        cancelLabel={t("common:actions.cancel")}
        confirmLabel={
          isResetting ? t("common:status.resetting") : t("danger.resetSettings")
        }
        onConfirm={() => {
          void handleResetConfirm()
        }}
        isWorking={isResetting}
      />
    </>
  )
}
