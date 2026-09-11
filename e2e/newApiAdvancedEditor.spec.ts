import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { openInterceptedNewApiManagedSiteChannels } from "~~/e2e/fixtures/managedSiteChannelsIntercepted"
import { openManagedSiteChannelRowActions } from "~~/e2e/scenarios/managedSiteChannels"

for (const width of [1280, 420]) {
  test(`New API advanced groups remain usable at ${width}px and persist settings`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await openInterceptedNewApiManagedSiteChannels({
      context,
      page,
      extensionId,
      nativeFields: {
        auto_ban: 1,
        setting: '{"force_format":true}',
        settings:
          '{"upstream_model_update_last_check_time":100,"future_option":true}',
        model_mapping: "{}",
      },
    })
    await openManagedSiteChannelRowActions(page, "Example primary")
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await expect(
      dialog.getByRole("group", { name: "Basic & connection", exact: true }),
    ).toBeVisible()
    await expect(
      dialog.getByRole("button", { name: "Models", exact: true }),
    ).toHaveAttribute("aria-expanded", "true")
    await expect(
      dialog.getByRole("button", {
        name: "Upstream model detection",
        exact: true,
      }),
    ).toHaveAttribute("aria-expanded", "false")
    await page.screenshot({ path: testInfo.outputPath("channel-overview.png") })
    for (const name of [
      "Upstream model detection",
      "Routing",
      "Channel management",
      "Network settings",
    ])
      await dialog.getByRole("button", { name, exact: true }).click()
    await expect(
      dialog.getByRole("group", { name: "Upstream model detection" }),
    ).toBeVisible()
    await dialog
      .getByRole("switch", { name: "Check upstream model updates" })
      .click()
    await dialog
      .getByRole("switch", { name: "Automatically sync upstream models" })
      .click()
    const testModel = dialog.getByRole("combobox", { name: "Test model" })
    await testModel.fill("custom-test-model")
    await testModel.press("Tab")
    await expect(testModel).toHaveValue("custom-test-model")
    await dialog.getByRole("button", { name: "Add mapping" }).click()
    await dialog
      .getByRole("combobox", { name: "Request model 1" })
      .fill("alias")
    await dialog
      .getByRole("combobox", { name: "Upstream model 1" })
      .fill("model-a")
    await dialog
      .getByRole("combobox", { name: "Test model" })
      .scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath("channel-models.png") })
    await dialog
      .getByRole("textbox", { name: "Proxy address" })
      .fill("socks5h://127.0.0.1:1080")
    await dialog
      .getByRole("textbox", { name: "Notes" })
      .fill("Advanced channel note")
    expect(
      await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true)
    await page.screenshot({ path: testInfo.outputPath("advanced-groups.png") })
    await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
    await expect(dialog).toBeHidden()
    await openManagedSiteChannelRowActions(page, "Example primary")
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    for (const name of [
      "Upstream model detection",
      "Routing",
      "Channel management",
      "Network settings",
    ])
      await dialog.getByRole("button", { name, exact: true }).click()
    await expect(
      dialog.getByRole("switch", {
        name: "Automatically sync upstream models",
      }),
    ).toBeChecked()
    await expect(
      dialog.getByRole("combobox", { name: "Test model" }),
    ).toHaveValue("custom-test-model")
    await expect(
      dialog.getByRole("combobox", { name: "Request model 1" }),
    ).toHaveValue("alias")
    await expect(
      dialog.getByRole("textbox", { name: "Proxy address" }),
    ).toHaveValue("socks5h://127.0.0.1:1080")
  })
}
