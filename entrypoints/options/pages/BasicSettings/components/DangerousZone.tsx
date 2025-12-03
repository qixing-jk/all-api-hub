import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  BodySmall,
  Button,
  Heading5,
} from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"

import { showResetToast } from "../../../../../utils/toastHelpers"

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

      <Modal
        isOpen={isConfirmDialogOpen}
        onClose={handleCloseConfirmDialog}
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
              onClick={handleCloseConfirmDialog}
              variant="outline"
              disabled={isResetting}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              onClick={handleResetConfirm}
              variant="destructive"
              loading={isResetting}
              disabled={isResetting}
            >
              {isResetting
                ? t("common:status.resetting")
                : t("danger.resetSettings")}
            </Button>
          </div>
        }
      >
        <p className="dark:text-dark-text-secondary text-sm text-gray-600">
          {t("messages.resetConfirmDesc", {
            name: t("danger.resetAllSettings"),
          })}
        </p>
      </Modal>
    </>
  )
}
