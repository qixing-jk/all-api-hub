import { CalendarCheck2, UserRound } from "lucide-react"
import type { MouseEvent } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import AccountList from "~/features/AccountManagement/components/AccountList"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { AccountManagementProvider } from "~/features/AccountManagement/hooks/AccountManagementProvider"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import { getExternalCheckInOpenOptions } from "~/utils/shortcutKeys"

/**
 * Renders the Account Management page body: header with CTA and account list.
 */
function AccountManagementContent({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation("account")
  const { openAddAccount } = useDialogStateContext()
  const { displayData } = useAccountDataContext()
  const { handleOpenExternalCheckIns } = useAccountActionsContext()

  const externalCheckInAccounts = displayData.filter((account) => {
    const customUrl = account.checkIn?.customCheckIn?.url
    return typeof customUrl === "string" && customUrl.trim() !== ""
  })

  const canOpenExternalCheckIns = externalCheckInAccounts.length > 0

  // Open all configured external check-in sites and sync the checked-in status.
  const handleOpenExternalCheckInsClick = async (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    const { openAll, openInNewWindow } = getExternalCheckInOpenOptions(event)
    await handleOpenExternalCheckIns(externalCheckInAccounts, {
      openAll,
      ...(openInNewWindow ? { openInNewWindow: true } : {}),
    })
  }

  return (
    <div className="dark:bg-dark-bg-secondary flex flex-col bg-white p-6">
      <PageHeader
        icon={UserRound}
        title={t("title")}
        description={t("description")}
        actions={
          <>
            {canOpenExternalCheckIns && (
              <Button
                onClick={handleOpenExternalCheckInsClick}
                leftIcon={<CalendarCheck2 className="h-4 w-4" />}
                title={t("actions.openAllExternalCheckInHint")}
              >
                {t("actions.openAllExternalCheckIn")}
              </Button>
            )}
            <Button onClick={openAddAccount}>{t("addAccount")}</Button>
          </>
        }
      />

      {/* Account List */}
      <div className="dark:bg-dark-bg-secondary flex flex-col bg-white">
        <AccountList initialSearchQuery={searchQuery} />
      </div>
    </div>
  )
}

interface AccountManagementProps {
  refreshKey?: number
  routeParams?: Record<string, string>
}

/**
 * Wraps AccountManagementContent with provider and hash-driven params.
 */
function AccountManagement({
  refreshKey,
  routeParams,
}: AccountManagementProps) {
  return (
    <AccountManagementProvider refreshKey={refreshKey}>
      <AccountManagementContent searchQuery={routeParams?.search} />
    </AccountManagementProvider>
  )
}

export default AccountManagement
