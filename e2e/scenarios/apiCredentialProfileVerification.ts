import type { Page } from "@playwright/test"

import { POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import {
  API_CREDENTIAL_PROFILES_TEST_IDS,
  getApiCredentialProfileVerifyProbeTestId,
} from "~/features/ApiCredentialProfiles/testIds"
import { expect } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
} from "~~/e2e/utils/commonUserFlows"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

export async function openApiCredentialProfilesPopupScenario(params: {
  page: Page
  extensionId: string
}) {
  installExtensionPageGuards(params.page)
  await forceExtensionLanguage(params.page, "en")
  await params.page.goto(
    `chrome-extension://${params.extensionId}/${POPUP_PAGE_PATH}`,
  )
  await waitForExtensionRoot(params.page)

  await params.page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    params.page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()

  return params.page
}

export async function verifyApiCredentialProfileModelsProbeScenario(params: {
  page: Page
  profileName?: string
  expectedStatus?: "pass" | "fail"
  expectedModelCount?: number
  expectedSummaryText?: string
  closeDialog?: boolean
}) {
  let verifyButton = params.page.getByTestId(
    API_CREDENTIAL_PROFILES_TEST_IDS.verifyButton,
  )

  if (params.profileName) {
    const profileHeading = params.page.getByRole("heading", {
      name: params.profileName,
    })
    await expect(profileHeading).toBeVisible()

    const profileCard = profileHeading.locator(
      `xpath=ancestor::*[.//*[@data-testid="${API_CREDENTIAL_PROFILES_TEST_IDS.verifyButton}"]][1]`,
    )
    verifyButton = profileCard.getByTestId(
      API_CREDENTIAL_PROFILES_TEST_IDS.verifyButton,
    )
  }

  await verifyButton.click()

  const modelsProbe = params.page.getByTestId(
    getApiCredentialProfileVerifyProbeTestId("models"),
  )
  await expect(
    params.page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyModelId),
  ).toBeVisible()

  await modelsProbe
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyProbeRunButton)
    .click()

  await expect(modelsProbe).toContainText(
    params.expectedStatus === "fail" ? "Fail" : "Pass",
  )
  if (typeof params.expectedModelCount === "number") {
    await expect(modelsProbe).toContainText(
      `Fetched ${params.expectedModelCount} models.`,
    )
  }
  if (params.expectedSummaryText) {
    await expect(modelsProbe).toContainText(params.expectedSummaryText)
  }

  if (params.closeDialog) {
    await params.page
      .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyDialogCloseButton)
      .click()
    await expect(
      params.page.getByRole("heading", { name: "API Verification" }),
    ).toHaveCount(0)
  }
}
