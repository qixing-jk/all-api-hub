import { expect } from "@playwright/test"

const CONNECTION_CHECK_WAIT = { timeout: 35_000 }

/** Exercise the settings form used by both Magpie browser runners. */
export async function validateMagpieWebKey(page, webKey, message) {
  // The shared flow replaces prior feedback and returns to idle after completion.
  const result = page.getByText(message, { exact: true })
  await page.locator("#magpie-web-key input").fill(webKey)
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click()
  // The button regains its idle name after this request has settled.
  await expect(
    page.getByRole("button", { name: "Check connection", exact: true }),
  ).toBeEnabled(CONNECTION_CHECK_WAIT)
  await expect(result).toBeVisible(CONNECTION_CHECK_WAIT)
}
