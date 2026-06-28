import type { BrowserContext } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { ModelPricing } from "~/services/modelList/pricingModel"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { verifyAccountModelCatalogUsage } from "~~/e2e/scenarios/accountUsage"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
  waitForExtensionPage,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const MODEL_LIST_BASE_URL = "https://models.example.com"

const PRICING_MODELS: ModelPricing[] = [
  {
    model_name: "gpt-4o-mini",
    model_description: "Fast everyday chat model",
    quota_type: 0,
    model_ratio: 1,
    model_price: 0,
    owner_by: "openai",
    completion_ratio: 1,
    enable_groups: ["default", "vip"],
    supported_endpoint_types: ["chat_completions"],
  },
  {
    model_name: "claude-3-5-sonnet",
    model_description: "Reasoning and writing model",
    quota_type: 0,
    model_ratio: 2,
    model_price: 0,
    owner_by: "anthropic",
    completion_ratio: 1,
    enable_groups: ["default"],
    supported_endpoint_types: ["chat_completions"],
  },
  {
    model_name: "gemini-1.5-flash",
    model_description: "Lightweight multimodal model",
    quota_type: 0,
    model_ratio: 0.5,
    model_price: 0,
    owner_by: "google",
    completion_ratio: 1,
    enable_groups: ["vip"],
    supported_endpoint_types: ["chat_completions"],
  },
]

async function seedModelListAccount(context: BrowserContext) {
  const serviceWorker = await getServiceWorker(context)

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "model-list-account",
      site_name: "Model Catalog Account",
      site_url: MODEL_LIST_BASE_URL,
      account_info: {
        id: "51",
        username: "model-user",
        access_token: "model-token",
      },
    }),
  ])

  await stubNewApiSiteRoutes(context, {
    baseUrl: MODEL_LIST_BASE_URL,
    models: PRICING_MODELS.map((model) => model.model_name),
    pricingModels: PRICING_MODELS,
    groups: {
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 1.5 },
    },
  })
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("loads account-backed models from the options route", async ({
  context,
  extensionId,
  page,
}) => {
  await seedModelListAccount(context)

  await verifyAccountModelCatalogUsage({
    page,
    extensionId,
    account: { accountId: "model-list-account" },
    expectations: {
      sourceLabel: "Model Catalog Account",
      modelNames: ["gpt-4o-mini", "claude-3-5-sonnet", "gemini-1.5-flash"],
      totalModels: 3,
    },
  })
})

test("routes no-source setup CTAs to account and API credential management", async ({
  extensionId,
  page,
}) => {
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.MODELS}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(page.getByRole("heading", { name: "Model List" })).toBeVisible()
  await expect(page.getByText("No model sources yet")).toBeVisible()
  await expect(
    page.getByText(
      "Add a site account or API credential before viewing the model list.",
    ),
  ).toBeVisible()

  await page.getByTestId(MODEL_LIST_TEST_IDS.addFirstAccountButton).click()
  await expect(page).toHaveURL(/options\.html#account$/)
  await expect(
    page.getByRole("heading", { name: "Account Management" }),
  ).toBeVisible()

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.MODELS}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await page
    .getByTestId(MODEL_LIST_TEST_IDS.addApiCredentialProfileButton)
    .click()
  await expect(page).toHaveURL(/options\.html#apiCredentialProfiles$/)
  await expect(
    page.getByRole("heading", { name: "API credential library" }),
  ).toBeVisible()
})

test("creates an API profile from the empty model list and loads models from it", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await context.route(
    "https://first-model-profile.example.com/v1/models",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "gpt-first-profile" }, { id: "gpt-first-profile-pro" }],
        }),
      }),
  )

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.MODELS}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(page.getByText("No model sources yet")).toBeVisible()
  await page
    .getByTestId(MODEL_LIST_TEST_IDS.addApiCredentialProfileButton)
    .click()
  await expect(page).toHaveURL(/options\.html#apiCredentialProfiles$/)

  await page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.addButton).click()
  const profileDialog = page.getByTestId(
    API_CREDENTIAL_PROFILES_TEST_IDS.dialog,
  )
  await expect(profileDialog).toBeVisible()
  await expect(
    profileDialog.getByRole("heading", { name: "Save API key" }),
  ).toBeVisible()

  await page.locator("#api-credential-profile-name").fill("First Model Profile")
  await page
    .locator("#api-credential-profile-baseUrl")
    .fill("https://first-model-profile.example.com/v1")
  await page.locator("#api-credential-profile-apiKey").fill("sk-first-model")
  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.dialogSaveButton)
    .click()

  await expect(
    page.getByRole("heading", { name: "First Model Profile" }),
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
          (candidate) => candidate.name === "First Model Profile",
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
      baseUrl: "https://first-model-profile.example.com",
      id: expect.any(String),
    })

  expect(profileId).toBeTruthy()

  const modelsPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.MODELS}`,
    searchParams: { profileId: profileId! },
  })

  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.openModelManagementButton)
    .click()

  const modelsPage = await modelsPagePromise
  installExtensionPageGuards(modelsPage)
  await waitForExtensionRoot(modelsPage)

  const targetUrl = new URL(modelsPage.url())
  expect(targetUrl.hash).toBe(`#${MENU_ITEM_IDS.MODELS}`)
  expect(targetUrl.searchParams.get("profileId")).toBe(profileId)

  await expect(
    modelsPage.getByRole("heading", { name: "Model List" }),
  ).toBeVisible()
  await expect(
    modelsPage.getByRole("heading", {
      name: "gpt-first-profile",
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    modelsPage.getByRole("heading", { name: "gpt-first-profile-pro" }),
  ).toBeVisible()
  await expect(
    modelsPage
      .getByText("Profile: First Model Profile", { exact: false })
      .first(),
  ).toBeVisible()
})
