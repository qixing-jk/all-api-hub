import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { SITE_TYPES } from "~/constants/siteType"
import {
  getManagedSiteChannelRowActionsButtonTestId,
  getManagedSiteChannelRowEditActionTestId,
  getManagedSiteChannelRowSelectTestId,
  MANAGED_SITE_CHANNELS_TEST_IDS,
} from "~/features/ManagedSiteChannels/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  getInterceptedAxonHubDeleteRequestCount,
  getInterceptedAxonHubListRequestCount,
  getInterceptedAxonHubUpdateVariables,
  openInterceptedAxonHubManagedSiteChannels,
  openInterceptedManagedSiteChannels,
} from "~~/e2e/fixtures/managedSiteChannelsIntercepted"
import {
  channelRowByName,
  getChannelRowTestToken,
  runManagedSiteChannelsCrudScenario,
} from "~~/e2e/scenarios/managedSiteChannels"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

test.use({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  locale: "en-US",
  timezoneId: "UTC",
  contextOptions: { reducedMotion: "reduce" },
})

test("keeps the legacy channels table and editor presentation stable", async ({
  context,
  extensionId,
  page,
}) => {
  await openInterceptedManagedSiteChannels({ context, extensionId, page })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await waitForExtensionRoot(page)

  await expect(page.getByRole("table")).toBeVisible()
  await expect(
    page.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.refreshButton),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Status" }).first(),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Columns" })).toBeVisible()
  await expect(
    page.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton),
  ).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "ID" })).toBeVisible()
  await expect(
    page.getByRole("columnheader", { name: "Channel" }),
  ).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "Type" })).toBeVisible()
  await page
    .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput)
    .fill("secondary")
  await expect(page.getByText("Example secondary")).toBeVisible()
  await page.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput).fill("")

  await page
    .getByTestId(getManagedSiteChannelRowActionsButtonTestId("Example primary"))
    .click()
  const editAction = page.getByTestId(
    getManagedSiteChannelRowEditActionTestId("Example primary"),
  )
  await expect(editAction).toBeVisible()
  await editAction.click()

  await expect(page.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)).toHaveValue(
    "Example primary",
  )
  await expect(
    page.getByTestId(CHANNEL_DIALOG_TEST_IDS.baseUrlInput),
  ).toBeVisible()
  await expect(
    page.getByTestId(CHANNEL_DIALOG_TEST_IDS.modelsInput),
  ).toBeVisible()
  await expect(page.getByText("Edit Channel", { exact: true })).toHaveCount(1)
  await expect(page.locator("form#channel-editor-form")).toHaveCount(1)
  await expect(
    page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
  ).toBeEnabled()
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await page
    .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.migrationModeButton)
    .click()
  await page
    .getByTestId(getManagedSiteChannelRowActionsButtonTestId("Example primary"))
    .click()
  await page.getByRole("menuitem", { name: "Migrate" }).click()

  const migrationDialog = page.getByRole("dialog", { name: "Dialog" })
  await expect(migrationDialog).toContainText("Migrate channels")
  await expect(
    migrationDialog.getByRole("combobox", { name: "Migration target" }),
  ).toBeVisible()
  await expect(
    migrationDialog.getByRole("button", { name: "Refresh preview" }),
  ).toBeVisible()
  await expect(
    migrationDialog.getByRole("button", { name: "Start migration" }),
  ).toBeEnabled()
  await migrationDialog.getByRole("button", { name: /Example primary/ }).click()
  await expect(
    migrationDialog.getByText("Base URL", { exact: true }),
  ).toBeVisible()
  await expect(
    migrationDialog.getByText("Channel Type", { exact: true }),
  ).toBeVisible()
  await expect(
    migrationDialog.getByText("Available Models", { exact: true }),
  ).toBeVisible()
  await expect(
    migrationDialog.getByText("Channel Groups", { exact: true }),
  ).toBeVisible()

  await expect(migrationDialog.getByText("Migration limitations")).toBeVisible()
})

test("runs the AxonHub native edit and migration preview through the shared UI", async ({
  context,
  extensionId,
  page,
}) => {
  await openInterceptedAxonHubManagedSiteChannels({
    context,
    extensionId,
    page,
  })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await waitForExtensionRoot(page)

  await expect(page.getByRole("table")).toBeVisible()
  await expect(
    page.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.refreshButton),
  ).toBeVisible()
  await expect(
    page.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton),
  ).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "ID" })).toBeVisible()
  await expect(
    page.getByRole("columnheader", { name: "Channel" }),
  ).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "Type" })).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "Tags" })).toBeVisible()
  await page
    .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput)
    .fill("secondary")
  await expect(page.getByText("Example secondary")).toBeVisible()
  await expect(page.getByText("Example primary")).toBeHidden()
  await page.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput).fill("")
  await expect(page.getByText("Example primary")).toBeVisible()

  const primaryRow = page
    .getByText("Example primary")
    .locator("xpath=ancestor::tr")
  await primaryRow.getByTestId(/-actions$/).click()
  const editAction = page.getByRole("menuitem", { name: "Edit" })
  await expect(editAction).toBeVisible()
  await editAction.click()

  await expect(page.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)).toHaveValue(
    "Example primary",
  )
  await expect(
    page.getByTestId(CHANNEL_DIALOG_TEST_IDS.baseUrlInput),
  ).toHaveValue("https://upstream.example.invalid/v1")
  await page
    .getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)
    .fill("Example primary edited")
  const tagsInput = page.locator('input[aria-label="Tags"]')
  await tagsInput.scrollIntoViewIfNeeded()
  await tagsInput.fill("edited-tag")
  await tagsInput.press("Enter")
  const listRequestsBeforeSave = getInterceptedAxonHubListRequestCount()
  const saveChangesButton = page.getByRole("button", {
    name: "Save Changes",
    exact: true,
  })
  await saveChangesButton.click()
  await expect(saveChangesButton).toBeHidden()
  await expect(page.getByText("Example primary edited")).toBeVisible()
  await expect
    .poll(getInterceptedAxonHubListRequestCount)
    .toBeGreaterThan(listRequestsBeforeSave)
  await expect.poll(getInterceptedAxonHubUpdateVariables).toEqual({
    id: "gid://axonhub/Channel/opaque-primary",
    input: {
      name: "Example primary edited",
      tags: ["fixture-tag", "edited-tag"],
    },
  })
  expect(JSON.stringify(getInterceptedAxonHubUpdateVariables())).not.toContain(
    "credentials",
  )

  await page
    .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.migrationModeButton)
    .click()
  await page
    .getByText("Example primary edited")
    .locator("xpath=ancestor::tr")
    .getByTestId(/-actions$/)
    .click()
  await page.getByRole("menuitem", { name: "Migrate" }).click()

  const migrationDialog = page.getByRole("dialog", { name: "Dialog" })
  await expect(migrationDialog).toContainText("Migrate channels")
  const migrationControls = page.getByTestId(
    MANAGED_SITE_CHANNELS_TEST_IDS.migrationControls,
  )
  await expect(migrationControls).toHaveCount(1)
  await expect(migrationControls).toBeVisible()
  const migrationTarget = migrationControls.getByRole("combobox", {
    name: "Migration target",
  })
  await expect(migrationTarget).toHaveCount(1)
  await expect(migrationTarget).toHaveText("Done Hub")
  const refreshPreview = migrationControls.getByRole("button", {
    name: "Refresh preview",
    exact: true,
  })
  await expect(refreshPreview).toHaveCount(1)
  await expect(refreshPreview).toBeEnabled()
  const startMigration = migrationDialog.getByRole("button", {
    name: "Start migration",
    exact: true,
  })
  await expect(startMigration).toHaveCount(1)
  await expect(startMigration).toBeEnabled()
  await expect(migrationDialog.getByText("Migration limitations")).toBeVisible()
  await migrationDialog
    .getByRole("button", { name: /Example primary edited/ })
    .click()
  await expect(
    migrationDialog.getByText("Base URL", { exact: true }),
  ).toBeVisible()
  await expect(
    migrationDialog.getByText("Available Models", { exact: true }),
  ).toBeVisible()
})

test("runs shared AxonHub CRUD without depending on name-derived row tokens", async ({
  context,
  extensionId,
  page,
}) => {
  test.setTimeout(120_000)

  await openInterceptedAxonHubManagedSiteChannels({
    context,
    extensionId,
    page,
  })

  await runManagedSiteChannelsCrudScenario({
    page,
    extensionId,
    siteType: SITE_TYPES.AXON_HUB,
    label: "AxonHub intercepted",
    runPrefix: "AAH E2E AxonHub intercepted",
    beforeDeleteConfirm: () => {
      expect(getInterceptedAxonHubDeleteRequestCount()).toBe(0)
    },
  })

  expect(getInterceptedAxonHubDeleteRequestCount()).toBe(1)
})

test("cancels native bulk-delete confirmation without dispatching a request", async ({
  context,
  extensionId,
  page,
}) => {
  await openInterceptedAxonHubManagedSiteChannels({
    context,
    extensionId,
    page,
  })
  await waitForExtensionRoot(page)

  const row = channelRowByName(page, "Example primary")
  const rowTestToken = await getChannelRowTestToken(row)
  await page
    .getByTestId(getManagedSiteChannelRowSelectTestId(rowTestToken))
    .click()
  await page
    .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.deleteSelectedButton)
    .click()

  const confirmButton = page.getByTestId(
    MANAGED_SITE_CHANNELS_TEST_IDS.deleteChannelConfirmButton,
  )
  await expect(confirmButton).toBeEnabled()
  expect(getInterceptedAxonHubDeleteRequestCount()).toBe(0)

  await page
    .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.deleteChannelCancelButton)
    .click()
  await expect(confirmButton).toBeHidden()
  await expect(row).toBeVisible()
  expect(getInterceptedAxonHubDeleteRequestCount()).toBe(0)
})

test.describe("mobile legacy parity", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("keeps common toolbar controls usable", async ({
    context,
    extensionId,
    page,
  }) => {
    await openInterceptedManagedSiteChannels({ context, extensionId, page })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await waitForExtensionRoot(page)

    await expect(
      page.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput),
    ).toBeVisible()
    await expect(
      page.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton),
    ).toBeVisible()
    await expect(page.getByRole("table")).toBeVisible()
    await expect(
      page.getByRole("columnheader", { name: "Channel" }),
    ).toBeVisible()
    await page
      .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput)
      .fill("secondary")
    await expect(page.getByText("Example secondary")).toBeVisible()
    await expect(page.getByText("Example primary")).toBeHidden()
    await page.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput).fill("")

    await page
      .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton)
      .click()
    await expect(
      page.getByRole("heading", { name: "Create Channel", exact: true }),
    ).toBeVisible()
    await expect(page.locator("form#channel-editor-form")).toHaveCount(1)
    await expect(
      page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
    ).toBeDisabled()
    await page.getByRole("button", { name: "Cancel", exact: true }).click()

    await page
      .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.migrationModeButton)
      .click()
    await page
      .getByTestId(
        getManagedSiteChannelRowActionsButtonTestId("Example primary"),
      )
      .click()
    await page.getByRole("menuitem", { name: "Migrate" }).click()
    const migrationDialog = page.getByRole("dialog", { name: "Dialog" })
    await expect(migrationDialog).toContainText("Migrate channels")
    await expect(
      migrationDialog.getByRole("button", { name: "Start migration" }),
    ).toBeEnabled()
    await migrationDialog
      .getByRole("button", { name: /Example primary/ })
      .click()
    await expect(
      migrationDialog.getByText("Base URL", { exact: true }),
    ).toBeVisible()
    await migrationDialog.getByRole("button", { name: "Cancel" }).click()
    await expect(migrationDialog).toBeHidden()
  })
})

test.describe("mobile native parity", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("keeps AxonHub common controls usable", async ({
    context,
    extensionId,
    page,
  }) => {
    await openInterceptedAxonHubManagedSiteChannels({
      context,
      extensionId,
      page,
    })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await waitForExtensionRoot(page)

    await expect(
      page.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput),
    ).toBeVisible()
    await expect(
      page.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton),
    ).toBeVisible()
    await expect(page.getByRole("table")).toBeVisible()
    await expect(
      page.getByRole("columnheader", { name: "Channel" }),
    ).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "Tags" })).toBeVisible()
  })
})
