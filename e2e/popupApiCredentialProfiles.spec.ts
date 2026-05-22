import { POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { verifyApiCredentialProfileModelsProbeScenario } from "~~/e2e/scenarios/apiCredentialProfileVerification"
import {
  createStoredApiCredentialProfile,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedApiCredentialProfiles,
  stubLlmMetadataIndex,
  waitForExtensionPage,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)

  await context.route("https://api.example.com/v1/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "ok",
        data: [{ id: "gpt-4o-mini" }, { id: "gpt-4.1-mini" }],
      }),
    }),
  )
})

test("creates an API credential profile from the popup tab", async ({
  extensionId,
  page,
}) => {
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()

  await page
    .getByTestId(POPUP_TEST_IDS.apiCredentialProfilesPrimaryAction)
    .click()

  await page.locator("#api-credential-profile-name").fill("Popup Profile")
  await page
    .locator("#api-credential-profile-baseUrl")
    .fill("https://api.example.com/v1")
  await page.locator("#api-credential-profile-apiKey").fill("sk-popup-profile")
  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.dialogSaveButton)
    .click()

  await expect(
    page.getByRole("heading", { name: "Popup Profile" }),
  ).toBeVisible()
})

test("creates a popup API credential profile, verifies it, and uses it in Model Management", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()

  await page
    .getByTestId(POPUP_TEST_IDS.apiCredentialProfilesPrimaryAction)
    .click()

  await page
    .locator("#api-credential-profile-name")
    .fill("Popup Journey Profile")
  await page
    .locator("#api-credential-profile-baseUrl")
    .fill("https://api.example.com/v1")
  await page.locator("#api-credential-profile-apiKey").fill("sk-popup-journey")
  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.dialogSaveButton)
    .click()

  await expect(
    page.getByRole("heading", { name: "Popup Journey Profile" }),
  ).toBeVisible()

  let profileId: string | null = null
  await expect
    .poll(async () => {
      const raw = await getPlasmoStorageRawValue<unknown>(
        serviceWorker,
        STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      )

      if (typeof raw !== "string") return null

      try {
        const parsed = JSON.parse(raw) as {
          profiles?: Array<{ id?: string; name?: string; baseUrl?: string }>
        }
        const profile = parsed.profiles?.find(
          (candidate) => candidate.name === "Popup Journey Profile",
        )
        profileId = profile?.id ?? null
        return profile
          ? {
              baseUrl: profile.baseUrl,
              id: profile.id,
            }
          : null
      } catch {
        return null
      }
    })
    .toMatchObject({
      baseUrl: "https://api.example.com",
      id: expect.any(String),
    })

  expect(profileId).toBeTruthy()

  await verifyApiCredentialProfileModelsProbeScenario({
    page,
    expectedModelCount: 2,
    closeDialog: true,
  })

  const targetPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: "options.html",
    hash: "#models",
    searchParams: {
      profileId: profileId!,
    },
  })

  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.openModelManagementButton)
    .click()

  const targetPage = await targetPagePromise
  installExtensionPageGuards(targetPage)
  await waitForExtensionRoot(targetPage)

  const targetUrl = new URL(targetPage.url())
  expect(targetUrl.hash).toBe("#models")
  expect(targetUrl.searchParams.get("profileId")).toBe(profileId)

  await expect(targetPage.getByText("gpt-4o-mini")).toBeVisible()
  await expect(targetPage.getByText("gpt-4.1-mini")).toBeVisible()
  await expect(
    targetPage
      .getByText("Profile: Popup Journey Profile", { exact: false })
      .first(),
  ).toBeVisible()
})

test("verifies a stored popup API credential profile against mocked endpoints", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      name: "Stored Profile",
      baseUrl: "https://api.example.com",
      apiKey: "sk-stored-profile",
    }),
  ])

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()

  await verifyApiCredentialProfileModelsProbeScenario({
    page,
    expectedModelCount: 2,
  })
})

test("opens Model Management for a stored popup API credential profile and loads its models", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "stored-profile-1",
      name: "Model Profile",
      baseUrl: "https://api.example.com",
      apiKey: "sk-model-profile",
    }),
  ])

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()

  const targetPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: "options.html",
    hash: "#models",
    searchParams: {
      profileId: "stored-profile-1",
    },
  })

  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.openModelManagementButton)
    .click()

  const targetPage = await targetPagePromise
  installExtensionPageGuards(targetPage)
  await waitForExtensionRoot(targetPage)

  const targetUrl = new URL(targetPage.url())
  expect(targetUrl.hash).toBe("#models")
  expect(targetUrl.searchParams.get("profileId")).toBe("stored-profile-1")

  await expect(targetPage.getByText("gpt-4o-mini")).toBeVisible()
  await expect(targetPage.getByText("gpt-4.1-mini")).toBeVisible()
  await expect(
    targetPage.getByText("Profile: Model Profile", { exact: false }).first(),
  ).toBeVisible()
  await expect(
    targetPage.getByRole("button", { name: "Key for this model" }),
  ).toHaveCount(0)
})

test("edits a stored popup API credential profile and persists the change", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "stored-profile-1",
      name: "Stored Profile",
      baseUrl: "https://api.example.com",
      apiKey: "sk-stored-profile",
    }),
  ])

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()

  await page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.editButton).click()

  await expect(
    page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.dialog),
  ).toBeVisible()
  await expect(page.getByText("Edit API credential")).toBeVisible()

  const nameInput = page.locator("#api-credential-profile-name")
  await nameInput.clear()
  await nameInput.fill("Updated Profile")
  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.dialogSaveButton)
    .click()

  await expect(
    page.getByRole("heading", { name: "Updated Profile" }),
  ).toBeVisible()

  await expect
    .poll(async () => {
      const raw = await getPlasmoStorageRawValue<unknown>(
        serviceWorker,
        STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      )

      if (typeof raw !== "string") return null

      try {
        const parsed = JSON.parse(raw) as {
          profiles?: Array<{ id?: string; name?: string }>
        }
        return (
          parsed.profiles?.find((profile) => profile.id === "stored-profile-1")
            ?.name ?? null
        )
      } catch {
        return null
      }
    })
    .toBe("Updated Profile")
})

test("deletes a stored popup API credential profile and removes it from storage", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "stored-profile-1",
      name: "Delete Me",
      baseUrl: "https://api.example.com",
      apiKey: "sk-delete-me",
    }),
  ])

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()

  await expect(page.getByRole("heading", { name: "Delete Me" })).toBeVisible()

  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.deleteTriggerButton)
    .click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("Delete credential")).toBeVisible()
  await dialog
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.deleteConfirmButton)
    .click()

  await expect(page.getByRole("heading", { name: "Delete Me" })).toHaveCount(0)

  await expect
    .poll(async () => {
      const raw = await getPlasmoStorageRawValue<unknown>(
        serviceWorker,
        STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      )

      if (typeof raw !== "string") return null

      try {
        const parsed = JSON.parse(raw) as {
          profiles?: Array<{ id?: string }>
        }
        return parsed.profiles?.some(
          (profile) => profile.id === "stored-profile-1",
        )
      } catch {
        return null
      }
    })
    .toBe(false)
})
