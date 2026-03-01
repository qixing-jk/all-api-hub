import { CogIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { BodySmall, Heading2 } from "~/components/ui"

/**
 * Basic settings page header with cog icon and description.
 */
export default function SettingsHeader() {
  const { t } = useTranslation("settings")
  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center space-x-3">
        <CogIcon className="h-6 w-6 text-blue-600" />
        <Heading2>{t("title")}</Heading2>
      </div>
      <BodySmall>{t("description")}</BodySmall>
    </div>
  )
}
