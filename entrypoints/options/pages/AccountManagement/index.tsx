import { UserRound } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import AccountList from "~/features/AccountManagement/components/AccountList"
import { AccountManagementProvider } from "~/features/AccountManagement/hooks/AccountManagementProvider"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"

function AccountManagementContent({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation("account")
  const { openAddAccount } = useDialogStateContext()

  return (
    <div className="dark:bg-dark-bg-secondary flex flex-col bg-white p-6">
      <PageHeader
        icon={UserRound}
        title={t("title")}
        description={t("description")}
        actions={<Button onClick={openAddAccount}>{t("addAccount")}</Button>}
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
