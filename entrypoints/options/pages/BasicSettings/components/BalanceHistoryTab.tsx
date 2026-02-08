import BalanceHistorySettings from "./BalanceHistorySettings"

/**
 * Dedicated Basic Settings tab for balance-history capture and retention settings.
 */
export default function BalanceHistoryTab() {
  return (
    <div className="space-y-6">
      <BalanceHistorySettings />
    </div>
  )
}

