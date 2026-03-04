import type { FC } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"

interface ActionButtonsProps {
  onClose: () => void
  onDelete: () => void
}

export const ActionButtons: FC<ActionButtonsProps> = ({
  onClose,
  onDelete,
}) => {
  const { t } = useTranslation(["ui", "common"])

  return (
    <div className="flex space-x-3">
      <Button
        type="button"
        onClick={onClose}
        variant="secondary"
        className="flex-1"
      >
        {t("common:actions.cancel")}
      </Button>
      <Button
        type="button"
        onClick={onDelete}
        variant="destructive"
        className="flex-1"
      >
        {t("ui:dialog.delete.confirmDelete")}
      </Button>
    </div>
  )
}
