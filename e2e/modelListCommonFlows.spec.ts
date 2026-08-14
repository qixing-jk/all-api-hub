import type { BrowserContext } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { OPENROUTER_WEB_ORIGIN, SITE_TYPES } from "~/constants/siteType"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import { OPENROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { ModelPricing } from "~/services/modelList/pricingModel"
import { AuthTypeEnum } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { verifyAccountModelCatalogUsage } from "~~/e2e/scenarios/accountUsage"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const MODEL_LIST_BASE_URL = "https://models.example.com"
const PRICE_COMPARISON_BASE_URL_A = "https://comparison-a.example.com"
const PRICE_COMPARISON_BASE_URL_B = "https://comparison-b.example.com"
const PRICE_COMPARISON_ACCOUNT_A_ID = "price-comparison-account-a"
const PRICE_COMPARISON_ACCOUNT_B_ID = "price-comparison-account-b"
const PRICE_COMPARISON_MODEL_ID = "comparison-model"
const OPENROUTER_ACCOUNT_A_ID = "openrouter-catalog-account-a"
const OPENROUTER_ACCOUNT_B_ID = "openrouter-catalog-account-b"
const OPENROUTER_MANAGEMENT_KEYS = [
  "sk-or-management-a-example",
  "sk-or-management-b-example",
] as const
const OPENROUTER_MODEL_ID = "example/provider-model"
const OPENROUTER_MODEL_DISPLAY_NAME = "Readable Provider Model"
const OPENROUTER_PERSONALIZED_MODEL_A_ID = "example/personalized-model-a"
const OPENROUTER_PERSONALIZED_MODEL_A_NAME = "Personalized Model A"
const OPENROUTER_PERSONALIZED_MODEL_B_ID = "example/personalized-model-b"
const OPENROUTER_PERSONALIZED_MODEL_B_NAME = "Personalized Model B"

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

async function seedPriceComparisonAccounts(context: BrowserContext) {
  const serviceWorker = await getServiceWorker(context)
  const createPricingModel = (
    modelRatio: number,
    includeCacheRead = false,
  ): ModelPricing => ({
    model_name: PRICE_COMPARISON_MODEL_ID,
    model_description: "Shared comparison model",
    quota_type: 0,
    model_ratio: modelRatio,
    model_price: 0,
    completion_ratio: 1,
    ...(includeCacheRead ? { cache_ratio: 0.5 } : {}),
    enable_groups: ["default"],
    supported_endpoint_types: ["chat_completions"],
  })

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: PRICE_COMPARISON_ACCOUNT_A_ID,
      site_name: "Comparison Account A",
      site_url: PRICE_COMPARISON_BASE_URL_A,
      account_info: {
        id: "comparison-user-a",
        username: "comparison-user-a",
        access_token: "comparison-token-a",
      },
    }),
    createStoredAccount({
      id: PRICE_COMPARISON_ACCOUNT_B_ID,
      site_name: "Comparison Account B",
      site_url: PRICE_COMPARISON_BASE_URL_B,
      account_info: {
        id: "comparison-user-b",
        username: "comparison-user-b",
        access_token: "comparison-token-b",
      },
    }),
  ])

  await stubNewApiSiteRoutes(context, {
    baseUrl: PRICE_COMPARISON_BASE_URL_A,
    models: [PRICE_COMPARISON_MODEL_ID],
    pricingModels: [createPricingModel(1, true)],
    groups: { default: { desc: "Default", ratio: 1 } },
  })
  await stubNewApiSiteRoutes(context, {
    baseUrl: PRICE_COMPARISON_BASE_URL_B,
    models: [PRICE_COMPARISON_MODEL_ID],
    pricingModels: [createPricingModel(2)],
    groups: { default: { desc: "Default", ratio: 1 } },
  })
}

async function seedMixedOpenRouterModelList(context: BrowserContext) {
  const serviceWorker = await getServiceWorker(context)
  const ordinaryModel: ModelPricing = {
    model_name: "ordinary-account-model",
    model_description: "Ordinary account model",
    quota_type: 0,
    model_ratio: 1,
    model_price: 0,
    completion_ratio: 1,
    enable_groups: ["default"],
    supported_endpoint_types: ["chat_completions"],
  }

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "ordinary-catalog-account",
      site_name: "Ordinary Catalog Account",
      site_url: MODEL_LIST_BASE_URL,
      account_info: {
        id: "ordinary-user",
        username: "ordinary-user",
        access_token: "ordinary-account-token",
      },
    }),
    createStoredAccount({
      id: OPENROUTER_ACCOUNT_A_ID,
      site_name: "Example OpenRouter A",
      site_url: OPENROUTER_WEB_ORIGIN,
      site_type: SITE_TYPES.OPENROUTER,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        id: "openrouter-user-a",
        username: "OpenRouter user A",
        access_token: OPENROUTER_MANAGEMENT_KEYS[0],
      },
    }),
    createStoredAccount({
      id: OPENROUTER_ACCOUNT_B_ID,
      site_name: "Example OpenRouter B",
      site_url: OPENROUTER_WEB_ORIGIN,
      site_type: SITE_TYPES.OPENROUTER,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        id: "openrouter-user-b",
        username: "OpenRouter user B",
        access_token: OPENROUTER_MANAGEMENT_KEYS[1],
      },
    }),
  ])

  await stubNewApiSiteRoutes(context, {
    baseUrl: MODEL_LIST_BASE_URL,
    models: [ordinaryModel.model_name],
    pricingModels: [ordinaryModel],
    groups: {
      default: { desc: "Default", ratio: 1 },
    },
  })

  const publicCatalogRequests: Array<{
    url: string
    headers: Record<string, string>
    postData: string | null
  }> = []
  const personalizedCatalogRequests: Array<{
    url: string
    authorization?: string
  }> = []
  let fallbackAccountAttempts = 0
  await context.route(`${OPENROUTER_API_BASE_URL}/models**`, async (route) => {
    const request = route.request()
    const requestUrl = new URL(request.url())
    const authorization = request.headers().authorization

    if (requestUrl.pathname.endsWith("/models/user")) {
      personalizedCatalogRequests.push({
        url: request.url(),
        ...(authorization ? { authorization } : {}),
      })

      if (authorization === `Bearer ${OPENROUTER_MANAGEMENT_KEYS[1]}`) {
        fallbackAccountAttempts += 1
        if (fallbackAccountAttempts === 1) {
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ message: "fixture permission failure" }),
          })
          return
        }
      }

      const isSecondAccount =
        authorization === `Bearer ${OPENROUTER_MANAGEMENT_KEYS[1]}`
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: isSecondAccount
                ? OPENROUTER_PERSONALIZED_MODEL_B_ID
                : OPENROUTER_PERSONALIZED_MODEL_A_ID,
              name: isSecondAccount
                ? OPENROUTER_PERSONALIZED_MODEL_B_NAME
                : OPENROUTER_PERSONALIZED_MODEL_A_NAME,
              description: "Personalized example model",
              context_length: 64_000,
              pricing: {
                prompt: "0.000001",
                completion: "0.000002",
                request: "0.005",
                image_output: "0.02",
                overrides: [
                  {
                    min_prompt_tokens: 200_000,
                    prompt: "0.000003",
                  },
                ],
              },
              architecture: {
                input_modalities: ["text", "image"],
                output_modalities: ["text"],
                tokenizer: "Example tokenizer",
              },
              supported_parameters: ["temperature", "tools"],
              reasoning: {
                default_enabled: true,
                supported_efforts: ["medium", "high"],
              },
              top_provider: {
                context_length: 48_000,
                max_completion_tokens: 4096,
                is_moderated: true,
              },
              per_request_limits: {
                prompt_tokens: 32_000,
                completion_tokens: 2048,
              },
              benchmarks: {
                design_arena: [
                  {
                    arena: "models",
                    category: "website",
                    elo: 1385.2,
                    win_rate: 62.5,
                    rank: 5,
                  },
                ],
              },
              links: {
                details: `/api/v1/models/${
                  isSecondAccount
                    ? OPENROUTER_PERSONALIZED_MODEL_B_ID
                    : OPENROUTER_PERSONALIZED_MODEL_A_ID
                }/endpoints`,
              },
            },
          ],
          total_count: 1,
          links: { next: null },
        }),
      })
      return
    }

    publicCatalogRequests.push({
      url: request.url(),
      headers: request.headers(),
      postData: request.postData(),
    })

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: OPENROUTER_MODEL_ID,
            name: OPENROUTER_MODEL_DISPLAY_NAME,
            description: "Provider-wide example model",
            context_length: 64_000,
            pricing: {
              prompt: "0.000001",
              completion: "0.000002",
              request: "0.005",
              image_output: "0.02",
              overrides: [
                {
                  min_prompt_tokens: 200_000,
                  prompt: "0.000003",
                },
              ],
            },
            architecture: {
              input_modalities: ["text", "image"],
              output_modalities: ["text"],
              tokenizer: "Example tokenizer",
            },
            supported_parameters: ["temperature", "tools"],
            reasoning: {
              default_enabled: true,
              supported_efforts: ["medium", "high"],
            },
            top_provider: {
              context_length: 48_000,
              max_completion_tokens: 4096,
              is_moderated: true,
            },
            per_request_limits: {
              prompt_tokens: 32_000,
              completion_tokens: 2048,
            },
            benchmarks: {
              design_arena: [
                {
                  arena: "models",
                  category: "website",
                  elo: 1385.2,
                  win_rate: 62.5,
                  rank: 5,
                },
              ],
            },
            links: {
              details: `/api/v1/models/${OPENROUTER_MODEL_ID}/endpoints`,
            },
          },
        ],
        total_count: 1,
        links: { next: null },
      }),
    })
  })

  return { personalizedCatalogRequests, publicCatalogRequests }
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page, {
    ignoreConsoleErrorPatterns: [/Failed to load resource: .*status of 403/u],
  })
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

test("groups same-model offers when comparing prices at narrow options width", async ({
  context,
  extensionId,
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 900 })
  await seedPriceComparisonAccounts(context)

  await verifyAccountModelCatalogUsage({
    page,
    extensionId,
    account: { accountId: PRICE_COMPARISON_ACCOUNT_A_ID },
    expectations: {
      sourceLabel: "Comparison Account A",
      modelNames: [PRICE_COMPARISON_MODEL_ID],
      totalModels: 1,
    },
  })

  await page.setViewportSize({ width: 720, height: 900 })
  await expect(page.getByRole("button", { name: "Refresh Data" })).toBeVisible()
  await page
    .getByTestId(MODEL_LIST_TEST_IDS.headerPriceComparisonButton)
    .click()
  await expect(page).toHaveURL((url) => {
    return (
      url.hash === `#${MENU_ITEM_IDS.MODELS}` &&
      url.searchParams.get("accountId") === "all"
    )
  })

  const comparisonGroup = page.getByRole("region", {
    name: `${PRICE_COMPARISON_MODEL_ID} Token-based billing`,
  })
  await expect(comparisonGroup).toBeVisible()
  await expect(comparisonGroup).toContainText("Comparable offers: 2")
  await expect(comparisonGroup).toContainText("Comparison Account A")
  await expect(comparisonGroup).toContainText("Comparison Account B")

  await expect(comparisonGroup).toBeVisible()
  expect(
    await comparisonGroup.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true)

  await page.getByRole("combobox", { name: "Use case" }).click()
  await page.getByRole("option", { name: "Coding agent" }).click()
  await expect(comparisonGroup).toContainText("Comparable offers: 1")
  await expect(comparisonGroup).toContainText(
    "Not compared under current conditions: 1",
  )
  await expect(comparisonGroup.getByRole("note")).toContainText(
    "The current conditions use a price item the source does not provide",
  )
  await expect(comparisonGroup).toContainText("Comparison Account A")
  await expect(comparisonGroup).toContainText("Comparison Account B")
  await comparisonGroup.scrollIntoViewIfNeeded()
  await expect(comparisonGroup).toBeVisible()
  expect(
    await comparisonGroup.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true)
})

test("loads personalized OpenRouter catalogs with visible provider fallback and retry", async ({
  context,
  extensionId,
  page,
}) => {
  const { personalizedCatalogRequests, publicCatalogRequests } =
    await seedMixedOpenRouterModelList(context)

  await verifyAccountModelCatalogUsage({
    page,
    extensionId,
    account: { accountId: OPENROUTER_ACCOUNT_A_ID },
    expectations: {
      sourceLabel: "Example OpenRouter A",
      totalModels: 1,
    },
  })

  await expect(
    page.getByRole("heading", {
      name: OPENROUTER_PERSONALIZED_MODEL_A_NAME,
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByText(OPENROUTER_PERSONALIZED_MODEL_A_ID, { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("Example OpenRouter A · Personalized Model Catalog", {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByTestId(MODEL_LIST_TEST_IDS.modelKeyDialogButton),
  ).toHaveCount(0)
  await expect(
    page.getByTestId(MODEL_LIST_TEST_IDS.verifyApiButton),
  ).toHaveCount(0)
  await expect(
    page.getByTestId(MODEL_LIST_TEST_IDS.verifyCliSupportButton),
  ).toHaveCount(0)
  await expect(
    page.getByTestId(MODEL_LIST_TEST_IDS.batchVerifyButton),
  ).toHaveCount(0)

  await page.getByTestId(MODEL_LIST_TEST_IDS.modelExpandButton).click()
  await expect(
    page.getByRole("heading", { name: "Pricing", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("Conditional prices", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("More than 200,000 prompt tokens", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Routing provider" }),
  ).toBeVisible()
  await expect(
    page.getByText("Content moderation", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByLabel("Routing provider").getByText("Yes", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Benchmarks", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Open provider details" }),
  ).toHaveAttribute(
    "href",
    `${OPENROUTER_WEB_ORIGIN}/api/v1/models/${OPENROUTER_PERSONALIZED_MODEL_A_ID}/endpoints`,
  )

  await expect.poll(() => personalizedCatalogRequests.length).toBe(1)
  expect(personalizedCatalogRequests[0]).toEqual({
    url: `${OPENROUTER_API_BASE_URL}/models/user`,
    authorization: `Bearer ${OPENROUTER_MANAGEMENT_KEYS[0]}`,
  })
  expect(publicCatalogRequests).toHaveLength(0)

  await page.getByTestId(MODEL_LIST_TEST_IDS.sourceSelector).click()
  await page.getByRole("option", { name: "All accounts", exact: true }).click()
  await expect(page).toHaveURL((url) => {
    return (
      url.hash === `#${MENU_ITEM_IDS.MODELS}` &&
      url.searchParams.get("accountId") === "all"
    )
  })

  await expect(
    page.getByRole("heading", { name: "ordinary-account-model", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", {
      name: OPENROUTER_PERSONALIZED_MODEL_A_NAME,
      exact: true,
    }),
  ).toHaveCount(1)
  await expect(
    page.getByText("OpenRouter · Provider Model Catalog", { exact: true }),
  ).toHaveCount(1)
  await expect(page.getByText("Using the provider-wide catalog")).toBeVisible()
  await expect(page.getByText(/^Total 3 models$/)).toBeVisible()
  await expect(page.getByText(/^Showing 3 models$/)).toBeVisible()
  expect(publicCatalogRequests).toHaveLength(1)

  const publicRequest = publicCatalogRequests[0]!
  expect(new URL(publicRequest.url).searchParams.get("output_modalities")).toBe(
    "all",
  )
  expect(publicRequest.headers.authorization).toBeUndefined()
  expect(publicRequest.postData).toBeNull()
  for (const managementKey of OPENROUTER_MANAGEMENT_KEYS) {
    expect(JSON.stringify(publicRequest)).not.toContain(managementKey)
  }

  await page
    .getByTestId(MODEL_LIST_TEST_IDS.retryPersonalizedCatalogButton)
    .click()
  await expect(
    page.getByRole("heading", {
      name: OPENROUTER_PERSONALIZED_MODEL_B_NAME,
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.getByText("Using the provider-wide catalog")).toHaveCount(0)
  await expect(
    page.getByRole("heading", {
      name: OPENROUTER_PERSONALIZED_MODEL_A_NAME,
      exact: true,
    }),
  ).toHaveCount(1)
  await expect(
    page.getByRole("heading", {
      name: OPENROUTER_MODEL_DISPLAY_NAME,
      exact: true,
    }),
  ).toHaveCount(0)
  await expect(page.getByText(/^Total 3 models$/)).toBeVisible()
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

  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.openModelManagementButton)
    .click()

  await expect(page).toHaveURL((url) => {
    return (
      url.hash === `#${MENU_ITEM_IDS.MODELS}` &&
      url.searchParams.get("profileId") === profileId
    )
  })
  await waitForExtensionRoot(page)

  await expect(page.getByRole("heading", { name: "Model List" })).toBeVisible()
  await expect(
    page.getByRole("heading", {
      name: "gpt-first-profile",
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "gpt-first-profile-pro" }),
  ).toBeVisible()
  await expect(
    page.getByText("Profile: First Model Profile", { exact: false }).first(),
  ).toBeVisible()
})
