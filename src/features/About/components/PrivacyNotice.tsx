import { useTranslation } from "react-i18next"

import { Alert } from "~/components/ui"

const PrivacyNotice = () => {
  const { t } = useTranslation("about")
  return (
    <Alert variant="success">
      <div>
        <p className="mb-1 font-medium">{t("privacyTitle")}</p>
        <p className="text-sm">{t("privacyText")}</p>
      </div>
    </Alert>
  )
}

export default PrivacyNotice
