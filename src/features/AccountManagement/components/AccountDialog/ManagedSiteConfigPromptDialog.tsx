import { ExclamationTriangleIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Alert } from "~/components/ui/Alert"
import { Button } from "~/components/ui/button"
import { Modal } from "~/components/ui/Dialog/Modal"

export interface ManagedSiteConfigPromptDialogProps {
  isOpen: boolean
  managedSiteLabel: string
  missingMessage: string
  onClose: () => void
  onOpenSettings: () => void
}

/**
 * Prompt users to configure the selected managed site before using the
 * account-to-channel shortcut so the entry point can stay discoverable.
 */
export function ManagedSiteConfigPromptDialog({
  isOpen,
  managedSiteLabel,
  missingMessage,
  onClose,
  onOpenSettings,
}: ManagedSiteConfigPromptDialogProps) {
  const { t } = useTranslation(["accountDialog", "common"])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("accountDialog:warnings.managedSiteConfig.title", {
        managedSite: managedSiteLabel,
      })}
      size="sm"
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            <h2 className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
              {t("accountDialog:warnings.managedSiteConfig.title", {
                managedSite: managedSiteLabel,
              })}
            </h2>
          </div>
        </div>
      }
      footer={
        <div className="flex space-x-3">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            className="flex-1"
          >
            {t("accountDialog:warnings.managedSiteConfig.actions.later")}
          </Button>
          <Button
            type="button"
            onClick={onOpenSettings}
            variant="warning"
            className="flex-1"
          >
            {t("accountDialog:warnings.managedSiteConfig.actions.openSettings")}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Alert
          variant="warning"
          title={t("accountDialog:warnings.managedSiteConfig.warningTitle", {
            managedSite: managedSiteLabel,
          })}
          description={t(
            "accountDialog:warnings.managedSiteConfig.description",
            {
              message: missingMessage,
            },
          )}
        />
        <p className="dark:text-dark-text-secondary text-sm text-gray-600">
          {t("accountDialog:warnings.managedSiteConfig.guide", {
            managedSite: managedSiteLabel,
          })}
        </p>
      </div>
    </Modal>
  )
}
