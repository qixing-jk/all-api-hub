import type { Locator } from "@playwright/test"

import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { openInterceptedNewApiManagedSiteChannels } from "~~/e2e/fixtures/managedSiteChannelsIntercepted"
import { openManagedSiteChannelRowActions } from "~~/e2e/scenarios/managedSiteChannels"

/** Checks rendered separation rather than relying on spacing class names. */
async function expectReadableLabelGap(control: Locator) {
  await expect(control).toBeVisible()
  await expect
    .poll(async () =>
      control.evaluate((node) => {
        const label = Array.from(document.querySelectorAll("label")).find(
          (candidate) => candidate.htmlFor === node.id,
        )
        if (!label) return false
        const gap =
          node.getBoundingClientRect().top -
          label.getBoundingClientRect().bottom
        return gap >= 4 && gap <= 8
      }),
    )
    .toBe(true)
}

/** Title actions align on one line or wrap below without overlapping the title. */
async function expectTitleActionAlignment(title: Locator, action: Locator) {
  await expect(title).toBeVisible()
  await expect(action).toBeVisible()
  await expect
    .poll(async () => {
      const label = await title.boundingBox()
      const button = await action.boundingBox()
      if (!label || !button) return false
      return (
        (button.x >= label.x + label.width &&
          Math.abs(label.y + label.height / 2 - button.y - button.height / 2) <=
            1) ||
        (button.y >= label.y + label.height &&
          button.y - label.y - label.height <= 12)
      )
    })
    .toBe(true)
}

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
    await expectReadableLabelGap(
      dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput),
    )
    await expectReadableLabelGap(
      dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.typeSelect),
    )
    await expectTitleActionAlignment(
      dialog.locator("label").filter({ hasText: "Available Models" }),
      dialog.getByRole("button", {
        name: "Load Available Models",
        exact: true,
      }),
    )
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
    await expectReadableLabelGap(testModel)
    await expectTitleActionAlignment(
      dialog.getByText("Model name mappings", { exact: true }),
      dialog.getByRole("button", { name: "Add mapping", exact: true }),
    )
    await dialog.getByRole("button", { name: "Add mapping" }).click()
    await dialog
      .getByRole("combobox", { name: "Request model 1" })
      .fill("alias")
    await dialog
      .getByRole("combobox", { name: "Upstream model 1" })
      .fill("model-a")
    const mappingTarget = dialog.getByRole("combobox", {
      name: "Upstream model 1",
    })
    await expectReadableLabelGap(mappingTarget)
    await expect
      .poll(async () => {
        const target = await mappingTarget.boundingBox()
        const remove = await dialog
          .getByRole("button", { name: "Remove mapping 1", exact: true })
          .boundingBox()
        if (!target || !remove) return false
        return (
          Math.abs(target.y + target.height - remove.y - remove.height) <= 1
        )
      })
      .toBe(true)
    await dialog
      .getByRole("combobox", { name: "Test model" })
      .scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath("channel-models.png") })
    const addedSummary = dialog.getByText("Models available to add:", {
      exact: true,
    })
    const removedSummary = dialog.getByText("Models detected as removed:", {
      exact: true,
    })
    await removedSummary.scrollIntoViewIfNeeded()
    await expect
      .poll(async () => {
        const added = await addedSummary.boundingBox()
        const removed = await removedSummary.boundingBox()
        if (!added || !removed) return false
        return (
          (removed.x >= added.x + added.width &&
            Math.abs(added.y - removed.y) <= 1) ||
          (removed.y >= added.y + added.height &&
            removed.y - added.y - added.height <= 12)
        )
      })
      .toBe(true)
    await page.screenshot({
      path: testInfo.outputPath("detection-summary.png"),
    })
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
