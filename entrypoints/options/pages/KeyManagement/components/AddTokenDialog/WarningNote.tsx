import { useTranslation } from "react-i18next"

import { Alert } from "~/components/ui"

export function WarningNote() {
  const { t } = useTranslation("keyManagement")

  return (
    <Alert variant="warning">
      <div>
        <p className="mb-1 font-medium">{t("dialog.warningTitle")}</p>
        <ul className="space-y-1 text-xs">
          <li>• {t("dialog.warningText")}</li>
        </ul>
      </div>
    </Alert>
  )
}
