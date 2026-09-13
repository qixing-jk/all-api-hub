import { MANAGED_SITE_CHANNELS_TEST_IDS } from "~/features/ManagedSiteChannels/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { openInterceptedNewApiManagedSiteChannels } from "~~/e2e/fixtures/managedSiteChannelsIntercepted"

test("channel header actions share a compact height", async ({
  context,
  extensionId,
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1000 })
  await openInterceptedNewApiManagedSiteChannels({ context, extensionId, page })
  const refresh = page.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.refreshButton)
  await expect(refresh).toBeVisible()
  const actions = refresh.locator("..")
  const controls = actions.locator(":scope > button")
  await expect(controls).toHaveCount(3)
  const addChannel = page.getByTestId(
    MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton,
  )
  await expect(addChannel).toBeVisible()
  expect(
    await addChannel.evaluate(
      (button) => button.getBoundingClientRect().height,
    ),
  ).toBe(36)
  // Constrain the real action to verify that its standard height still grows for wrapped text.
  await addChannel.evaluate((button) => {
    button.style.width = "80px"
  })
  await expect
    .poll(() =>
      addChannel.evaluate((button) => button.getBoundingClientRect().height),
    )
    .toBeGreaterThan(36)
  expect(
    await addChannel.evaluate(
      (button) => button.scrollHeight <= button.clientHeight,
    ),
  ).toBe(true)
  await addChannel.evaluate((button) => {
    button.style.removeProperty("width")
  })
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect
      .poll(() =>
        controls.evaluateAll((buttons) =>
          buttons.map((button) => button.getBoundingClientRect().height),
        ),
      )
      .toEqual([32, 32, 32])
  }
  await page
    .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.migrationModeButton)
    .click()
  await expect
    .poll(() =>
      controls.evaluateAll((buttons) =>
        buttons.map((button) => button.getBoundingClientRect().height),
      ),
    )
    .toEqual([32, 32, 32])
  await page.screenshot({ path: testInfo.outputPath("channel-header.png") })
})
