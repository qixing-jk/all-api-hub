import type { ReactNode } from "react"

import AccountBalanceSummary from "~/features/AccountManagement/components/AccountBalanceSummary"
import { TokenStats } from "~/features/AccountManagement/components/TokenStats"
import { useAccountDataContext } from "~/features/AccountManagement/data/AccountDataContext"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"

import { UpdateTimeAndWarning } from "./UpdateTimeAndWarning"

interface BalanceSectionProps {
  shareAction?: ReactNode
  /** Requests filtering the account list down to the currently detected site. */
  onFilterCurrentSiteAccounts?: (query: string) => void
}

/**
 * Account overview content for the popup.
 * Background and padding are owned by the parent container.
 */
const BalanceSection = ({
  shareAction,
  onFilterCurrentSiteAccounts,
}: BalanceSectionProps) => {
  const { stats } = useAccountDataContext()
  const hasTokenData =
    stats.todayStatsCoverage.tokens.status !==
    ACCOUNT_TODAY_METRIC_STATUSES.Unavailable

  return (
    <>
      <AccountBalanceSummary
        shareAction={shareAction}
        additionalSummary={hasTokenData ? <TokenStats /> : undefined}
        additionalDetails={<TokenStats detailed />}
      />
      <UpdateTimeAndWarning
        onFilterCurrentSiteAccounts={onFilterCurrentSiteAccounts}
      />
    </>
  )
}

export default BalanceSection
