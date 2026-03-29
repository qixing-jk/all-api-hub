import { POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
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

  await page.getByRole("tab", { name: "API Credentials" }).click()
  await expect(
    page.getByTestId("api-credential-profiles-popup-view"),
  ).toBeVisible()

  await page
    .getByTestId("popup-view-apiCredentialProfiles")
    .getByRole("button", { name: "Add profile" })
    .first()
    .click()

  await page.locator("#api-credential-profile-name").fill("Popup Profile")
  await page
    .locator("#api-credential-profile-baseUrl")
    .fill("https://api.example.com/v1")
  await page.locator("#api-credential-profile-apiKey").fill("sk-popup-profile")
  await page.getByRole("button", { name: "Save" }).click()

  await expect(
    page.getByRole("heading", { name: "Popup Profile" }),
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

  await page.getByRole("tab", { name: "API Credentials" }).click()
  await expect(
    page.getByTestId("api-credential-profiles-popup-view"),
  ).toBeVisible()

  await page.getByRole("button", { name: "Verify API" }).click()

  const modelsProbe = page.getByTestId("profile-verify-probe-models")
  await expect(page.getByTestId("profile-verify-model-id")).toBeVisible()

  await modelsProbe.getByRole("button", { name: "Run" }).click()

  await expect(modelsProbe).toContainText("Pass")
  await expect(modelsProbe).toContainText("Fetched 2 models.")
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

  await page.getByRole("tab", { name: "API Credentials" }).click()
  await expect(
    page.getByTestId("api-credential-profiles-popup-view"),
  ).toBeVisible()

  const targetPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: "options.html",
    hash: "#models",
    searchParams: {
      profileId: "stored-profile-1",
    },
  })

  await page.getByRole("button", { name: "Open in Model Management" }).click()

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

  await page.getByRole("tab", { name: "API Credentials" }).click()
  await expect(
    page.getByTestId("api-credential-profiles-popup-view"),
  ).toBeVisible()

  await page.getByRole("button", { name: "Edit" }).click()

  await expect(page.getByText("Edit API credential profile")).toBeVisible()

  const nameInput = page.locator("#api-credential-profile-name")
  await nameInput.clear()
  await nameInput.fill("Updated Profile")
  await page.getByRole("button", { name: "Save" }).click()

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

  await page.getByRole("tab", { name: "API Credentials" }).click()
  await expect(
    page.getByTestId("api-credential-profiles-popup-view"),
  ).toBeVisible()

  await expect(page.getByRole("heading", { name: "Delete Me" })).toBeVisible()

  await page.getByRole("button", { name: "Delete" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("Delete profile")).toBeVisible()
  await dialog.getByRole("button", { name: "Delete" }).click()

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
