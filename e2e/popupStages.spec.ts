import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("shows the account workspace for a zero balance and keeps search misses distinct from onboarding", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount({
      site_name: "Zero balance account",
      account_info: { quota: 0 },
    }),
  ])
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await waitForExtensionRoot(page)
  await expect(page.getByText("Total Balance", { exact: true })).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Refresh", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Key Management", exact: true }),
  ).toBeVisible()
  await expect(page.getByText("No accounts yet")).toHaveCount(0)
  await page
    .getByTestId(POPUP_TEST_IDS.scrollContainer)
    .screenshot({ path: testInfo.outputPath("saved-accounts.png") })
  const search = page.getByPlaceholder(
    "Enter site information or account information to search",
  )
  await search.fill("no-such-account")
  await expect(page.getByText("No matching accounts found")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Add your first account" }),
  ).toHaveCount(0)
  await search.press("Escape")
  await expect(search).toHaveValue("")
  await expect(
    page.getByText("Zero balance account", { exact: true }),
  ).toBeVisible()
})

test("offers bookmark creation in the empty state without a duplicate toolbar", async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await waitForExtensionRoot(page)
  await page.getByTestId(POPUP_TEST_IDS.bookmarksTab).click()
  await expect(page.getByText("No bookmarks yet")).toBeVisible()
  await expect(
    page.getByTestId(POPUP_TEST_IDS.bookmarksPrimaryAction),
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Add your first bookmark" }),
  ).toBeVisible()
  await expect(page.getByText("Total Bookmarks", { exact: true })).toHaveCount(
    0,
  )
  await page.getByRole("button", { name: "Add your first bookmark" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
})

test("guides the first account without empty statistics or account shortcuts", async ({
  page,
  extensionId,
}, testInfo) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await waitForExtensionRoot(page)
  await expect(page.getByText("No accounts yet")).toBeVisible()
  await expect(
    page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Import a backup" }),
  ).toHaveCount(0)
  await page
    .getByTestId(POPUP_TEST_IDS.scrollContainer)
    .screenshot({ path: testInfo.outputPath("empty-accounts.png") })

  await expect(
    page.getByRole("button", { name: "Refresh", exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Quick check-in" }),
  ).toHaveCount(0)
  await expect(page.getByText("Total Balance", { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Share overview snapshot", exact: true }),
  ).toHaveCount(0)
  const signInHint = page.getByText(
    "Sign in to your API site, then add an account using automatic detection or manual entry.",
  )
  await expect(signInHint).toBeVisible()
  const hintBounds = await signInHint.boundingBox()
  const addAccount = page.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton,
  )
  const actionBounds = await addAccount.boundingBox()
  expect(hintBounds).not.toBeNull()
  expect(actionBounds).not.toBeNull()
  expect(actionBounds!.y).toBeGreaterThanOrEqual(
    hintBounds!.y + hintBounds!.height,
  )

  await addAccount.click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(page.getByTestId(POPUP_TEST_IDS.accountsTab)).toBeVisible()
})

test("keeps an empty credential library focused on adding a credential", async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await waitForExtensionRoot(page)
  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(page.getByText("No API credentials saved yet")).toBeVisible()
  await expect(
    page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesPrimaryAction),
  ).toHaveCount(0)
  await expect(
    page.getByPlaceholder(
      "Search by name, base URL, tag, source page, or notes",
    ),
  ).toHaveCount(0)
  await expect(page.getByRole("combobox")).toHaveCount(0)
  await expect(
    page.getByText("Total credentials", { exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Open Key Management", exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole("button", { name: "Add API credential", exact: true })
    .click()
  await expect(page.getByRole("dialog")).toBeVisible()
})
