import AccountBalanceSummary from "./AccountBalanceSummary"
import { TokenStats } from "./TokenStats"
import { UpdateTimeAndWarning } from "./UpdateTimeAndWarning"

/**
 * Account overview content for the popup.
 * Background and padding are owned by the parent container.
 */
const BalanceSection = () => {
  return (
    <>
      <AccountBalanceSummary />
      <TokenStats />
      <UpdateTimeAndWarning />
    </>
  )
}

export default BalanceSection
