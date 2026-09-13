import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { openInterceptedNewApiManagedSiteChannels } from "~~/e2e/fixtures/managedSiteChannelsIntercepted"
import { openManagedSiteChannelRowActions } from "~~/e2e/scenarios/managedSiteChannels"

for (const revealBeforeSave of [false, true]) {
  test(`multi-key editing preserves entries (reveal before save: ${revealBeforeSave})`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    await page.setViewportSize({ width: 420, height: 900 })
    await openInterceptedNewApiManagedSiteChannels({
      context,
      page,
      extensionId,
      nativeFields: {
        key: "first-secret\nsecond-secret\nthird-secret",
        channel_info: {
          is_multi_key: true,
          multi_key_size: 3,
          multi_key_status_list: [3, 1, 1],
          multi_key_polling_index: 0,
          multi_key_mode: "random",
        },
      },
    })
    let secretReads = 0
    let verifications = 0
    context.on("request", (request) => {
      if (/\/api\/channel\/\d+\/key$/.test(new URL(request.url()).pathname))
        secretReads++
      if (new URL(request.url()).pathname === "/api/verify") verifications++
    })
    const verify = async () => {
      const verification = page.getByRole("dialog").filter({
        has: page.getByText("New API channel key verification", {
          exact: true,
        }),
      })
      await expect(verification).toBeVisible()
      await verification.getByRole("textbox").fill("123456")
      await verification
        .getByRole("button", { name: "Submit verification code" })
        .click()
      await expect(verification).toBeHidden()
    }
    const open = async () => {
      await openManagedSiteChannelRowActions(page, "Example primary")
      await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
      await expect(
        page
          .getByRole("dialog")
          .getByRole("button", { name: "Add key", exact: true }),
      ).toBeVisible()
    }
    await open()
    expect(secretReads).toBe(0)
    expect(verifications).toBe(0)
    const dialog = page.getByRole("dialog")
    const row = (number: number) =>
      dialog.getByRole("group", { name: `API Key ${number}`, exact: true })
    await row(1).getByRole("button", { name: /Key 1/ }).click()
    if (revealBeforeSave) {
      await row(1)
        .getByRole("button", { name: "Show key", exact: true })
        .click()
      await verify()
      await expect(row(1).getByLabel("API Key 1", { exact: true })).toHaveValue(
        "first-secret",
      )
      expect(secretReads).toBe(1)
    }
    await row(1)
      .getByRole("switch", { name: "Enable this key", exact: true })
      .click()
    await row(2)
      .getByRole("button", { name: "Remove key", exact: true })
      .click()
    await row(2).getByRole("button", { name: /Key 2/ }).click()
    await row(2).getByLabel("API Key 2", { exact: true }).fill("rotated-third")
    await dialog.getByRole("button", { name: "Add key", exact: true }).click()
    await row(3).getByLabel("API Key 3", { exact: true }).fill("fourth-secret")
    await row(3)
      .getByRole("switch", { name: "Enable this key", exact: true })
      .click()
    await expect
      .poll(() =>
        dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      )
      .toBe(true)
    const enabledColor = await row(1)
      .getByRole("switch", { name: "Enable this key", exact: true })
      .evaluate((element) => getComputedStyle(element).backgroundColor)
    await expect
      .poll(() =>
        row(3)
          .getByRole("switch", { name: "Enable this key", exact: true })
          .evaluate((element) => getComputedStyle(element).backgroundColor),
      )
      .not.toBe(enabledColor)
    await page.screenshot({ path: testInfo.outputPath("multi-key-editor.png") })
    await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
    await expect(dialog).toBeHidden()
    expect(secretReads).toBe(revealBeforeSave ? 1 : 0)
    expect(verifications).toBe(revealBeforeSave ? 1 : 0)
    await open()
    expect(secretReads).toBe(revealBeforeSave ? 1 : 0)
    await row(2).getByRole("button", { name: /Key 2/ }).click()
    await row(2).getByRole("button", { name: "Show key", exact: true }).click()
    if (!revealBeforeSave) await verify()
    await expect(row(2).getByLabel("API Key 2", { exact: true })).toHaveValue(
      "rotated-third",
    )
    await row(3).getByRole("button", { name: /Key 3/ }).click()
    await row(3).getByRole("button", { name: "Show key", exact: true }).click()
    await expect(row(3).getByLabel("API Key 3", { exact: true })).toHaveValue(
      "fourth-secret",
    )
    expect(secretReads).toBe(revealBeforeSave ? 2 : 1)
    await expect(
      row(3).getByRole("switch", { name: "Enable this key", exact: true }),
    ).not.toBeChecked()
  })
}

test("multi-key native edits never disclose retained keys", async ({
  context,
  page,
  extensionId,
}) => {
  await openInterceptedNewApiManagedSiteChannels({
    context,
    page,
    extensionId,
    nativeFields: {
      key: "first-secret\nsecond-secret",
      channel_info: {
        is_multi_key: true,
        multi_key_size: 2,
        multi_key_status_list: [1, 1],
        multi_key_mode: "random",
        multi_key_polling_index: 0,
      },
    },
  })
  const protectedRequests: string[] = []
  context.on("request", (request) => {
    const path = new URL(request.url()).pathname
    if (/\/api\/channel\/\d+\/key$/.test(path) || path === "/api/verify")
      protectedRequests.push(path)
  })
  await openManagedSiteChannelRowActions(page, "Example primary")
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
  const dialog = page.getByRole("dialog")
  const row = (number: number) =>
    dialog.getByRole("group", { name: `API Key ${number}`, exact: true })
  await expect(
    dialog.getByRole("button", { name: "Add key", exact: true }),
  ).toBeVisible()
  expect(protectedRequests).toEqual([])
  await row(1).getByRole("button", { name: "Remove key", exact: true }).click()
  await row(1).getByRole("button", { name: /Key 1/ }).click()
  await row(1)
    .getByRole("switch", { name: "Enable this key", exact: true })
    .uncheck()
  await dialog.getByRole("button", { name: "Add key", exact: true }).click()
  await row(2).getByLabel("API Key 2", { exact: true }).fill("third-secret")
  await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
  await expect(dialog).toBeHidden()
  await openManagedSiteChannelRowActions(page, "Example primary")
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
  await expect(
    dialog.getByRole("group", { name: /^API Key \d+$/ }),
  ).toHaveCount(2)
  await row(1).getByRole("button", { name: /Key 1/ }).click()
  await expect(
    row(1).getByRole("switch", { name: "Enable this key", exact: true }),
  ).not.toBeChecked()
  expect(protectedRequests).toEqual([])
})

test("replacing a key with an existing key keeps both original slots and asks for review", async ({
  context,
  page,
  extensionId,
}) => {
  await openInterceptedNewApiManagedSiteChannels({
    context,
    page,
    extensionId,
    nativeFields: {
      key: "first-secret\nsecond-secret",
      channel_info: {
        is_multi_key: true,
        multi_key_size: 2,
        multi_key_status_list: [1, 1],
        multi_key_mode: "random",
        multi_key_polling_index: 0,
      },
    },
  })
  let deletedKeys = 0
  let secretReads = 0
  context.on("request", (request) => {
    const path = new URL(request.url()).pathname
    if (/\/api\/channel\/\d+\/key$/.test(path) || path === "/api/verify")
      secretReads++
    if (
      path === "/api/channel/multi_key/manage" &&
      request.postDataJSON()?.action === "delete_key"
    )
      deletedKeys++
  })
  await openManagedSiteChannelRowActions(page, "Example primary")
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
  const dialog = page.getByRole("dialog")
  const first = dialog.getByRole("group", { name: "API Key 1", exact: true })
  await first.getByRole("button", { name: /Key 1/ }).click()
  await first.getByLabel("API Key 1", { exact: true }).fill("second-secret")
  await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
  await expect(
    page.getByText(
      "Some fields may have been saved, but the status could not be confirmed. Refresh the channel list and review the channel before retrying.",
      { exact: true },
    ),
  ).toBeVisible()
  await expect(dialog).toBeHidden()
  expect(deletedKeys).toBe(0)
  expect(secretReads).toBe(0)
  await openManagedSiteChannelRowActions(page, "Example primary")
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
  await expect(
    dialog.getByRole("group", { name: /^API Key \d+$/ }),
  ).toHaveCount(2)
})
