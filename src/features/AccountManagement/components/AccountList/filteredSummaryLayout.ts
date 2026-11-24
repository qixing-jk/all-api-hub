import { useLayoutEffect, useRef } from "react"

const subgridRows =
  "[@container(max-width:55.999rem)]:supports-[grid-template-rows:subgrid]:row-span-2 [@container(max-width:55.999rem)]:supports-[grid-template-rows:subgrid]:grid [@container(max-width:55.999rem)]:supports-[grid-template-rows:subgrid]:grid-rows-subgrid [@container(max-width:55.999rem)]:supports-[grid-template-rows:subgrid]:space-y-0"

/** Keep the named metric groups as boxes in the pre-subgrid fallback. */
export const FILTERED_SUMMARY_METRIC_ROWS = `${subgridRows} [@container(max-width:55.999rem)]:not-supports-[grid-template-rows:subgrid]:grid [@container(max-width:55.999rem)]:not-supports-[grid-template-rows:subgrid]:grid-rows-[var(--filtered-summary-label-height,2rem)_auto] [@container(max-width:55.999rem)]:not-supports-[grid-template-rows:subgrid]:gap-y-1 [@container(max-width:55.999rem)]:not-supports-[grid-template-rows:subgrid]:space-y-0`

/** Only the unlabeled inner balance wrapper can flatten into its metric grid. */
export const FILTERED_SUMMARY_CONTENT_ROWS = `${subgridRows} [@container(max-width:55.999rem)]:not-supports-[grid-template-rows:subgrid]:contents [@container(max-width:55.999rem)]:not-supports-[grid-template-rows:subgrid]:space-y-0 [@container(max-width:55.999rem)]:not-supports-[grid-template-rows:subgrid]:[&>:first-child]:row-start-1 [@container(max-width:55.999rem)]:not-supports-[grid-template-rows:subgrid]:[&>:nth-child(2)]:row-start-2`

/** Share intrinsic label height without removing accessible column groups. */
export function useFilteredSummaryLabelHeight(
  showTodayCashflow: boolean,
  language: string | undefined,
) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const grid = ref.current
    if (!grid || globalThis.CSS?.supports?.("grid-template-rows", "subgrid"))
      return
    // Select the actual contents so grid-stretched Caption boxes never feed
    // their assigned row height back into the intrinsic measurement.
    const labels = Array.from(
      grid.querySelectorAll<HTMLElement>(
        "[data-filtered-summary-label] > span",
      ),
    )
    const measure = () => {
      const height = Math.max(
        0,
        ...labels.map((label) =>
          Math.max(
            Number.parseFloat(
              getComputedStyle(label.parentElement!).minHeight,
            ) || 0,
            label.getBoundingClientRect().height,
          ),
        ),
      )
      const value = `${height}px`
      if (
        grid.style.getPropertyValue("--filtered-summary-label-height") !== value
      )
        grid.style.setProperty("--filtered-summary-label-height", value)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(grid)
    for (const label of labels) {
      observer.observe(label)
    }
    return () => observer.disconnect()
  }, [showTodayCashflow, language])
  return ref
}
