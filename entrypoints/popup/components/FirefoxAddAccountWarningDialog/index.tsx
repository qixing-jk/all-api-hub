import { ExclamationTriangleIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"

interface FirefoxWarningDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}

export default function FirefoxAddAccountWarningDialog({
  isOpen,
  onClose,
  onConfirm
}: FirefoxWarningDialogProps) {
  const { t } = useTranslation("ui")

  const header = (
    <div className="flex items-center space-x-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-orange-500 to-amber-600">
        <ExclamationTriangleIcon className="h-4 w-4 text-white" />
      </div>
      <div className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
        {t("dialog.firefox.warningTitle")}
      </div>
    </div>
  )

  const footer = (
    <div className="space-y-4">
      <div className="text-center">
        <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-orange-500" />
        <div className="mt-3">
          <h3 className="text-base font-medium text-gray-900 dark:text-dark-text-primary">
            {t("dialog.firefox.limitation")}
          </h3>
          <div className="mt-2">
            <p className="text-sm text-gray-500 dark:text-dark-text-secondary">
              {t("dialog.firefox.popupLimitation")}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-orange-100 bg-orange-50 p-3 dark:border-orange-900/30 dark:bg-orange-900/20">
        <div className="flex">
          <div className="flex-shrink-0">
            <ExclamationTriangleIcon className="h-5 w-5 text-orange-400 dark:text-orange-300" />
          </div>
          <div className="ml-3">
            <h3 className="text-xs font-medium text-orange-800 dark:text-orange-200">
              {t("dialog.firefox.howOpenSidebar")}
            </h3>
            <div className="mt-1 text-xs text-orange-700 dark:text-orange-300">
              <p>{t("dialog.firefox.sidebarInstruction")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 按钮组 */}
      <div className="flex space-x-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={onClose}
          aria-label={t("dialog.firefox.confirm")}>
          {t("dialog.firefox.confirm")}
        </Button>
        <Button
          type="button"
          variant="default"
          className="flex-1"
          onClick={onConfirm}
          aria-label={t("dialog.firefox.openSidebar")}>
          {t("dialog.firefox.openSidebar")}
        </Button>
      </div>
    </div>
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} header={header} footer={footer}>
      {/* empty: header/footer contain the content */}
    </Modal>
  )
}
