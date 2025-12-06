import { useTranslation } from "react-i18next"

import { Alert } from "~/components/ui"

/**
 * Informational footer reminding users about pricing variability.
 * @returns Info alert with pricing note and description.
 */
export function Footer() {
  const { t } = useTranslation("modelList")
  return (
    <Alert variant="info" className="mt-8">
      <div>
        <h4 className="mb-1 font-medium">{t("pricingNote")}</h4>
        <p className="text-sm">{t("pricingDescription")}</p>
      </div>
    </Alert>
  )
}
