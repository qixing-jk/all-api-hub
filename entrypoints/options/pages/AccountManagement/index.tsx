import { CalendarCheck2, UserRound } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import AccountList from "~/features/AccountManagement/components/AccountList"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { AccountManagementProvider } from "~/features/AccountManagement/hooks/AccountManagementProvider"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import { openExternalCheckInPages } from "~/utils/navigation"

/**
 * Renders the Account Management page body: header with CTA and account list.
 */
function AccountManagementContent({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation("account")
  const { openAddAccount } = useDialogStateContext()
  const { displayData } = useAccountDataContext()

  const externalCheckInAccounts = displayData.filter((account) => {
    const customUrl = account.checkIn?.customCheckIn?.url
    return typeof customUrl === "string" && customUrl.trim() !== ""
  })

  const canOpenExternalCheckIns = externalCheckInAccounts.length > 0

  // Open all configured external check-in sites in one go.
  const handleOpenExternalCheckIns = async () => {
    await openExternalCheckInPages(externalCheckInAccounts)
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
                onClick={handleOpenExternalCheckIns}
                leftIcon={<CalendarCheck2 className="h-4 w-4" />}
                title={
                  canOpenExternalCheckIns
                    ? t("actions.openAllExternalCheckIn")
                    : t("actions.openAllExternalCheckInDisabled")
                }
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
