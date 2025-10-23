import { useTranslation } from "react-i18next"

import { Alert } from "~/components/ui"

export function Footer() {
  const { t } = useTranslation("keyManagement")

  return (
    <Alert variant="warning" className="mt-8">
      <div>
        <h4 className="font-medium mb-1">{t("dialog.warningTitle")}</h4>
        <p className="text-sm">• {t("dialog.warningText")}</p>
      </div>
    </Alert>
  )
}
