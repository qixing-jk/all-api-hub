import type { Page } from "@playwright/test"

/** Changes CSS theme for visual checks without updating stored preferences. */
export async function setVisualDarkMode(page: Page, dark: boolean) {
  await page.evaluate(
    (value) => document.documentElement.classList.toggle("dark", value),
    dark,
  )
}
