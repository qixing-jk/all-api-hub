import { TriangleAlert } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"

interface FirefoxWarningDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}

/**
 * Firefox-specific warning dialog guiding users to open the sidebar for adding accounts.
 * Provides limitation explanation plus CTA to open the sidebar.
 */
export default function FirefoxAddAccountWarningDialog({
  isOpen,
  onClose,
  onConfirm,
}: FirefoxWarningDialogProps) {
  const { t } = useTranslation("ui")

  const header = (
    <div className="flex items-center space-x-3">
      <TriangleAlert className="text-warning-text h-5 w-5" />
      <div className="text-foreground text-lg font-semibold">
        {t("dialog.firefox.warningTitle")}
      </div>
    </div>
  )

  const footer = (
    <div className="space-y-density-4">
      <div className="text-center">
        <TriangleAlert className="text-warning-text mx-auto h-12 w-12" />
        <div className="mt-density-3">
          <h3 className="text-foreground text-base font-medium">
            {t("dialog.firefox.limitation")}
          </h3>
          <div className="mt-density-2">
            <p className="dark:text-secondary-foreground text-muted-foreground text-sm">
              {t("dialog.firefox.popupLimitation")}
            </p>
          </div>
        </div>
      </div>

      <div className="border-warning-border bg-warning-soft py-density-3 rounded-lg border px-3">
        <div className="flex">
          <div className="shrink-0">
            <TriangleAlert className="text-warning-text h-5 w-5" />
          </div>
          <div className="ml-3">
            <h3 className="text-warning-text text-xs font-medium">
              {t("dialog.firefox.howOpenSidebar")}
            </h3>
            <div className="text-warning-text mt-density-1 text-xs">
              <p>{t("dialog.firefox.sidebarInstruction")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 按钮组 */}
      <div className="pt-density-2 flex space-x-3">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={onClose}
          aria-label={t("dialog.firefox.confirm")}
        >
          {t("dialog.firefox.confirm")}
        </Button>
        <Button
          type="button"
          variant="default"
          className="flex-1"
          onClick={onConfirm}
          aria-label={t("dialog.firefox.openSidebar")}
        >
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
