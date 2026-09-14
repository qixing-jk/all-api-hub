import type { Locator, Page } from "@playwright/test"

import { THEME_MODE, type THEME_ATTRIBUTES } from "~/constants/theme"

/** Changes CSS theme for visual checks without updating stored preferences. */
export async function setVisualDarkMode(page: Page, dark: boolean) {
  await page.evaluate(
    ({ darkClass, enabled }) =>
      document.documentElement.classList.toggle(darkClass, enabled),
    { darkClass: THEME_MODE.DARK, enabled: dark },
  )
}

/** Pass scoped theme constants into the browser without changing stored choices. */
export async function setVisualThemeAttribute(
  scope: Locator,
  attribute: (typeof THEME_ATTRIBUTES)[keyof typeof THEME_ATTRIBUTES],
  value: string,
) {
  await scope.evaluate(
    (element, update) => element.setAttribute(update.attribute, update.value),
    { attribute, value },
  )
}
