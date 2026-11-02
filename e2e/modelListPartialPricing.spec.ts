import { SITE_TYPES } from "~/constants/siteType"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import en from "~/locales/en/modelList.json" with { type: "json" }
import zh from "~/locales/zh-CN/modelList.json" with { type: "json" }
import {
  AIMLAPI_CHARGE_TYPES as chargeTypes,
  AIMLAPI_PRICING_CONTENTS as contents,
  AIMLAPI_MODEL_ENDPOINT_TYPES as endpointTypes,
  AIMLAPI_PRICING_ORIGINS as origins,
  AIMLAPI_PRICING_KINDS as pricingKinds,
  AIMLAPI_PRICING_UNITS as units,
} from "~/services/apiService/aimlapi/constants"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { verifyAccountModelCatalogUsage } from "~~/e2e/scenarios/accountUsage"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

const charge = (
  name: string,
  content: string,
  origin: string,
  price: number,
  per = 1,
  variable = false,
) => ({
  type: chargeTypes.Charge,
  name,
  content,
  origin,
  price,
  per,
  variable,
})

test("browses structured video variants without fetching optional webpage details", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const id = "fixture/video"
  let webpageReads = 0
  await context.route("https://aimlapi.com/**", (route) => {
    webpageReads++
    return route.fulfill({
      status: 503,
      body: "Webpage details must not be requested",
    })
  })
  await context.route(
    "https://api.aimlapi.com/v1/models?include=pricing",
    (route) => {
      expect(route.request().headers().authorization).toBeUndefined()
      return route.fulfill({
        json: {
          data: [
            {
              id,
              type: endpointTypes.VideoGeneration,
              info: { name: "Fixture video", developer: "Kling AI" },
              pricing: {
                kind: pricingKinds.Variants,
                currency: "USD",
                units: [
                  charge(
                    units.Second,
                    contents.Video,
                    origins.Generated,
                    0.157,
                    1,
                    true,
                  ),
                ],
                variants: [
                  {
                    unit: units.Second,
                    when: { resolution: "720p" },
                    price: 0.157,
                    per: 1,
                  },
                  {
                    unit: units.Second,
                    when: { resolution: "1080p" },
                    price: 0.235,
                    per: 1,
                  },
                ],
              },
            },
          ],
        },
      })
    },
  )
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount({
      id: "video-pricing",
      site_name: "Video pricing",
      site_url: "https://aimlapi.com",
      site_type: SITE_TYPES.AIMLAPI,
    }),
  ])
  await verifyAccountModelCatalogUsage({
    page,
    extensionId,
    account: { accountId: "video-pricing" },
    expectations: { totalModels: 1, modelNames: [id] },
  })
  const display = page.getByTestId(MODEL_LIST_TEST_IDS.modelDisplay)
  await expect(display).toContainText("Video quality: 720p")
  await expect(display).toContainText("Video quality: 1080p")
  await expect(display).toContainText("0.157")
  await expect(display).toContainText("0.235")
  await expect(
    display.getByRole("button", { name: "Price details", exact: true }),
  ).toHaveCount(0)
  await expect(display).not.toContainText("The pricing source is unavailable")
  await captureVisualViews({
    page,
    ready: display,
    id: "structured-video-variants",
    extensionDir,
  })
  await display.getByTestId(MODEL_LIST_TEST_IDS.modelExpandButton).click()
  await display.getByTestId(MODEL_LIST_TEST_IDS.modelExpandButton).click()
  expect(webpageReads).toBe(0)
})

test("keeps partial token prices and localized runtime explanations visible", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const fluxId = "fixture/variable-image"
  const transcribeId = "fixture/output-only"
  const embeddingId = "fixture/embedding"
  await context.route(
    "https://api.aimlapi.com/v1/models?include=pricing",
    (route) =>
      route.fulfill({
        json: {
          data: [
            {
              id: fluxId,
              type: endpointTypes.ImageGeneration,
              info: { name: "Variable image", developer: "Provider" },
              pricing: {
                kind: pricingKinds.Variable,
                currency: "USD",
                units: [
                  charge(
                    units.Megapixel,
                    contents.Image,
                    origins.Generated,
                    0.05,
                    1,
                    true,
                  ),
                ],
              },
            },
            {
              id: transcribeId,
              type: endpointTypes.SpeechToText,
              info: { name: "Output only", developer: "Provider" },
              pricing: {
                kind: pricingKinds.Fixed,
                currency: "USD",
                units: [
                  charge(
                    units.Token,
                    contents.Text,
                    origins.Generated,
                    12,
                    1000000,
                  ),
                ],
              },
            },
            {
              id: embeddingId,
              type: endpointTypes.Embeddings,
              info: { name: "Embedding", developer: "Provider" },
              pricing: {
                kind: pricingKinds.Fixed,
                currency: "USD",
                units: [
                  charge(
                    units.Token,
                    contents.Text,
                    origins.Provided,
                    0.07,
                    1000000,
                  ),
                ],
              },
            },
          ],
        },
      }),
  )
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount({
      id: "partial-pricing-account",
      site_name: "Partial pricing",
      site_url: "https://aimlapi.com",
      site_type: SITE_TYPES.AIMLAPI,
    }),
  ])
  await verifyAccountModelCatalogUsage({
    page,
    extensionId,
    account: { accountId: "partial-pricing-account" },
    expectations: { totalModels: 3 },
  })
  const search = page.getByRole("textbox", {
    name: "Search Models",
    exact: true,
  })
  const display = page.getByTestId(MODEL_LIST_TEST_IDS.modelDisplay)
  await search.fill(fluxId)
  await expect(display).toContainText("$0.0500 / megapixel")
  await expect(display).toContainText(en.pricingNotes.runtimeDependent)
  await captureVisualViews({
    page,
    ready: display,
    id: "runtime-pricing-explanation",
    extensionDir,
  })
  await expect(display).not.toContainText(
    `${en.scenario.sitePricingDescription}:`,
  )
  await search.fill(transcribeId)
  await expect(display).toContainText("$12.00/M")
  await expect(display.getByText("Not provided", { exact: true })).toHaveCount(
    0,
  )
  await search.fill(embeddingId)
  await expect(display).toContainText("$0.0700")
  await expect(display.getByText("Not provided", { exact: true })).toHaveCount(
    0,
  )
  // Use the real locale setting owner; the same structured note must translate
  // after navigation instead of retaining an adapter-selected language.
  const translatedPage = await context.newPage()
  await forceExtensionLanguage(translatedPage, "zh-CN")
  await translatedPage.goto(
    `chrome-extension://${extensionId}/options.html#models?accountId=partial-pricing-account`,
  )
  const translatedSearch = translatedPage.getByRole("textbox", {
    name: "搜索模型",
    exact: true,
  })
  await translatedSearch.fill(fluxId)
  const translatedDisplay = translatedPage.getByTestId(
    MODEL_LIST_TEST_IDS.modelDisplay,
  )
  await expect(translatedDisplay).toContainText(
    zh.pricingNotes.runtimeDependent,
  )
  await expect(translatedDisplay).not.toContainText(
    en.pricingNotes.runtimeDependent,
  )
  await captureVisualViews({
    page: translatedPage,
    ready: translatedDisplay,
    id: "runtime-pricing-explanation-zh",
    extensionDir,
  })
  await translatedPage.close()
  await page
    .getByTestId(MODEL_LIST_TEST_IDS.headerPriceComparisonButton)
    .click()
  await expect(display).toContainText("Not included:")
  await captureVisualViews({
    page,
    ready: display,
    id: "partial-token-quote",
    extensionDir,
  })
})
