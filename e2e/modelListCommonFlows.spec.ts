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
import { captureVisualViews } from "~~/e2e/utils/visualCapture"
import mediaPricingRows from "~~/tests/fixtures/newApi/mediaPricing.json" with { type: "json" }
import { atIndex } from "~~/tests/test-utils/indexedAccess"

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

test("renders Chinese per-call prices with a distinct call unit", async ({
  context,
  extensionId,
  extensionDir,
  page,
}) => {
  await seedModelListAccount(context, [
    {
      ...atIndex(PRICING_MODELS, 0),
      model_name: "per-call-copy",
      quota_type: 1,
      model_price: 2,
      enable_groups: ["default"],
    },
  ])
  await verifyAccountModelCatalogUsage({
    page,
    extensionId,
    account: { accountId: "model-list-account" },
    expectations: { sourceLabel: "Model Catalog Account", totalModels: 1 },
  })
  const currencyToggle = page.getByRole("switch", {
    name: "Real Recharge Amount",
  })
  if (await currencyToggle.isChecked()) await currencyToggle.click()
  await forceExtensionLanguage(page, "zh-CN")
  await page.reload()
  await waitForExtensionRoot(page)
  await expect(page.getByText("$2.00 / 次", { exact: true })).toBeVisible()
  await expect(
    page.getByText("$2.00 / 次", { exact: true }).locator(".."),
  ).toContainText("按次计费")
  await expect(page.getByText(/每次调用:/)).toHaveCount(0)
  await captureVisualViews({
    page,
    extensionDir,
    ready: page.getByText("$2.00 / 次", { exact: true }),
    id: "per-call-price-copy",
  })
})

async function seedModelListAccount(
  context: BrowserContext,
  pricingModels: ModelPricing[] = PRICING_MODELS,
) {
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
    models: pricingModels.map((model) => model.model_name),
    pricingModels,
    groups: {
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 1.5 },
    },
  })
}

async function seedPriceComparisonAccounts(
  context: BrowserContext,
  multipleGroups = false,
  includeDefaultOnlyModel = false,
) {
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
    enable_groups: multipleGroups ? ["default", "vip"] : ["default"],
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
    models: [
      PRICE_COMPARISON_MODEL_ID,
      ...(includeDefaultOnlyModel ? ["default-only-model"] : []),
    ],
    pricingModels: [
      createPricingModel(1, true),
      ...(includeDefaultOnlyModel
        ? [
            {
              ...createPricingModel(1),
              model_name: "default-only-model",
              enable_groups: ["default"],
            },
          ]
        : []),
    ],
    groups: {
      default: { desc: "Default", ratio: 1 },
      ...(multipleGroups ? { vip: { desc: "VIP", ratio: 3 } } : {}),
    },
  })
  await stubNewApiSiteRoutes(context, {
    baseUrl: PRICE_COMPARISON_BASE_URL_B,
    models: [
      PRICE_COMPARISON_MODEL_ID,
      ...(includeDefaultOnlyModel ? ["default-only-model"] : []),
    ],
    pricingModels: [
      createPricingModel(2),
      ...(includeDefaultOnlyModel
        ? [
            {
              ...createPricingModel(1),
              model_name: "default-only-model",
              enable_groups: ["default"],
            },
          ]
        : []),
    ],
    groups: {
      default: { desc: "Default", ratio: 1 },
      ...(multipleGroups ? { vip: { desc: "VIP", ratio: 3 } } : {}),
    },
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
  await page
    .getByTestId(MODEL_LIST_TEST_IDS.headerPriceComparisonButton)
    .click()
  await page
    .getByRole("button", { name: "View calculation", exact: true })
    .first()
    .click()
  const sourceLink = page
    .getByRole("link", { name: "View pricing source", exact: true })
    .first()
  await expect(sourceLink).toBeVisible()
  await expect(sourceLink).toHaveAttribute("target", "_blank")
  const destination = new URL((await sourceLink.getAttribute("href"))!)
  expect(destination.origin).toBe(new URL(MODEL_LIST_BASE_URL).origin)
  expect(destination.pathname).toBe("/pricing")
  expect(["gpt-4o-mini", "claude-3-5-sonnet", "gemini-1.5-flash"]).toContain(
    destination.searchParams.get("search"),
  )
})

test("explains unavailable legacy pricing in expanded comparison details", async ({
  context,
  extensionId,
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await seedModelListAccount(context, [
    {
      ...PRICING_MODELS[0]!,
      model_name: "invalid-price-model",
      token_price_usd_per_million: {},
      price_metadata: {
        source: "none",
        precision: "unavailable",
        unavailable_reason: "official-price-missing",
      },
    },
  ])
  await verifyAccountModelCatalogUsage({
    page,
    extensionId,
    account: { accountId: "model-list-account" },
    expectations: {
      sourceLabel: "Model Catalog Account",
      modelNames: ["invalid-price-model"],
      totalModels: 1,
    },
  })
  await page
    .getByTestId(MODEL_LIST_TEST_IDS.headerPriceComparisonButton)
    .click()
  await page.getByTestId(MODEL_LIST_TEST_IDS.modelExpandButton).click()
  const display = page.getByTestId(MODEL_LIST_TEST_IDS.modelDisplay)
  await expect(
    display.getByText("Detailed Pricing", { exact: true }),
  ).toBeVisible()
  await expect(
    display
      .getByText("No price found for this model.", {
        exact: true,
      })
      .and(display.locator("div")),
  ).toBeVisible()
  await display.screenshot({
    path: testInfo.outputPath("unavailable-comparison-details.png"),
    animations: "disabled",
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
    "The offers below are excluded from comparison; see each offer for the reason.",
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

test("keeps mixed pricing settings compact and opens the missing condition group", async ({
  context,
  extensionId,
  page,
}, testInfo) => {
  const pricingModels = [
    {
      ...atIndex(PRICING_MODELS, 0),
      model_name: "tiered-chat",
      enable_groups: ["default"],
      billing_mode: "tiered_expr",
      billing_expr:
        'len <= 100000 ? tier("short", p * 1 + c * 2) : tier("long", p * 3 + c * 4)',
    },
    {
      ...atIndex(PRICING_MODELS, 0),
      model_name: "timed-chat",
      enable_groups: ["default"],
      billing_mode: "tiered_expr",
      billing_expr:
        'hour("Asia/Shanghai") < 12 ? tier("morning", p * 1 + c * 2) : tier("afternoon", p * 2 + c * 3)',
    },
    ...mediaPricingRows
      .filter((row) => ["gpt-image-2", "wan2.7-t2v"].includes(row.model_name))
      .map((row) => ({
        ...atIndex(PRICING_MODELS, 0),
        ...row,
        enable_groups: ["default"],
      })),
  ]
  await seedModelListAccount(context, pricingModels)
  await verifyAccountModelCatalogUsage({
    page,
    extensionId,
    account: { accountId: "model-list-account" },
    expectations: {
      sourceLabel: "Model Catalog Account",
      totalModels: pricingModels.length,
    },
  })
  await page
    .getByTestId(MODEL_LIST_TEST_IDS.headerPriceComparisonButton)
    .click()
  const controls = page.getByRole("region", {
    name: "Set conditions",
    exact: true,
  })
  await expect(controls).toBeVisible()
  await expect(page.getByText(/Complete quotes:/)).toHaveCount(0)
  await expect(controls.getByText(/^Compare prices at:/)).toBeVisible()
  await controls.getByText("Adjust comparison", { exact: true }).click()
  await expect(page.getByText("Model data loaded successfully")).toBeHidden()
  for (const width of [1440, 720, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(
      controls.getByText("Tiered pricing conditions", { exact: true }),
    ).toBeVisible()
    await expect(
      controls.getByText("Image settings", { exact: true }),
    ).toBeVisible()
    await expect(
      controls.getByText("Video settings", { exact: true }),
    ).toBeVisible()
    await expect(
      controls.getByText("Other billing conditions", { exact: true }),
    ).toBeVisible()
    expect(
      await controls.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true)
    const bounds = await controls.boundingBox()
    // On narrow screens, keep the expanded controls within one viewport;
    // font metrics and wrapped copy vary between local and CI platforms.
    expect(bounds!.height).toBeLessThan(
      width >= 1000 ? 600 : page.viewportSize()!.height,
    )
    await controls.screenshot({
      path: testInfo.outputPath(`pricing-groups-${width}.png`),
    })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(controls.getByLabel("Image size", { exact: true })).toBeHidden()
  await expect(
    controls.getByLabel("Video quality", { exact: true }),
  ).toBeHidden()
  const url = page.url()
  await page
    .getByRole("button", { name: "Set conditions · Image size", exact: true })
    .first()
    .click()
  const size = controls.getByRole("combobox", {
    name: "Image size",
    exact: true,
  })
  await expect(size).toBeFocused()
  await expect(size).toBeVisible()
  await expect(
    controls.getByLabel("Video quality", { exact: true }),
  ).toBeHidden()
  await expect(page).toHaveURL(url)
  await size.click()
  await page.getByRole("option", { name: "2K", exact: true }).click()
  await expect(size).toContainText("2K")
  await controls.getByText("Image settings", { exact: true }).click()
  await expect(size).toBeHidden()
  await controls.getByText("Image settings", { exact: true }).press("Enter")
  await expect(size).toContainText("2K")
  await controls.screenshot({
    path: testInfo.outputPath("pricing-image-expanded.png"),
  })
})

test("loads personalized OpenRouter catalogs with visible provider fallback and retry", async ({
  context,
  extensionId,
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 480 })
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
    page
      .getByTestId(MODEL_LIST_TEST_IDS.modelDisplay)
      .locator("span")
      .getByText("Example OpenRouter A · Personalized Model Catalog", {
        exact: true,
      }),
  ).toBeVisible()
  await expect(
    page.getByTestId(MODEL_LIST_TEST_IDS.modelKeyDialogButton),
  ).toBeVisible()
  await expect(
    page.getByTestId(MODEL_LIST_TEST_IDS.verifyApiButton),
  ).toBeVisible()
  await expect(
    page.getByTestId(MODEL_LIST_TEST_IDS.verifyCliSupportButton),
  ).toBeVisible()
  await expect(
    page.getByTestId(MODEL_LIST_TEST_IDS.batchVerifyButton),
  ).toBeVisible()

  await page.getByTestId(MODEL_LIST_TEST_IDS.modelExpandButton).click()
  await expect(
    page.getByRole("heading", { name: "Pricing", exact: true }),
  ).toBeVisible()
  const inputTier = page.getByRole("group", {
    name: "Reference input length (tokens, including cache) · Context: 200001–∞ tokens",
    exact: true,
  })
  await expect(inputTier).toBeVisible()
  await expect(
    inputTier.getByText("USD: $3.0000", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "View pricing source", exact: true }),
  ).toHaveAttribute(
    "href",
    `${OPENROUTER_WEB_ORIGIN}/${OPENROUTER_PERSONALIZED_MODEL_A_ID}`,
  )
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
  // Source rows are virtualized; the provider catalog can be below the rendered
  // range while the previously expanded personalized model remains above it.
  const modelScroller = page
    .getByTestId(MODEL_LIST_TEST_IDS.modelDisplay)
    .locator("[data-virtuoso-scroller]")
  await expect(async () => {
    // The virtual list's total height can change as source rows are measured.
    await modelScroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(
      page
        .getByTestId(MODEL_LIST_TEST_IDS.modelDisplay)
        .locator("span")
        .getByText("OpenRouter · Provider Model Catalog", { exact: true }),
    ).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 10_000 })
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
  await modelScroller.evaluate((element) => {
    element.scrollTop = 0
  })
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
    profileDialog.getByRole("heading", { name: "Save API credential" }),
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
    page.getByText("Credential: First Model Profile", { exact: false }).first(),
  ).toBeVisible()
})

test("switches account groups and expands independent group offers", async ({
  context,
  extensionDir,
  extensionId,
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1100, height: 900 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await seedPriceComparisonAccounts(context, true)
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
  await page
    .getByTestId(MODEL_LIST_TEST_IDS.headerPriceComparisonButton)
    .click()
  await page
    .getByText("Model data loaded successfully", { exact: true })
    .waitFor({ state: "hidden" })
  const group = page.getByRole("region", {
    name: `${PRICE_COMPARISON_MODEL_ID} Token-based billing`,
  })
  await expect(group).toContainText("Comparable offers: 2")
  await group.screenshot({
    path: testInfo.outputPath("account-group-dropdown.png"),
    animations: "disabled",
  })
  await captureVisualViews({
    page,
    extensionDir,
    ready: page.getByTestId(MODEL_LIST_TEST_IDS.controlPanel),
    id: "group-quote-controls-compact",
  })
  await expect(
    group.getByRole("combobox", { name: "Model group" }).first(),
  ).toHaveText("All groups (2)")
  await group.getByRole("combobox", { name: "Model group" }).first().click()
  await group.screenshot({
    path: testInfo.outputPath("account-group-menu.png"),
    animations: "disabled",
  })
  await page.getByRole("option", { name: "vip (3x)" }).click()
  // Account B's default offer becomes cheaper than A's VIP offer.
  await expect(group.locator("li").first()).toContainText(
    "Comparison Account B",
  )
  await expect(group.locator("li").last()).toContainText("Comparison Account A")
  const accountA = group
    .locator("li")
    .filter({ hasText: "Comparison Account A" })
  const highlight = accountA.locator("[data-group-change-highlight]")
  await expect(highlight).toBeVisible()
  await expect(group.locator("[data-group-change-highlight]")).toHaveCount(1)
  await group.screenshot({
    path: testInfo.outputPath("moved-account-highlight.png"),
    animations: "disabled",
  })
  await expect(highlight).toHaveCount(0)
  await accountA.getByRole("combobox", { name: "Model group" }).click()
  await page
    .getByRole("option", { name: "All groups (2)", exact: true })
    .click()
  await expect(group.locator("li").first()).toContainText(
    "Comparison Account A",
  )
  await expect(accountA.locator("[data-group-change-highlight]")).toBeVisible()
  const displayOptions = page.getByRole("group", {
    name: "Display",
    exact: true,
  })
  await expect(displayOptions.getByRole("switch")).toHaveCount(4)
  for (const [name, hint] of [
    ["Expand account groups", "List each eligible group separately."],
    [
      "Real Recharge Amount",
      "Convert prices using each account’s configured conversion rate.",
    ],
    ["Endpoint Types", "Show the API endpoint types supported by each model."],
    ["Also show models without account access", ""],
  ]) {
    const toggle = displayOptions.getByRole("switch", { name, exact: true })
    await toggle.hover()
    const tooltip = page.getByRole("tooltip")
    await expect(tooltip).toBeVisible()
    if (hint) await expect(tooltip).toContainText(hint)
  }
  await page
    .getByTestId(MODEL_LIST_TEST_IDS.controlPanel)
    .getByText("Search Models", { exact: true })
    .hover()
  await page.getByRole("switch", { name: "Expand account groups" }).click()
  await expect(group).toContainText("Comparable offers: 4")
  await expect(group.locator("li")).toHaveCount(4)
  await expect(
    group.getByRole("combobox", { name: "Model group" }),
  ).toHaveCount(0)
  await expect(group.locator("li").nth(2)).toContainText("Comparison Account A")
  await expect(group.locator("li").nth(2)).toContainText("vip (3x)")
  await group.screenshot({
    path: testInfo.outputPath("expanded-account-groups.png"),
    animations: "disabled",
  })
  await captureVisualViews({
    page,
    extensionDir,
    ready: page.getByTestId(MODEL_LIST_TEST_IDS.controlPanel),
    id: "group-quote-controls-expanded",
  })
  await page.setViewportSize({ width: 720, height: 900 })
  await expect(group).toBeVisible()
  expect(
    await group.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true)
  await group.screenshot({
    path: testInfo.outputPath("expanded-account-groups-narrow.png"),
    animations: "disabled",
  })
  await page.getByRole("switch", { name: "Expand account groups" }).click()
  await expect(group).toContainText("Comparable offers: 2")
  await group.screenshot({
    path: testInfo.outputPath("account-group-dropdown-narrow.png"),
    animations: "disabled",
  })
})

test("shows the only eligible model group as a static badge", async ({
  context,
  extensionId,
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 720, height: 900 })
  await page.emulateMedia({ reducedMotion: "reduce" })
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
  await page
    .getByTestId(MODEL_LIST_TEST_IDS.headerPriceComparisonButton)
    .click()
  const group = page.getByRole("region", {
    name: `${PRICE_COMPARISON_MODEL_ID} Token-based billing`,
  })
  await expect(
    group.getByRole("combobox", { name: "Model group" }),
  ).toHaveCount(0)
  const badge = group.getByText("default (1x)", { exact: true }).first()
  await expect(badge).toBeVisible()
  await expect(badge.locator("..")).toHaveAttribute("title", "1 selected / 1")
  await page
    .getByText("Model data loaded successfully", { exact: true })
    .waitFor({ state: "hidden" })
  await group.screenshot({
    path: testInfo.outputPath("single-model-group.png"),
    animations: "disabled",
  })
})

test("keeps a reordered account offer visible in a short comparison viewport", async ({
  context,
  extensionId,
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 560 })
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await seedPriceComparisonAccounts(context, true)
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
  await page
    .getByTestId(MODEL_LIST_TEST_IDS.headerPriceComparisonButton)
    .click()
  const group = page.getByRole("region", {
    name: `${PRICE_COMPARISON_MODEL_ID} Token-based billing`,
  })
  await group.getByRole("combobox", { name: "Model group" }).first().click()
  await page.getByRole("option", { name: "vip (3x)", exact: true }).click()
  const moved = group
    .locator("li")
    .filter({ hasText: "Comparison Account A" })
    .getByRole("combobox", { name: "Model group" })
  await expect(group.locator("[data-group-change-highlight]")).toContainText(
    "Comparison Account A",
  )
  await expect
    .poll(() =>
      moved.evaluate((element) => {
        const scroller = element.closest('[data-virtuoso-scroller="true"]')
        if (!scroller) return false
        const row = element.getBoundingClientRect()
        const viewport = scroller.getBoundingClientRect()
        return row.top >= viewport.top - 1 && row.bottom <= viewport.bottom + 1
      }),
    )
    .toBe(true)
})

test("model group selection preserves other models and account group filters", async ({
  context,
  extensionId,
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1100, height: 900 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await seedPriceComparisonAccounts(context, true, true)
  await verifyAccountModelCatalogUsage({
    page,
    extensionId,
    account: { accountId: PRICE_COMPARISON_ACCOUNT_A_ID },
    expectations: {
      sourceLabel: "Comparison Account A",
      modelNames: [PRICE_COMPARISON_MODEL_ID, "default-only-model"],
      totalModels: 2,
    },
  })
  await page
    .getByTestId(MODEL_LIST_TEST_IDS.headerPriceComparisonButton)
    .click()
  const compared = page.getByRole("region", {
    name: `${PRICE_COMPARISON_MODEL_ID} Token-based billing`,
  })
  const defaultOnly = page.getByRole("region", {
    name: "default-only-model Token-based billing",
  })
  await compared.getByRole("combobox", { name: "Model group" }).first().click()
  await page.getByRole("option", { name: "vip (3x)", exact: true }).click()
  await expect(compared.locator("li").last()).toContainText(
    "Comparison Account A",
  )
  await expect(
    compared
      .locator("li")
      .last()
      .getByRole("combobox", { name: "Model group" }),
  ).toHaveText("vip (3x)")
  await expect(defaultOnly).toContainText("Comparable offers: 2")
  await expect(defaultOnly).toContainText("Comparison Account A")
  await expect(
    defaultOnly.getByRole("combobox", { name: "Model group" }),
  ).toHaveCount(0)
  await expect(
    defaultOnly.getByText("default (1x)", { exact: true }).first(),
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Filter Account Groups", exact: true })
    .click()
  const accountSection = page
    .locator("section")
    .filter({ has: page.getByText("Comparison Account A", { exact: true }) })
  await expect(accountSection).toContainText("2 selected / 2")
  await page.keyboard.press("Escape")
  await compared
    .locator("li")
    .last()
    .getByRole("combobox", { name: "Model group" })
    .click()
  await page
    .getByRole("option", { name: "All groups (2)", exact: true })
    .click()
  await expect(compared.locator("li").first()).toContainText(
    "Comparison Account A",
  )
  await expect(defaultOnly).toContainText("Comparable offers: 2")
  await defaultOnly.scrollIntoViewIfNeeded()
  await defaultOnly.screenshot({
    path: testInfo.outputPath("other-models-preserved.png"),
    animations: "disabled",
  })
})

for (const grouped of [true, false]) {
  test(`tracks the same offer across a long variable-height list (grouped: ${grouped})`, async ({
    context,
    extensionId,
    page,
  }) => {
    // On Chrome 114 CI, catalog setup alone can exceed two minutes.
    // Preserve fixture startup compensation and unlimited debugging runs.
    const currentTimeout = test.info().timeout
    if (currentTimeout > 0) {
      test.setTimeout(currentTimeout + 120_000)
    }
    await page.setViewportSize({ width: 1100, height: 560 })
    await page.emulateMedia({ reducedMotion: "no-preference" })
    const accounts = Array.from({ length: 80 }, (_, index) =>
      createStoredAccount({
        id: `long-account-${index}`,
        site_name: `Long Account ${String(index).padStart(2, "0")}`,
        site_url: `https://long-comparison-${index}.example.com`,
        account_info: {
          id: `${index}`,
          username: `long-user-${index}`,
          access_token: `long-token-${index}`,
        },
      }),
    )
    await seedStoredAccounts(await getServiceWorker(context), accounts)
    for (const [index, account] of accounts.entries()) {
      await stubNewApiSiteRoutes(context, {
        baseUrl: account.site_url,
        models: [PRICE_COMPARISON_MODEL_ID],
        pricingModels: [
          {
            model_name: PRICE_COMPARISON_MODEL_ID,
            model_description: "Variable height description. ".repeat(
              1 + (index % 4) * 20,
            ),
            quota_type: 0,
            model_ratio: index + 1,
            completion_ratio: 1,
            model_price: 0,
            enable_groups: ["default", "vip"],
            supported_endpoint_types: ["chat_completions"],
          },
        ],
        groups: {
          default: { desc: "Default", ratio: 1 },
          vip: { desc: "VIP", ratio: 100 },
        },
      })
    }
    await verifyAccountModelCatalogUsage({
      page,
      extensionId,
      account: { accountId: "long-account-0" },
      expectations: {
        sourceLabel: "Long Account 00",
        modelNames: [PRICE_COMPARISON_MODEL_ID],
        totalModels: 1,
      },
    })
    await page
      .getByTestId(MODEL_LIST_TEST_IDS.headerPriceComparisonButton)
      .click()
    // All-account loading outlives the first rendered offer on slower runners.
    // A trial action waits for the loading button to become usable without refreshing.
    await page
      .getByRole("button", { name: "Refresh Data", exact: true })
      .click({ trial: true })
    await expect(
      page.getByRole("region", {
        name: `${PRICE_COMPARISON_MODEL_ID} Token-based billing`,
      }),
    ).toContainText("Comparable offers: 80")
    if (!grouped) {
      await page
        .getByRole("combobox")
        .filter({ hasText: "Cheapest First Per Model" })
        .click()
      await page
        .getByRole("option", { name: "Price: Low to High", exact: true })
        .click()
    }
    const target = page
      .locator("[data-model-row-key]")
      .filter({ hasText: "Long Account 00" })
    const targetSelect = target.getByRole("combobox", { name: "Model group" })
    const expectTargetSettledInView = async () => {
      let settledSamples = 0
      await expect
        .poll(
          async () => {
            const visible = await targetSelect
              .evaluate((element) => {
                const scroller = element.closest(
                  '[data-virtuoso-scroller="true"]',
                )
                if (!scroller) return false
                const row = element.getBoundingClientRect()
                const viewport = scroller.getBoundingClientRect()
                return (
                  row.top >= viewport.top - 1 &&
                  row.bottom <= viewport.bottom + 1
                )
              })
              .catch(() => false)
            settledSamples = visible ? settledSamples + 1 : 0
            return settledSamples
          },
          { intervals: [100], timeout: 8000 },
        )
        .toBeGreaterThanOrEqual(5)
    }
    await expect
      .poll(() =>
        targetSelect.evaluate(
          (element) =>
            element.closest('[data-virtuoso-scroller="true"]')?.scrollHeight,
        ),
      )
      .toBeGreaterThan(10000)
    await expectTargetSettledInView()
    const previousTarget = await target.elementHandle()
    await targetSelect.click()
    await page.getByRole("option", { name: "vip (100x)", exact: true }).click()
    await expect(targetSelect).toHaveText("vip (100x)")
    await expect(target).toHaveAttribute("data-group-change-highlight")
    await expectTargetSettledInView()
    if (!grouped) {
      // A successful reveal must remount the offer outside the old virtual range.
      expect(
        await previousTarget?.evaluate((element) => element.isConnected),
      ).toBe(false)
    }
    await previousTarget?.dispose()
    await expect
      .poll(() =>
        targetSelect.evaluate(
          (element) =>
            element.closest('[data-virtuoso-scroller="true"]')?.scrollTop,
        ),
      )
      .toBeGreaterThan(5000)
    await targetSelect.click()
    await page
      .getByRole("option", { name: "All groups (2)", exact: true })
      .click()
    await expect(targetSelect).toHaveText("All groups (2)")
    await expect(target).toHaveAttribute("data-group-change-highlight")
    await expectTargetSettledInView()
  })
}
