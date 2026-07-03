import type { Page } from "@playwright/test"

import { POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import {
  API_CREDENTIAL_PROFILES_TEST_IDS,
  getApiCredentialProfileVerifyProbeTestId,
} from "~/features/ApiCredentialProfiles/testIds"
import { expect } from "~~/e2e/fixtures/extensionTest"
import {
  verifyCcSwitchModelExportDeepLink,
  verifyCcSwitchModelPickerCancelable,
} from "~~/e2e/scenarios/ccSwitchExport"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
} from "~~/e2e/utils/commonUserFlows"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

export type ApiCredentialProfileModelsProbeDialogExpectation = {
  page: Page
  expectedStatus?: "pass" | "fail" | "handled"
  expectedModelCount?: number
  expectedSummaryText?: string
  closeDialog?: boolean
}

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

export async function verifyOpenApiCredentialProfileModelsProbeDialog(
  params: ApiCredentialProfileModelsProbeDialogExpectation,
) {
  const modelsProbe = params.page.getByTestId(
    getApiCredentialProfileVerifyProbeTestId("models"),
  )
  await expect(
    params.page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyModelId),
  ).toBeVisible()

  await modelsProbe
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyProbeRunButton)
    .click()

  if (params.expectedStatus === "handled") {
    await expect(modelsProbe).toContainText(/Pass|Fail/)
  } else {
    await expect(modelsProbe).toContainText(
      params.expectedStatus === "fail" ? "Fail" : "Pass",
    )
  }
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

export async function verifyApiCredentialProfileModelsProbeScenario(params: {
  page: Page
  profileName?: string
  expectedStatus?: "pass" | "fail" | "handled"
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

    const profileCard = await getApiCredentialProfileCard({
      page: params.page,
      profileName: params.profileName,
      actionTestId: API_CREDENTIAL_PROFILES_TEST_IDS.verifyButton,
    })
    verifyButton = profileCard.getByTestId(
      API_CREDENTIAL_PROFILES_TEST_IDS.verifyButton,
    )
  }

  await verifyButton.click()

  await verifyOpenApiCredentialProfileModelsProbeDialog(params)
}

async function getApiCredentialProfileCard(params: {
  page: Page
  profileName: string
  actionTestId?: string
}) {
  const profileHeading = params.page.getByRole("heading", {
    name: params.profileName,
  })
  await expect(profileHeading).toBeVisible()

  return profileHeading.locator(
    `xpath=ancestor::*[.//*[@data-testid="${params.actionTestId ?? API_CREDENTIAL_PROFILES_TEST_IDS.exportMenuButton}"]][1]`,
  )
}

export async function verifyApiCredentialProfileCcSwitchModelPickerScenario(params: {
  page: Page
  profileName: string
  modelName?: string
  expectedApiKey?: string
  expectedBaseUrl?: string
}) {
  const profileCard = await getApiCredentialProfileCard({
    page: params.page,
    profileName: params.profileName,
  })

  await profileCard
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.exportMenuButton)
    .click()
  await params.page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.exportToCCSwitchMenuItem)
    .click()

  if (params.modelName) {
    await verifyCcSwitchModelExportDeepLink({
      page: params.page,
      modelName: params.modelName,
      expected: {
        app: "claude",
        name: params.profileName,
        homepage: params.expectedBaseUrl,
        endpoint: params.expectedBaseUrl,
        apiKey: params.expectedApiKey,
      },
    })
    return
  }

  await verifyCcSwitchModelPickerCancelable({ page: params.page })
}
