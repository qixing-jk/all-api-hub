import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import {
  getManagedSiteChannelRowActionsButtonTestId,
  getManagedSiteChannelRowEditActionTestId,
  MANAGED_SITE_CHANNELS_TEST_IDS,
} from "~/features/ManagedSiteChannels/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { openInterceptedManagedSiteChannels } from "~~/e2e/fixtures/managedSiteChannelsIntercepted"
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
  const editorDialog = page.getByRole("dialog", { name: "Dialog" })
  await expect(editorDialog.getByText("Edit Channel")).toHaveCount(1)
  await expect(editorDialog.locator("form#channel-editor-form")).toHaveCount(1)
  await expect(
    page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
  ).toBeEnabled()
  await editorDialog
    .getByRole("button", { name: "Cancel", exact: true })
    .click()
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
    const editorDialog = page.getByRole("dialog", { name: "Dialog" })
    await expect(
      editorDialog.locator("h3", { hasText: "Create Channel" }),
    ).toHaveCount(1)
    await expect(editorDialog.locator("form#channel-editor-form")).toHaveCount(
      1,
    )
    await expect(
      page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
    ).toBeDisabled()
    await editorDialog
      .getByRole("button", { name: "Cancel", exact: true })
      .click()

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
