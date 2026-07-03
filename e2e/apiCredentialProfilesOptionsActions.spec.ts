import type { Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { verifyApiCredentialProfileCcSwitchModelPickerScenario } from "~~/e2e/scenarios/apiCredentialProfileVerification"
import {
  createStoredApiCredentialProfile,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedApiCredentialProfiles,
  stubLlmMetadataIndex,
  waitForExtensionPage,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const CLIPBOARD_WRITES_KEY = "__aah_e2e_profile_clipboard_writes__"

async function installClipboardRecorder(page: Page) {
  await page.addInitScript((storageKey) => {
    window.sessionStorage.setItem(storageKey, JSON.stringify([]))

    const readWrites = (): string[] => {
      try {
        const raw = window.sessionStorage.getItem(storageKey)
        return raw ? (JSON.parse(raw) as string[]) : []
      } catch {
        return []
      }
    }

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          window.sessionStorage.setItem(
            storageKey,
            JSON.stringify([...readWrites(), text]),
          )
        },
      },
    })
  }, CLIPBOARD_WRITES_KEY)
}

async function readClipboardWrites(page: Page): Promise<string[]> {
  return await page.evaluate((storageKey) => {
    try {
      const raw = window.sessionStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  }, CLIPBOARD_WRITES_KEY)
}

async function openProfilesPage(page: Page, extensionId: string) {
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await installClipboardRecorder(page)
  await stubLlmMetadataIndex(context)
})

test("creates an API credential profile from the options page and persists it", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)

  await openProfilesPage(page, extensionId)

  await page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.addButton).click()
  const profileDialog = page.getByTestId(
    API_CREDENTIAL_PROFILES_TEST_IDS.dialog,
  )
  await expect(profileDialog).toBeVisible()
  await expect(
    profileDialog.getByRole("heading", { name: "Save API key" }),
  ).toBeVisible()

  await page.locator("#api-credential-profile-name").fill("Options Profile")
  await page
    .locator("#api-credential-profile-baseUrl")
    .fill("https://options-api.example.com/v1")
  await page.locator("#api-credential-profile-apiKey").fill("sk-options-page")
  await page
    .locator("#api-credential-profile-notes")
    .fill("Created from options E2E")
  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.dialogSaveButton)
    .click()

  await expect(
    page.getByRole("heading", { name: "Options Profile" }),
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
          profiles?: Array<{
            name?: string
            baseUrl?: string
            apiKey?: string
            notes?: string
          }>
        }
        return (
          parsed.profiles?.find(
            (profile) => profile.name === "Options Profile",
          ) ?? null
        )
      } catch {
        return null
      }
    })
    .toMatchObject({
      name: "Options Profile",
      baseUrl: "https://options-api.example.com",
      apiKey: "sk-options-page",
      notes: "Created from options E2E",
    })
})

test("filters options-page profiles and copies reusable credentials", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "profile-primary",
      name: "Reusable Profile",
      baseUrl: "https://reusable.example.com",
      apiKey: "sk-reusable-profile",
      notes: "daily driver",
    }),
    createStoredApiCredentialProfile({
      id: "profile-secondary",
      name: "Archive Profile",
      baseUrl: "https://archive.example.com",
      apiKey: "sk-archive-profile",
      notes: "rarely used",
    }),
  ])

  await openProfilesPage(page, extensionId)

  const searchInput = page.getByPlaceholder(
    "Search by name, base URL, tag, or notes",
  )
  await searchInput.fill("daily driver")

  await expect(
    page.getByRole("heading", { name: "Reusable Profile" }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Archive Profile" }),
  ).toHaveCount(0)

  await page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.showKeyButton).click()
  await expect(page.getByText("sk-reusable-profile")).toBeVisible()

  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.copyBaseUrlButton)
    .click()
  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.copyApiKeyButton)
    .click()
  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.copyBundleButton)
    .click()

  await expect
    .poll(() => readClipboardWrites(page))
    .toEqual([
      "https://reusable.example.com",
      "sk-reusable-profile",
      "BASE_URL=https://reusable.example.com\nAPI_KEY=sk-reusable-profile",
    ])
})

test("opens model management for an options-page API credential profile", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "profile-models",
      name: "Model Source Profile",
      baseUrl: "https://api.example.com",
      apiKey: "sk-model-source",
    }),
  ])

  await context.route("https://api.example.com/v1/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "ok",
        data: [{ id: "gpt-options-model" }],
      }),
    }),
  )

  await openProfilesPage(page, extensionId)

  const targetPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.MODELS}`,
    searchParams: {
      profileId: "profile-models",
    },
  })

  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.openModelManagementButton)
    .click()

  const targetPage = await targetPagePromise
  installExtensionPageGuards(targetPage)
  await waitForExtensionRoot(targetPage)

  const targetUrl = new URL(targetPage.url())
  expect(targetUrl.hash).toBe(`#${MENU_ITEM_IDS.MODELS}`)
  expect(targetUrl.searchParams.get("profileId")).toBe("profile-models")
  await expect(targetPage.getByText("gpt-options-model")).toBeVisible()
})

test("opens the CC Switch model picker for an API credential profile", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "profile-cc-switch",
      name: "CC Switch Profile",
      baseUrl: "https://cc-switch-profile.example.com",
      apiKey: "sk-cc-switch-profile",
    }),
  ])

  await context.route(
    "https://cc-switch-profile.example.com/v1/models",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "gpt-cc-switch-profile" }],
        }),
      }),
  )

  await openProfilesPage(page, extensionId)

  await verifyApiCredentialProfileCcSwitchModelPickerScenario({
    page,
    profileName: "CC Switch Profile",
    modelName: "gpt-cc-switch-profile",
    expectedBaseUrl: "https://cc-switch-profile.example.com",
    expectedApiKey: "sk-cc-switch-profile",
  })
})
