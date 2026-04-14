import { ArrowPathIcon } from "@heroicons/react/24/outline"
import { CalendarCheck2, Search, UserRound } from "lucide-react"
import { useCallback, useState, type MouseEvent } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import { Button } from "~/components/ui"
import AccountList from "~/features/AccountManagement/components/AccountList"
import DedupeAccountsDialog from "~/features/AccountManagement/components/DedupeAccountsDialog"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { AccountManagementProvider } from "~/features/AccountManagement/hooks/AccountManagementProvider"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { createLogger } from "~/utils/core/logger"
import { getExternalCheckInOpenOptions } from "~/utils/core/shortcutKeys"

const logger = createLogger("AccountManagementPage")

/**
 * Renders the Account Management page body: header with CTA and account list.
 */
function AccountManagementContent({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation(["account", "common"])
  const { openAddAccount } = useDialogStateContext()
  const { displayData, handleRefresh, isRefreshing } = useAccountDataContext()
  const { handleOpenExternalCheckIns } = useAccountActionsContext()
  const [isDedupeDialogOpen, setIsDedupeDialogOpen] = useState(false)

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
      openInNewWindow,
    })
  }

  const handleGlobalRefresh = useCallback(async () => {
    try {
      await toast.promise(handleRefresh(true), {
        loading: t("account:refresh.refreshingAll"),
        success: (result) => {
          if (result.failed > 0) {
            return t("account:refresh.refreshComplete", {
              success: result.success,
              failed: result.failed,
            })
          }

          const sum = result.success + result.failed
          if (sum === 0) {
            return null
          }

          const { refreshedCount } = result
          if (refreshedCount < sum) {
            return t("account:refresh.refreshPartialSkipped", {
              success: refreshedCount,
              skipped: sum - refreshedCount,
            })
          }

          return t("account:refresh.refreshSuccess")
        },
        error: t("account:refresh.refreshFailed"),
      })
    } catch (error) {
      logger.error("Error during global refresh", error)
    }
  }, [handleRefresh, t])

  return (
    <div className="dark:bg-dark-bg-secondary flex flex-col bg-white p-6">
      <PageHeader
        icon={UserRound}
        title={t("account:title")}
        description={t("account:description")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void handleGlobalRefresh()}
              variant="secondary"
              leftIcon={<ArrowPathIcon className="h-4 w-4" />}
              loading={isRefreshing}
              disabled={isRefreshing}
            >
              {t("common:actions.refresh")}
            </Button>
            {canOpenExternalCheckIns && (
              <Button
                onClick={handleOpenExternalCheckInsClick}
                leftIcon={<CalendarCheck2 className="h-4 w-4" />}
                title={t("account:actions.openAllExternalCheckInHint")}
              >
                {t("account:actions.openAllExternalCheckIn")}
              </Button>
            )}
            <Button
              onClick={() => setIsDedupeDialogOpen(true)}
              variant="secondary"
              leftIcon={<Search className="h-4 w-4" />}
              title={t("account:actions.scanDuplicatesHint")}
            >
              {t("account:actions.scanDuplicates")}
            </Button>
            <Button
              onClick={openAddAccount}
              data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton}
            >
              {t("account:addAccount")}
            </Button>
          </div>
        }
      />

      <div className="dark:bg-dark-bg-secondary flex flex-col bg-white">
        <AccountList initialSearchQuery={searchQuery} />
      </div>

      <DedupeAccountsDialog
        isOpen={isDedupeDialogOpen}
        onClose={() => setIsDedupeDialogOpen(false)}
      />
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
