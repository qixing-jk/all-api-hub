import { CpuChipIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { BodySmall, Heading2 } from "~/components/ui"

/**
 * Page header showing title and description for the model list.
 * @returns Heading with icon and supporting text.
 */
export function Header() {
  const { t } = useTranslation("modelList")
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center space-x-3">
        <CpuChipIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        <Heading2>{t("title")}</Heading2>
      </div>
      <BodySmall>{t("description")}</BodySmall>
    </div>
  )
}
