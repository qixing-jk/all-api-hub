import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"

import AccountBalanceSummary from "./AccountBalanceSummary"
import { TokenStats } from "./TokenStats"
import { UpdateTimeAndWarning } from "./UpdateTimeAndWarning"

interface BalanceSectionProps {
  /** Requests filtering the account list down to the currently detected site. */
  onFilterCurrentSiteAccounts?: (query: string) => void
}

/**
 * Account overview content for the popup.
 * Background and padding are owned by the parent container.
 */
const BalanceSection = ({
  onFilterCurrentSiteAccounts,
}: BalanceSectionProps) => {
  const { showTodayCashflow } = useUserPreferencesContext()

  return (
    <>
      <AccountBalanceSummary />
      {showTodayCashflow && <TokenStats />}
      <UpdateTimeAndWarning
        onFilterCurrentSiteAccounts={onFilterCurrentSiteAccounts}
      />
    </>
  )
}

export default BalanceSection
