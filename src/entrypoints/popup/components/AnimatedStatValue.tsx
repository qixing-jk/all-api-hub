import CountUp from "react-countup"

import { UI_CONSTANTS } from "~/constants/ui"

/**
 * AnimatedStatValue component animates the display of a numeric value using react-countup.
 */
export function AnimatedStatValue({
  value,
  size = "lg",
  isInitialLoad,
}: {
  value: number
  size?: "md" | "lg"
  isInitialLoad: boolean
}) {
  const sizeClass = size === "md" ? "text-2xl" : "text-4xl"

  return (
    <div
      className={`${sizeClass} dark:text-dark-text-primary text-left font-bold tracking-tight text-gray-900`}
    >
      <CountUp
        start={0}
        end={value}
        duration={
          isInitialLoad
            ? UI_CONSTANTS.ANIMATION.INITIAL_DURATION
            : UI_CONSTANTS.ANIMATION.UPDATE_DURATION
        }
        decimals={0}
        preserveValue
      />
    </div>
  )
}
