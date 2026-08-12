import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredApiCredentialProfile,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedApiCredentialProfiles,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

test.beforeEach(async ({ page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
})

test("groups credentials by Base URL while preserving each credential card", async ({
  context,
  extensionId,
  page,
}) => {
  const firstBaseUrl = "https://team-gateway.example.invalid"
  const secondBaseUrl = "https://backup-gateway.example.invalid"
  const serviceWorker = await getServiceWorker(context)
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "team-primary",
      name: "Team primary",
      baseUrl: firstBaseUrl,
      apiKey: "sk-team-primary",
    }),
    createStoredApiCredentialProfile({
      id: "team-fallback",
      name: "Team fallback",
      baseUrl: firstBaseUrl,
      apiKey: "sk-team-fallback",
    }),
    createStoredApiCredentialProfile({
      id: "backup-key",
      name: "Backup endpoint key",
      baseUrl: secondBaseUrl,
      apiKey: "sk-backup-key",
    }),
  ])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const endpointNavigation = page.getByTestId(
    API_CREDENTIAL_PROFILES_TEST_IDS.endpointNavigation,
  )
  await expect(endpointNavigation).toBeVisible()
  await endpointNavigation
    .getByRole("button", {
      name: "https://team-gateway.example.invalid",
      exact: true,
    })
    .click()
  await expect(page.getByText("Team primary", { exact: true })).toBeVisible()
  await expect(page.getByText("Team fallback", { exact: true })).toBeVisible()
  await expect(page.getByText(firstBaseUrl, { exact: true })).toHaveCount(1)
  await expect(
    page.getByTestId(
      API_CREDENTIAL_PROFILES_TEST_IDS.endpointCopyBaseUrlButton,
    ),
  ).toHaveCount(1)
  await expect(
    page.getByText("Backup endpoint key", { exact: true }),
  ).toHaveCount(0)

  await endpointNavigation
    .getByRole("button", {
      name: "https://backup-gateway.example.invalid",
      exact: true,
    })
    .click()

  await expect(
    page.getByText("Backup endpoint key", { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(secondBaseUrl, { exact: true })).toHaveCount(1)
  await expect(
    page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.editButton),
  ).toBeVisible()

  await page.setViewportSize({ width: 420, height: 900 })
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()

  const endpointSelector = page.getByTestId(
    API_CREDENTIAL_PROFILES_TEST_IDS.endpointSelector,
  )
  await expect(endpointSelector).toBeVisible()
  await endpointSelector.click()
  await page
    .getByRole("option", { name: /backup-gateway\.example\.invalid/ })
    .click()
  await expect(
    page.getByText("Backup endpoint key", { exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true)
})
