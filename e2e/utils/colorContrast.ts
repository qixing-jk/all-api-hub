import type { Locator } from "@playwright/test"

/** WCAG AA thresholds for normal text and non-text controls respectively. */
export const MIN_CONTRAST_RATIO = {
  TEXT: 4.5,
  NON_TEXT: 3,
} as const

/** Measure text on its surface, or an element's background against its ancestors. */
export async function readColorContrast(
  locator: Locator,
  foreground: "text" | "background" = "text",
) {
  return locator.evaluate((element, foregroundSource) => {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    const context = canvas.getContext("2d")!
    const paint = (color: string) => {
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
    }
    const pixel = (): [number, number, number] =>
      [...context.getImageData(0, 0, 1, 1).data].slice(0, 3) as [
        number,
        number,
        number,
      ]
    const linearize = (channel: number) => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }
    const luminance = (rgb: [number, number, number]) =>
      linearize(rgb[0]) * 0.2126 +
      linearize(rgb[1]) * 0.7152 +
      linearize(rgb[2]) * 0.0722
    const ancestors: Element[] = []
    const surface =
      foregroundSource === "background" ? element.parentElement : element
    for (let node: Element | null = surface; node; node = node.parentElement) {
      ancestors.unshift(node)
    }
    paint("white")
    for (const node of ancestors) paint(getComputedStyle(node).backgroundColor)
    const background = pixel()
    const style = getComputedStyle(element)
    paint(
      foregroundSource === "background" ? style.backgroundColor : style.color,
    )
    const foreground = pixel()
    const first = luminance(background)
    const second = luminance(foreground)
    const low = Math.min(first, second)
    const high = Math.max(first, second)
    return { background, foreground, ratio: (high + 0.05) / (low + 0.05) }
  }, foreground)
}

/** Wait for the actual hover/focus colors before measuring their contrast. */
export async function finishColorTransitions(locator: Locator) {
  await locator.evaluate(async (element) => {
    // Force style resolution so newly started transitions are included.
    void getComputedStyle(element).backgroundColor
    // A theme change can cancel a transition, especially in older Chromium.
    // Its final computed colors still need to be measured after cancellation.
    await Promise.allSettled(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    )
  })
}
