export async function waitForDocPageReady(page, { timeout = 15000 } = {}) {
  await page.waitForFunction(
    () => {
      const content = document.querySelector("[data-options-page-content]")
      const pending = document.querySelector("[data-options-page-pending]")
      if (!content || pending) return false
      const style = window.getComputedStyle(content)
      const bounds = content.getBoundingClientRect()
      return (
        style.opacity === "1" &&
        style.visibility === "visible" &&
        bounds.width > 0 &&
        bounds.height > 0
      )
    },
    undefined,
    { timeout },
  )
}

/** Wait for fonts, finite animations and chart pixels to settle before capture. */
export async function waitForDocVisuals(page, { timeout = 15000 } = {}) {
  const state = await page.evaluateHandle(() => ({ signature: "", stable: 0 }))
  try {
    await page.waitForFunction(
      (state) => {
        if (document.fonts.status !== "loaded") return false
        if (
          document
            .getAnimations()
            .some(
              (animation) =>
                animation.playState === "running" &&
                animation.effect?.getComputedTiming().iterations !== Infinity,
            )
        )
          return false
        const signature = Array.from(document.querySelectorAll("canvas"))
          .filter(
            (canvas) =>
              canvas.getBoundingClientRect().width > 0 &&
              canvas.getBoundingClientRect().height > 0,
          )
          .map((canvas) => canvas.toDataURL())
          .join("|")
        state.stable = signature === state.signature ? state.stable + 1 : 0
        state.signature = signature
        return state.stable >= 3
      },
      state,
      { timeout, polling: 100 },
    )
  } finally {
    await state.dispose()
  }
}

/** A requested framing anchor is required, never a silent best-effort crop. */
export async function scrollDocPageToAnchor(
  page,
  selector,
  { timeout = 15000 } = {},
) {
  await page.locator(selector).first().waitFor({ state: "visible", timeout })
  await page.evaluate((selector) => {
    const target = document.querySelector(selector)
    if (!target) throw new Error(`Missing screenshot anchor: ${selector}`)
    const top = target.getBoundingClientRect().top + window.scrollY - 76
    window.scrollTo(0, Math.max(0, top))
  }, selector)
}
