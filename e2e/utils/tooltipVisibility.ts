import { expect, type Locator } from "@playwright/test"

/** Check painted edges, including clipping and overlapping stacking contexts. */
export async function expectTooltipUnobstructed(locator: Locator) {
  await expect(locator).toBeVisible()
  await expect
    .poll(() =>
      locator.evaluate((tooltip: HTMLElement) => {
        const box = tooltip.getBoundingClientRect()
        const root = tooltip.getRootNode() as Document | ShadowRoot
        const previous = tooltip.style.pointerEvents
        // Text hints intentionally pass pointer events through. Enable hit testing
        // only for this synchronous paint probe, then restore interaction behavior.
        tooltip.style.pointerEvents = "auto"
        try {
          return (
            [
              [box.left + box.width / 2, box.top + 1],
              [box.left + box.width / 2, box.bottom - 1],
              [box.left + 1, box.top + box.height / 2],
              [box.right - 1, box.top + box.height / 2],
            ] as const
          ).every(([x, y]) => {
            const hit = root.elementFromPoint(x, y)
            return hit !== null && tooltip.contains(hit)
          })
        } finally {
          tooltip.style.pointerEvents = previous
        }
      }),
    )
    .toBe(true)
}
