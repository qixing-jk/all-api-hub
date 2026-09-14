import type { Locator, Page } from "@playwright/test"

import { THEME_MODE, type THEME_ATTRIBUTES } from "~/constants/theme"

/** Resolve a global color role without depending on its authored color syntax. */
export async function readVisualThemeRoleColor(
  page: Page,
  role: `--${string}`,
) {
  return page.evaluate((property) => {
    const root = document.documentElement
    if (!getComputedStyle(root).getPropertyValue(property).trim()) {
      throw new Error(`Missing theme color role: ${property}`)
    }
    const probe = document.createElement("span")
    probe.hidden = true
    probe.style.backgroundColor = `var(${property})`
    root.append(probe)
    try {
      return getComputedStyle(probe).backgroundColor
    } finally {
      probe.remove()
    }
  }, role)
}

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
