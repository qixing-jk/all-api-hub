import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  openInterceptedDoneHubManagedSiteChannels,
  openInterceptedNewApiManagedSiteChannels,
} from "~~/e2e/fixtures/managedSiteChannelsIntercepted"
import { openManagedSiteChannelRowActions } from "~~/e2e/scenarios/managedSiteChannels"
import {
  createStoredApiCredentialProfile,
  seedApiCredentialProfiles,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

const primaryDetail =
  /^https:\/\/managed\.example\.invalid\/api\/channel\/101(?:\?.*)?$/

for (const provider of ["new-api", "done-hub"] as const) {
  test(`${provider} loads channel groups once when opening an editor`, async ({
    context,
    page,
    extensionId,
  }) => {
    await (
      provider === "new-api"
        ? openInterceptedNewApiManagedSiteChannels
        : openInterceptedDoneHubManagedSiteChannels
    )({ context, page, extensionId })
    const requests: string[] = []
    context.on("request", (request) => {
      if (/\/api\/group\/?$/.test(new URL(request.url()).pathname)) {
        requests.push(request.url())
      }
    })
    const channelName =
      provider === "new-api" ? "Example primary" : "DoneHub primary"
    await openManagedSiteChannelRowActions(page, channelName)
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await expect(
      dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput),
    ).toHaveValue(channelName)
    await expect.poll(() => requests.length).toBeGreaterThan(0)
    await expect(
      dialog
        .getByRole("group", { name: "Models", exact: true })
        .getByRole("status"),
    ).toHaveCount(0)
    await dialog
      .getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)
      .fill("Unchanged groups")
    await expect(
      dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
    ).toBeEnabled()
    expect(requests).toHaveLength(1)
    await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.cancelButton).click()
    await expect(dialog).toBeHidden()
    await seedApiCredentialProfiles(await getServiceWorker(context), [
      createStoredApiCredentialProfile({
        id: "group-request-source",
        name: "Group request source",
        baseUrl: "https://group-source.example.invalid",
        apiKey: "sk-group-source",
      }),
    ])
    await context.route(
      "https://group-source.example.invalid/v1/models",
      (route) => route.fulfill({ json: { data: [{ id: "model-a" }] } }),
    )
    requests.length = 0
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
    )
    await page
      .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.importToManagedSiteButton)
      .click()
    await expect(
      dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput),
    ).toBeVisible()
    await expect.poll(() => requests.length).toBeGreaterThan(0)
    await expect(
      dialog
        .getByRole("group", { name: "Models", exact: true })
        .getByRole("status"),
    ).toHaveCount(0)
    await dialog
      .getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)
      .fill("Imported groups")
    await expect(
      dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
    ).toBeEnabled()
    expect(requests).toHaveLength(1)
  })
}

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
      await expect(
        dialog
          .getByTestId(CHANNEL_DIALOG_TEST_IDS.footer)
          .getByRole("button", { name: "Retry", exact: true }),
      ).toBeVisible()
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true)
      await page.screenshot({
        path: testInfo.outputPath("channel-opening-error.png"),
      })
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
    await expect(
      dialog
        .getByRole("group", { name: "Models", exact: true })
        .getByRole("status"),
    ).toHaveCount(0)
    await expect(name).toHaveValue("Draft kept while groups load")
  } finally {
    release()
  }
})
