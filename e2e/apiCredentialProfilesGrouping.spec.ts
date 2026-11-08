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
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

test.beforeEach(async ({ page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
})

test("groups credentials by Base URL while preserving each credential entry", async ({
  context,
  extensionDir,
  extensionId,
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
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

  await captureVisualViews({
    page,
    ready: page.getByText("Team primary", { exact: true }),
    id: "endpoint-credentials-options",
    extensionDir,
    views: [
      { id: "light", width: 1920, height: 1080, theme: "light" },
      { id: "dark", width: 1920, height: 1080, theme: "dark" },
    ],
  })

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
  await endpointSelector.click()
  await page
    .getByRole("option", { name: /team-gateway\.example\.invalid/ })
    .click()
  await expect(page.getByText("Team primary", { exact: true })).toBeVisible()
  await expect(page.getByText("Team fallback", { exact: true })).toBeVisible()
  await captureVisualViews({
    page,
    ready: page.getByText("Team primary", { exact: true }),
    id: "endpoint-credentials-popup",
    extensionDir,
    views: [
      { id: "light", width: 420, height: 1000, theme: "light" },
      { id: "dark", width: 320, height: 1100, theme: "dark" },
    ],
  })
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true)

  const toolbar = page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.toolbar)
    .first()
  const separators = toolbar.locator(":scope > div > span[aria-hidden='true']")
  await expect(separators).toHaveCount(3)
  for (const separator of await separators.all()) {
    await expect(separator).toBeVisible()
  }

  // A narrow parent can wrap actions even when the viewport stays unchanged.
  await toolbar.evaluate((element) => {
    element.style.maxWidth = "160px"
  })
  await expect
    .poll(() =>
      separators.evaluateAll(
        (elements) =>
          elements.filter(
            (element) => getComputedStyle(element).visibility === "hidden",
          ).length,
      ),
    )
    .toBeGreaterThan(0)
  for (const separator of await separators.all()) {
    const startsRow = await separator.evaluate((element) => {
      const group = element.parentElement!
      const previous = group.previousElementSibling!
      return (
        Math.abs(
          group.getBoundingClientRect().top -
            previous.getBoundingClientRect().top,
        ) > 1
      )
    })
    if (startsRow) await expect(separator).toBeHidden()
    else await expect(separator).toBeVisible()
  }
  await toolbar.evaluate((element) => {
    element.style.removeProperty("max-width")
  })
  for (const separator of await separators.all()) {
    await expect(separator).toBeVisible()
  }
})
