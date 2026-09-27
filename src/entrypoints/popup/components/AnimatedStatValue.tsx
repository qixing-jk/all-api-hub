import CountUp from "react-countup"

import { SUMMARY_ANIMATION_DURATION } from "~/entrypoints/popup/summaryConfig"

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
      className={`${sizeClass} text-foreground text-left font-bold tracking-tight`}
    >
      <CountUp
        start={0}
        end={value}
        duration={
          isInitialLoad
            ? SUMMARY_ANIMATION_DURATION.INITIAL
            : SUMMARY_ANIMATION_DURATION.UPDATE
        }
        decimals={0}
        preserveValue
      />
    </div>
  )
}
