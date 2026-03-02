import { useTranslation } from "react-i18next"

import { Alert } from "~/components/ui"

/**
 * Warning footer reminding users about irreversible token actions.
 */
export function Footer() {
  const { t } = useTranslation("keyManagement")

  return (
    <Alert variant="warning" className="mt-8">
      <div>
        <h4 className="mb-1 font-medium">{t("dialog.warningTitle")}</h4>
        <p className="text-sm">• {t("dialog.warningText")}</p>
      </div>
    </Alert>
  )
}
