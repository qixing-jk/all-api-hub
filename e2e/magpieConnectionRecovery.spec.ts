import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { seedUserPreferences } from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { validateMagpieWebKey } from "~~/scripts/suites/magpie/connection.mjs"

test("Magpie recovery replaces prior feedback and waits for the current validation", async ({
  page,
  context,
  extensionId,
}) => {
  const baseUrl = "https://magpie-recovery.example.invalid"
  const webKey = "synthetic-web-key"
  let logins = 0
  let recoveryCompleted = false
  await context.route(`${baseUrl}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/") {
      logins += 1
      const valid = url.searchParams.get("k") === webKey
      if (valid && logins === 3) {
        // Expose premature completion when the runner accepts a stale toast.
        await new Promise((resolve) => setTimeout(resolve, 750))
        recoveryCompleted = true
      }
      await route.fulfill({ status: valid ? 200 : 401, body: "" })
      return
    }
    await route.fulfill({ json: { providers: [] } })
  })
  await seedUserPreferences(await getServiceWorker(context), {
    managedSiteType: "magpie",
    magpie: { baseUrl, webKey },
    openChangelogOnUpdate: false,
  })
  const origin = `chrome-extension://${extensionId}/options.html`
  await page.goto(origin)
  await page.evaluate(() =>
    localStorage.setItem("all-api-hub-i18nextLng", "en"),
  )
  await page.goto(`${origin}?tab=managedSite#basic`)
  const rejected =
    "Configuration saved, but connection check failed: The Web key was rejected. Check MAGPIE_WEB_KEY or copy the current startup key."
  await validateMagpieWebKey(
    page,
    webKey,
    "Configuration saved. Connection verified.",
  )
  await validateMagpieWebKey(page, "synthetic-invalid-key", rejected)
  await expect(
    page.getByText("Configuration saved. Connection verified.", {
      exact: true,
    }),
  ).toHaveCount(0)
  await validateMagpieWebKey(
    page,
    webKey,
    "Configuration saved. Connection verified.",
  )
  expect(recoveryCompleted).toBe(true)
  await page.goto(`${origin}#managedSiteChannels`)
  await expect(
    page.getByRole("button", { name: "Add channel", exact: true }),
  ).toBeEnabled()
})
