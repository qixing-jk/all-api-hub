import AppLayout from "~/components/AppLayout"
import { UI_CONSTANTS } from "~/constants/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import AccountList from "~/features/AccountManagement/components/AccountList"
import { AccountManagementProvider } from "~/features/AccountManagement/hooks/AccountManagementProvider"
import { isExtensionSidePanel, isMobileByUA } from "~/utils/browser"

import ActionButtons from "./components/ActionButtons"
import BalanceSection from "./components/BalanceSection"
import HeaderSection from "./components/HeaderSection"

function PopupContent() {
  const { isLoading } = useUserPreferencesContext()
  const inSidePanel = isExtensionSidePanel()

  const popupWidthClass = isMobileByUA()
    ? "w-full"
    : inSidePanel
      ? ""
      : UI_CONSTANTS.POPUP.WIDTH

  const popupHeightClass = isMobileByUA()
    ? ""
    : inSidePanel
      ? ""
      : UI_CONSTANTS.POPUP.HEIGHT

  return (
    <div
      className={`${popupWidthClass} ${popupHeightClass} dark:bg-dark-bg-primary flex flex-col bg-white`}
    >
      <HeaderSection />

      <div className="flex-1 overflow-y-auto">
        {!isLoading && <BalanceSection />}

        <ActionButtons />

        <AccountList />
      </div>
    </div>
  )
}

function App() {
  return (
    <AppLayout>
      <AccountManagementProvider>
        <PopupContent />
      </AccountManagementProvider>
    </AppLayout>
  )
}

export default App
