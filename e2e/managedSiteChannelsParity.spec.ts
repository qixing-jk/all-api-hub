import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { SITE_TYPES } from "~/constants/siteType"
import {
  getManagedSiteChannelRowEditActionTestId,
  getManagedSiteChannelRowSelectTestId,
  MANAGED_SITE_CHANNELS_TEST_IDS,
} from "~/features/ManagedSiteChannels/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  getInterceptedAxonHubDeleteRequestCount,
  getInterceptedAxonHubListRequestCount,
  getInterceptedAxonHubUpdateVariables,
  getInterceptedNewApiDeleteRequestCount,
  getInterceptedNewApiFetchModelsRequestCount,
  getInterceptedNewApiListRequestCount,
  getInterceptedNewApiSecretRequestCount,
  getInterceptedNewApiUpdatePayload,
  getInterceptedOctopusCookieHeader,
  getInterceptedOctopusRootRequestCount,
  getInterceptedOctopusStatusRequestCount,
  NEW_API_CREATED_ID,
  openInterceptedAxonHubManagedSiteChannels,
  openInterceptedNewApiManagedSiteChannels,
  openInterceptedOctopusManagedSiteChannels,
} from "~~/e2e/fixtures/managedSiteChannelsIntercepted"
import {
  channelRowByName,
  getChannelRowTestToken,
  openManagedSiteChannelRowActions,
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

test("keeps the New API native presentation stable and loads editor models on demand", async ({
  context,
  extensionId,
  page,
}) => {
  await openInterceptedNewApiManagedSiteChannels({
    context,
    extensionId,
    page,
  })
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
  const { rowTestToken: primaryRowToken } =
    await openManagedSiteChannelRowActions(page, "Example primary")
  const editAction = page.getByTestId(
    getManagedSiteChannelRowEditActionTestId(primaryRowToken),
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
  await expect(page.getByTestId(CHANNEL_DIALOG_TEST_IDS.form)).toHaveCount(1)
  await expect(
    page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
  ).toBeEnabled()
  expect(getInterceptedNewApiFetchModelsRequestCount()).toBe(0)
  expect(getInterceptedNewApiSecretRequestCount()).toBe(0)
  await page
    .getByRole("button", { name: "Load Available Models", exact: true })
    .click()
  await expect.poll(getInterceptedNewApiFetchModelsRequestCount).toBe(1)
  await page
    .getByRole("combobox", { name: "Available Models", exact: true })
    .click()
  await expect(
    page.getByRole("option", { name: "model-from-credential", exact: true }),
  ).toBeVisible()
  expect(getInterceptedNewApiSecretRequestCount()).toBe(0)
  await page
    .getByRole("combobox", { name: "Available Models", exact: true })
    .press("Escape")
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await page
    .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.migrationModeButton)
    .click()
  await openManagedSiteChannelRowActions(page, "Example primary")
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

test("offers managed-site groups while editing a New API channel", async ({
  context,
  extensionId,
  page,
}) => {
  await openInterceptedNewApiManagedSiteChannels({
    context,
    extensionId,
    page,
  })
  await waitForExtensionRoot(page)

  const { rowTestToken: secondaryRowToken } =
    await openManagedSiteChannelRowActions(page, "Example secondary")
  await page
    .getByTestId(getManagedSiteChannelRowEditActionTestId(secondaryRowToken))
    .click()

  await page.getByRole("combobox", { name: "Channel Groups" }).click()
  await expect(page.getByRole("option", { name: "example" })).toBeVisible()
})

test("runs New API native CRUD through the shared UI", async ({
  context,
  extensionId,
  page,
}) => {
  test.setTimeout(120_000)
  const runPrefix = "AAH E2E New API intercepted"

  await openInterceptedNewApiManagedSiteChannels({
    context,
    extensionId,
    page,
  })

  await runManagedSiteChannelsCrudScenario({
    page,
    extensionId,
    siteType: SITE_TYPES.NEW_API,
    label: "New API intercepted",
    runPrefix,
    beforeDeleteConfirm: () => {
      expect(getInterceptedNewApiDeleteRequestCount()).toBe(0)
    },
  })

  expect(getInterceptedNewApiDeleteRequestCount()).toBe(1)
  const updatePayload = getInterceptedNewApiUpdatePayload()
  expect(updatePayload).toMatchObject({
    id: NEW_API_CREATED_ID,
    name: `${runPrefix} CRUD edited`,
    models: "gpt-4o-mini,gpt-4.1-mini",
  })
  expect(updatePayload).not.toHaveProperty("key")
})

test("reconciles confirmed New API edits and deletes without reloading the collection", async ({
  context,
  extensionId,
  page,
}) => {
  await openInterceptedNewApiManagedSiteChannels({
    context,
    extensionId,
    page,
  })
  await waitForExtensionRoot(page)

  const { rowTestToken: originalRowToken } =
    await openManagedSiteChannelRowActions(page, "Example primary")
  await page
    .getByTestId(getManagedSiteChannelRowEditActionTestId(originalRowToken))
    .click()

  await expect(
    page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
  ).toBeVisible()
  const listRequestsBeforeSave = getInterceptedNewApiListRequestCount()
  await page
    .getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)
    .fill("Example primary edited locally")
  await page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()

  const editedRow = channelRowByName(page, "Example primary edited locally")
  await expect(editedRow).toBeVisible()
  expect(getInterceptedNewApiListRequestCount()).toBe(listRequestsBeforeSave)

  const editedRowToken = await getChannelRowTestToken(editedRow)
  await editedRow
    .getByTestId(getManagedSiteChannelRowSelectTestId(editedRowToken))
    .click()
  await page
    .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.deleteSelectedButton)
    .click()
  const confirmDelete = page.getByTestId(
    MANAGED_SITE_CHANNELS_TEST_IDS.deleteChannelConfirmButton,
  )
  await expect(confirmDelete).toBeEnabled()
  const listRequestsBeforeDelete = getInterceptedNewApiListRequestCount()
  await confirmDelete.click()

  await expect(editedRow).toHaveCount(0)
  expect(getInterceptedNewApiDeleteRequestCount()).toBe(1)
  expect(getInterceptedNewApiListRequestCount()).toBe(listRequestsBeforeDelete)
})

test("uses the current Octopus cookie session in a real extension browser", async ({
  context,
  extensionId,
  page,
}) => {
  await openInterceptedOctopusManagedSiteChannels({
    context,
    extensionId,
    page,
  })
  await waitForExtensionRoot(page)

  await expect(page.getByRole("table")).toBeVisible()
  await expect
    .poll(async () =>
      (await context.cookies("https://octopus.example.invalid")).find(
        (cookie) => cookie.name === "auth",
      ),
    )
    .toBeTruthy()
  await expect.poll(getInterceptedOctopusCookieHeader).toContain("auth=")
  await expect.poll(getInterceptedOctopusStatusRequestCount).toBeGreaterThan(0)
  expect(getInterceptedOctopusRootRequestCount()).toBe(0)
  await expect(page.getByText("Unable to load channels")).toBeHidden()
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

  await openManagedSiteChannelRowActions(page, "Example primary")
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
  const tagsInput = page.getByRole("combobox", { name: "Tags" })
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
  expect(getInterceptedAxonHubListRequestCount()).toBe(listRequestsBeforeSave)
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
  await openManagedSiteChannelRowActions(page, "Example primary edited")
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

test.describe("mobile New API parity", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("keeps common toolbar controls usable", async ({
    context,
    extensionId,
    page,
  }) => {
    await openInterceptedNewApiManagedSiteChannels({
      context,
      extensionId,
      page,
    })
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
    await expect(page.getByTestId(CHANNEL_DIALOG_TEST_IDS.form)).toHaveCount(1)
    await expect(
      page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
    ).toBeDisabled()
    await page.getByRole("button", { name: "Cancel", exact: true }).click()

    await page
      .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.migrationModeButton)
      .click()
    await openManagedSiteChannelRowActions(page, "Example primary")
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

test.describe("mobile AxonHub parity", () => {
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
