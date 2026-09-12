import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { openInterceptedNewApiManagedSiteChannels } from "~~/e2e/fixtures/managedSiteChannelsIntercepted"
import { openManagedSiteChannelRowActions } from "~~/e2e/scenarios/managedSiteChannels"

const primaryDetail =
  /^https:\/\/managed\.example\.invalid\/api\/channel\/101(?:\?.*)?$/

for (const width of [1280, 420]) {
  test(`channel loading and inline retry remain usable at ${width}px`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await openInterceptedNewApiManagedSiteChannels({
      context,
      page,
      extensionId,
    })
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let fail = true
    await context.route(primaryDetail, async (route) => {
      if (!fail) return route.fallback()
      await gate
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          message: "Temporary channel read failure",
        }),
      })
    })
    try {
      await openManagedSiteChannelRowActions(page, "Example primary")
      await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole("status")).toHaveText(
        "Loading channel configuration…",
      )
      await expect(dialog.getByRole("status")).toHaveClass(/sr-only/)
      await expect(
        dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
      ).toHaveCount(0)
      await expect(
        dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.cancelButton),
      ).toBeEnabled()
      await page.screenshot({
        path: testInfo.outputPath("channel-loading.png"),
      })
      release()
      await expect(dialog.getByRole("alert")).toBeVisible()
      await expect(dialog.getByRole("textbox")).toHaveCount(0)
      fail = false
      await dialog.getByRole("button", { name: "Retry", exact: true }).click()
      await expect(
        dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput),
      ).toHaveValue("Example primary")
      await expect(
        dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
      ).toBeVisible()
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true)
    } finally {
      release()
    }
  })
}

test("closing a loading channel allows another channel to open", async ({
  context,
  page,
  extensionId,
}) => {
  await openInterceptedNewApiManagedSiteChannels({ context, page, extensionId })
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await context.route(primaryDetail, async (route) => {
    await gate
    await route.fallback()
  })
  try {
    await openManagedSiteChannelRowActions(page, "Example primary")
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.getByTestId(CHANNEL_DIALOG_TEST_IDS.cancelButton).click()
    await expect(page.getByRole("dialog")).toBeHidden()
    await openManagedSiteChannelRowActions(page, "Example secondary")
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    await expect(
      page.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput),
    ).toHaveValue("Example secondary")
    release()
    await expect(
      page.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput),
    ).toHaveValue("Example secondary")
  } finally {
    release()
  }
})

test("optional group loading and retry preserve an editable channel", async ({
  context,
  page,
  extensionId,
}) => {
  await openInterceptedNewApiManagedSiteChannels({ context, page, extensionId })
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let fail = true
  await context.route(
    "https://managed.example.invalid/api/group",
    async (route) => {
      if (!fail) return route.fallback()
      await gate
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          message: "Temporary group read failure",
        }),
      })
    },
  )
  try {
    await openManagedSiteChannelRowActions(page, "Example primary")
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    const dialog = page.getByRole("dialog")
    const name = dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)
    await expect(name).toHaveValue("Example primary")
    await expect(
      dialog
        .getByRole("group", { name: "Models", exact: true })
        .getByRole("status"),
    ).toBeVisible()
    await name.fill("Draft kept while groups load")
    await expect(
      dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
    ).toBeEnabled()
    release()
    const retry = dialog.getByRole("button", {
      name: "Retry Channel Groups",
      exact: true,
    })
    await expect(retry).toBeVisible()
    await expect(name).toHaveValue("Draft kept while groups load")
    await expect(
      dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
    ).toBeEnabled()
    fail = false
    await retry.click()
    await expect(retry).toBeHidden()
    await expect(dialog.getByRole("status")).toHaveCount(0)
    await expect(name).toHaveValue("Draft kept while groups load")
  } finally {
    release()
  }
})
