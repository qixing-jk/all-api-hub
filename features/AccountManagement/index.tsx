import AccountList from "~/features/AccountManagement/components/AccountList"
import { AccountManagementProvider } from "~/features/AccountManagement/hooks/AccountManagementProvider"

function AccountManagement() {
  return (
    <AccountManagementProvider>
      <div className={`dark:bg-dark-bg-primary flex flex-col bg-white`}>
        <AccountList />
      </div>
    </AccountManagementProvider>
  )
}

export default AccountManagement
