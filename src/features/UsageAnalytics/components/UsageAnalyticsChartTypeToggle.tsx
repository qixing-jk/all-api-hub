import { ToggleButton } from "~/src/components/ui"

import type { UsageAnalyticsChartDisplayType } from "../types"

interface UsageAnalyticsChartTypeToggleProps {
  value: UsageAnalyticsChartDisplayType
  onChange: (value: UsageAnalyticsChartDisplayType) => void
  pieLabel: string
  barLabel: string
  ariaLabel: string
}

/**
 * Compact chart-type segmented control used for distribution/leaderboard cards.
 *
 * Defaulting to pie makes it easy to read proportions, while still allowing
 * users to switch to a histogram-style bar view for precise comparisons.
 */
export default function UsageAnalyticsChartTypeToggle({
  value,
  onChange,
  pieLabel,
  barLabel,
  ariaLabel,
}: UsageAnalyticsChartTypeToggleProps) {
  return (
    <div
      className="dark:bg-dark-bg-secondary inline-flex items-center gap-1 rounded-lg bg-gray-100 p-1"
      role="group"
      aria-label={ariaLabel}
    >
      <ToggleButton
        type="button"
        size="sm"
        isActive={value === "pie"}
        onClick={() => onChange("pie")}
      >
        {pieLabel}
      </ToggleButton>
      <ToggleButton
        type="button"
        size="sm"
        isActive={value === "bar"}
        onClick={() => onChange("bar")}
      >
        {barLabel}
      </ToggleButton>
    </div>
  )
}
