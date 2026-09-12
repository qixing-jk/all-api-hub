import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { DoneHubChannelType } from "~/constants/doneHub"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { openInterceptedDoneHubManagedSiteChannels } from "~~/e2e/fixtures/managedSiteChannelsIntercepted"
import {
  channelRowByName,
  openManagedSiteChannelRowActions,
} from "~~/e2e/scenarios/managedSiteChannels"

test.use({ actionTimeout: 10_000 })

for (const width of [1440, 460]) {
  test(`DoneHub advanced settings remain editable and preserve native data at ${width}px`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await openInterceptedDoneHubManagedSiteChannels({
      context,
      page,
      extensionId,
      nativeFields: {
        type: DoneHubChannelType.Custom,
        tag: "",
        compatible_response: true,
        allow_extra_body: true,
        plugin: {
          customize: { "16": "/custom/responses", "1": "/custom/chat" },
          untouched: { enabled: true },
        },
        model_mapping: '{"alias":"upstream-model"}',
        proxy: "socks5://proxy.example:1080",
        test_model: "model-donehub-a",
        model_headers: '{"X-Project":"example"}',
        custom_parameter: '{"temperature":0.7}',
        disabled_stream: ["model-donehub-a"],
        future_setting: { keep: true },
      },
    })
    await openManagedSiteChannelRowActions(page, "DoneHub primary")
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await expect(
      dialog.getByRole("button", { name: "Basic & connection", exact: true }),
    ).toHaveAttribute("aria-expanded", "true")
    await expect(
      dialog.getByRole("button", { name: "Models", exact: true }),
    ).toHaveAttribute("aria-expanded", "true")
    await page.screenshot({
      path: testInfo.outputPath(`donehub-overview-${width}.png`),
    })
    for (const section of ["API compatibility", "Network & requests"]) {
      const toggle = dialog.getByRole("button", { name: section, exact: true })
      await expect(toggle).toHaveAttribute("aria-expanded", "false")
      await toggle.click()
    }
    await dialog
      .getByRole("switch", { name: "Responses API compatibility" })
      .click()
    await dialog
      .getByRole("textbox", { name: "Responses request path" })
      .fill("/responses-v2")
    const mapping = dialog.getByRole("group", {
      name: "Model mapping",
      exact: true,
    })
    await mapping.scrollIntoViewIfNeeded()
    const keyBox = await mapping
      .getByRole("textbox", { name: "Model mapping: row 1 key", exact: true })
      .boundingBox()
    const valueBox = await mapping
      .getByRole("textbox", { name: "Model mapping: row 1 value", exact: true })
      .boundingBox()
    expect(keyBox).not.toBeNull()
    expect(valueBox).not.toBeNull()
    if (width < 640)
      expect(valueBox!.y).toBeGreaterThan(keyBox!.y + keyBox!.height)
    else expect(valueBox!.y).toBe(keyBox!.y)
    await page.screenshot({
      path: testInfo.outputPath(`donehub-models-${width}.png`),
    })
    await mapping.getByRole("button", { name: "Add row", exact: true }).click()
    await mapping
      .getByRole("textbox", { name: "Model mapping: row 2 key", exact: true })
      .fill("second-alias")
    await mapping
      .getByRole("textbox", { name: "Model mapping: row 2 value", exact: true })
      .fill("second-model")
    await mapping
      .getByRole("button", { name: "Add mapped names to model list" })
      .click()
    const testModel = dialog.getByRole("combobox", {
      name: "Test model",
      exact: true,
    })
    await testModel.scrollIntoViewIfNeeded()
    const inputGroup = dialog.locator('[data-slot="input-group"]').filter({
      has: page.getByRole("combobox", { name: "Test model", exact: true }),
    })
    const groupBox = await inputGroup.boundingBox()
    const iconBox = await inputGroup
      .locator('[data-slot="combobox-trigger-icon"]')
      .boundingBox()
    expect(groupBox).not.toBeNull()
    expect(iconBox).not.toBeNull()
    expect(
      groupBox!.x + groupBox!.width - (iconBox!.x + iconBox!.width),
    ).toBeLessThan(20)
    expect(
      Math.abs(
        iconBox!.y + iconBox!.height / 2 - (groupBox!.y + groupBox!.height / 2),
      ),
    ).toBeLessThan(2)
    await inputGroup.getByRole("button").click()
    await expect(page.getByRole("listbox")).toBeVisible()
    await testModel.press("Escape")
    await testModel.fill("")
    await testModel.press("ArrowDown")
    await page
      .getByRole("option", { name: "second-alias", exact: true })
      .click()
    await expect(testModel).toHaveValue("second-alias")
    await testModel.fill("manual-chat-model")
    await testModel.press("Tab")
    await expect(testModel).toHaveValue("manual-chat-model")
    await dialog
      .getByRole("textbox", { name: "Proxy URL", exact: true })
      .fill("")
    await dialog
      .getByRole("button", {
        name: "Custom request headers: remove row 1",
        exact: true,
      })
      .click()
    await dialog
      .getByRole("switch", { name: "Forward extra body fields" })
      .click()
    const parameters = dialog.getByRole("textbox", {
      name: "Extra request parameters",
      exact: true,
    })
    await parameters.fill('{"unfinished":')
    const requestsToggle = dialog.getByRole("button", {
      name: "Network & requests",
      exact: true,
    })
    // Invalid drafts must remain visible rather than being hidden by a collapse.
    await expect(requestsToggle).toHaveAttribute("aria-expanded", "true")
    await parameters.fill("{broken")
    await expect(
      dialog
        .getByRole("alert")
        .filter({ hasText: "Enter a valid JSON object." }),
    ).toBeVisible()
    await expect(
      page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
    ).toBeDisabled()
    await parameters.fill('{"overwrite":true,"temperature":0.5}')
    await dialog
      .getByRole("button", { name: "Format JSON", exact: true })
      .click()
    await expect(parameters).toHaveValue(
      '{\n  "overwrite": true,\n  "temperature": 0.5\n}',
    )
    await requestsToggle.click()
    await expect(parameters).toBeHidden()
    await requestsToggle.click()
    await expect(parameters).toHaveValue(
      '{\n  "overwrite": true,\n  "temperature": 0.5\n}',
    )

    await page
      .getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)
      .fill("Advanced updated")
    const updates: Record<string, unknown>[] = []
    context.on("request", (request) => {
      if (
        request.method() === "PUT" &&
        new URL(request.url()).pathname === "/api/channel/"
      )
        updates.push(request.postDataJSON())
    })
    await page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
    await expect(channelRowByName(page, "Advanced updated")).toBeVisible()
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      compatible_response: false,
      allow_extra_body: false,
      proxy: "",
      test_model: "manual-chat-model",
      model_headers: "{}",
      disabled_stream: ["model-donehub-a"],
      model_mapping: '{"alias":"upstream-model","second-alias":"second-model"}',
      models: "model-donehub-a,alias,second-alias",
      plugin: {
        customize: { "16": "/responses-v2", "1": "/custom/chat" },
        untouched: { enabled: true },
      },
      future_setting: { keep: true },
    })
    await openManagedSiteChannelRowActions(page, "Advanced updated")
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    for (const section of ["API compatibility", "Network & requests"]) {
      await dialog.getByRole("button", { name: section, exact: true }).click()
    }
    await expect(
      dialog.getByRole("textbox", { name: "Responses request path" }),
    ).toHaveValue("/responses-v2")
    await expect(
      dialog.getByRole("switch", { name: "Responses API compatibility" }),
    ).not.toBeChecked()
    await expect(
      dialog.getByRole("textbox", {
        name: "Model mapping: row 2 value",
        exact: true,
      }),
    ).toHaveValue("second-model")
    await expect(
      dialog.getByRole("combobox", { name: "Test model", exact: true }),
    ).toHaveValue("manual-chat-model")
    await dialog
      .getByRole("textbox", { name: "Extra request parameters", exact: true })
      .scrollIntoViewIfNeeded()
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true)
    await expect(
      page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
    ).toBeInViewport()
    await page.screenshot({
      path: testInfo.outputPath(`donehub-advanced-${width}.png`),
    })
  })
}
