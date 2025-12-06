import { CpuChipIcon, KeyIcon, PlusIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Button, IconButton } from "~/components/ui"
import { COLORS } from "~/constants/designTokens"
import { useAddAccountHandler } from "~/hooks/useAddAccountHandler"
import { openKeysPage, openModelsPage } from "~/utils/navigation"

/**
 * Renders quick action buttons in popup header for adding accounts and navigating.
 * Includes primary add-account CTA plus shortcuts to Keys and Models pages.
 */
export default function ActionButtons() {
  const { t } = useTranslation(["account", "ui"])
  const { handleAddAccountClick } = useAddAccountHandler()

  const handleOpenKeysPageClick = () => {
    openKeysPage()
  }

  const handleOpenModelsPageClick = () => {
    openModelsPage()
  }

  return (
    <section
      className={`px-3 py-2 sm:px-5 sm:py-3 ${COLORS.background.secondary} ${COLORS.border.default} border-b`}
    >
      <div className="flex gap-1.5 sm:gap-2">
        <Button
          onClick={handleAddAccountClick}
          className="flex-1 touch-manipulation"
          size="default"
          leftIcon={<PlusIcon className="h-4 w-4" />}
        >
          {t("account:addAccount")}
        </Button>

        <Tooltip content={t("ui:navigation.keys")}>
          <IconButton
            onClick={handleOpenKeysPageClick}
            variant="outline"
            size="default"
            className="touch-manipulation"
            aria-label={t("ui:navigation.keys")}
          >
            <KeyIcon className="h-4 w-4" />
          </IconButton>
        </Tooltip>

        <Tooltip content={t("ui:navigation.models")}>
          <IconButton
            onClick={handleOpenModelsPageClick}
            variant="outline"
            size="default"
            className="touch-manipulation"
            aria-label={t("ui:navigation.models")}
          >
            <CpuChipIcon className="h-4 w-4" />
          </IconButton>
        </Tooltip>
      </div>
    </section>
  )
}
