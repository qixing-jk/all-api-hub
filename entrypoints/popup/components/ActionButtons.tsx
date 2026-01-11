import {
  CalendarDaysIcon,
  CpuChipIcon,
  CurrencyYenIcon,
  KeyIcon,
  PlusIcon,
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Button, IconButton } from "~/components/ui"
import { COLORS } from "~/constants/designTokens"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { useAddAccountHandler } from "~/hooks/useAddAccountHandler"
import {
  openAutoCheckinPage,
  openKeysPage,
  openModelsPage,
} from "~/utils/navigation"

/**
 * Renders quick action buttons in popup header for adding accounts and navigating.
 * Includes primary add-account CTA plus shortcuts to Keys and Models pages.
 */
export default function ActionButtons() {
  const { t } = useTranslation(["account", "ui"])
  const { handleAddAccountClick } = useAddAccountHandler()
  const { displayData } = useAccountDataContext()
  const { handleOpenExternalCheckIns } = useAccountActionsContext()

  // Only enable the external check-in shortcut when at least one account has a custom URL.
  const externalCheckInAccounts = displayData.filter((account) => {
    const customUrl = account.checkIn?.customCheckIn?.url
    return typeof customUrl === "string" && customUrl.trim() !== ""
  })
  const canOpenExternalCheckIns = externalCheckInAccounts.length > 0
  // Highlight red when any external check-in is still pending today.
  const hasUncheckedExternalCheckIns = externalCheckInAccounts.some(
    (account) => !account.checkIn?.customCheckIn?.isCheckedInToday,
  )

  const handleOpenKeysPageClick = () => {
    openKeysPage()
  }

  const handleOpenModelsPageClick = () => {
    openModelsPage()
  }

  const handleQuickCheckinClick = () => {
    openAutoCheckinPage({ runNow: "true" })
  }

  const handleOpenExternalCheckInsClick = async () => {
    await handleOpenExternalCheckIns(externalCheckInAccounts)
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

        <Tooltip content={t("ui:navigation.autoCheckinRunNow")}>
          <IconButton
            onClick={handleQuickCheckinClick}
            variant="outline"
            size="default"
            className="touch-manipulation"
            aria-label={t("ui:navigation.autoCheckinRunNow")}
          >
            <CalendarDaysIcon className="h-4 w-4" />
          </IconButton>
        </Tooltip>

        {canOpenExternalCheckIns && (
          <Tooltip content={t("ui:navigation.externalCheckinAll")}>
            <IconButton
              onClick={handleOpenExternalCheckInsClick}
              variant="outline"
              size="default"
              className="touch-manipulation"
              aria-label={t("ui:navigation.externalCheckinAll")}
            >
              {/* Match per-account indicator colors: red when not checked in today, green when done. */}
              <CurrencyYenIcon
                className={`h-4 w-4 ${
                  hasUncheckedExternalCheckIns
                    ? "text-red-500"
                    : "text-green-500"
                }`}
              />
            </IconButton>
          </Tooltip>
        )}
      </div>
    </section>
  )
}
