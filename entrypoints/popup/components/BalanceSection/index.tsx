import { COLORS } from "~/components/ui"

import { BalanceTabs } from "./BalanceTabs"
import { TokenStats } from "./TokenStats"
import { UpdateTimeAndWarning } from "./UpdateTimeAndWarning"

const BalanceSection = () => {
  return (
    <section
      className={`space-y-2 bg-linear-to-br from-blue-50/50 to-indigo-50/30 p-3 sm:p-4 dark:from-blue-900/20 dark:to-indigo-900/10 ${COLORS.border.default} border-b`}
    >
      <BalanceTabs />
      <TokenStats />
      <UpdateTimeAndWarning />
    </section>
  )
}

export default BalanceSection
