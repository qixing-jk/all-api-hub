import type { Locator, Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import { OPTIONS_OVERVIEW_TEST_IDS } from "~/features/OptionsOverview/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageRawValue,
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"

const gatewayUrl = "https://gateway.example.invalid"
const guidanceHistory = (completed: boolean) => ({
  schemaVersion: 1,
  productTour: {
    expanded: { handledVersion: 999, outcome: "completed", handledAt: 1 },
    compact: { handledVersion: 999, outcome: "completed", handledAt: 1 },
  },
  gatewayGuidance: {
    ...(completed ? { onboardingCompletedAt: 1 } : {}),
    dismissedAtBySurface: {},
  },
})

/** Confirms that preview navigation exposes the whole guide below the header. */
async function expectGuideBelowHeader(page: Page, guide: Locator) {
  await expect(guide).toBeFocused()
  await expect
    .poll(async () => {
      const card = await guide.boundingBox()
      const header = await page.getByRole("banner").boundingBox()
      return card && header ? card.y - (header.y + header.height) : -1
    })
    .toBeGreaterThanOrEqual(16)
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await setPlasmoStorageValue(
    await getServiceWorker(context),
    STORAGE_KEYS.FEATURE_GUIDANCE_STATE,
    guidanceHistory(false),
  )
})

test("optional setup remembers collapse and remains usable on narrow screens", async ({
  page,
  extensionId,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#overview`,
  )
  const guide = page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.unifiedApiGuidance)
  await expect(
    guide.getByRole("button", { name: "View steps", exact: true }),
  ).toBeVisible()
  await expect(guide.getByRole("list")).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath("discovery.png"),
    fullPage: true,
  })
  await guide.getByRole("button", { name: "View steps", exact: true }).click()
  await expect(guide.getByRole("listitem")).toHaveCount(3)
  await expect(
    guide.getByRole("link", { name: "Connect a client" }),
  ).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath("expanded.png"),
    fullPage: true,
  })
  await guide.getByRole("button", { name: "Collapse", exact: true }).click()
  await page.reload()
  await expect(
    guide.getByRole("button", { name: "View steps", exact: true }),
  ).toBeVisible()
  await expect(guide.getByRole("list")).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await guide.getByRole("button", { name: "View steps", exact: true }).click()
  await expect(
    guide.getByRole("button", { name: "Collapse", exact: true }),
  ).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("expanded-mobile.png"),
    fullPage: true,
  })
})

test("completed setup leaves the overview and can be reopened", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    managedSiteType: SITE_TYPES.NEW_API,
    newApi: {
      baseUrl: gatewayUrl,
      adminToken: "synthetic-admin-token",
      userId: "1",
    },
  })
  await setPlasmoStorageValue(
    worker,
    STORAGE_KEYS.FEATURE_GUIDANCE_STATE,
    guidanceHistory(true),
  )
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#overview`,
  )
  const reopen = page.getByRole("button", { name: "Setup guide", exact: true })
  await expect(reopen).toBeVisible()
  const guide = page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.unifiedApiGuidance)
  await expect(guide).toHaveCount(0)
  await expect(
    page.getByRole("heading", { name: "Unified API setup", exact: true }),
  ).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath("completed.png"),
    fullPage: true,
  })
  await reopen.click()
  await expect(guide.getByRole("listitem")).toHaveCount(3)
  await guide.getByRole("button", { name: "Collapse", exact: true }).click()
  await expect(guide).toHaveCount(0)
  const clientAction = page.getByRole("link", {
    name: "Connect a client",
    exact: true,
  })
  await expect(clientAction).toHaveCount(0)
  await page.reload()
  await expect(reopen).toBeVisible()
  await expect(guide).toHaveCount(0)
})

for (const entry of ["overview", "managedSiteChannels"] as const) {
  test(`${entry} preview stays optional until a setup action starts source guidance`, async ({
    context,
    page,
    extensionId,
  }) => {
    const worker = await getServiceWorker(context)
    const startedAt = async () => {
      const raw = await getPlasmoStorageRawValue<string>(
        worker,
        STORAGE_KEYS.FEATURE_GUIDANCE_STATE,
      )
      return JSON.parse(raw).gatewayGuidance.onboardingStartedAt
    }
    const base = `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`
    await page.goto(`${base}#account`)
    await expect(
      page.getByRole("heading", { name: "Account Management", exact: true }),
    ).toBeVisible()
    await expect(
      page.getByTestId("unified-api-guidance-primary-action"),
    ).toHaveCount(0)
    await page.goto(`${base}#${entry}`)
    const previewButton = page.getByRole("button", {
      name: entry === "overview" ? "View steps" : "Setup guide",
      exact: true,
    })
    await previewButton.click()
    const guide = page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.unifiedApiGuidance)
    await expect(page).toHaveURL(/#overview$/)
    if (entry !== "overview") {
      await expectGuideBelowHeader(page, guide)
    }
    await expect(guide.getByRole("listitem")).toHaveCount(3)
    expect(await startedAt()).toBeUndefined()
    await guide.getByRole("button", { name: "Collapse", exact: true }).click()
    expect(await startedAt()).toBeUndefined()
    await guide.getByRole("button", { name: "View steps", exact: true }).click()
    await guide.getByTestId("unified-api-guidance-primary-action").click()
    await expect(page).toHaveURL(/#account$/)
    await expect.poll(startedAt).toBeGreaterThan(0)
    await page.goto(`${base}#account`)
    await expect(
      page.getByTestId("unified-api-guidance-primary-action"),
    ).toBeVisible()
    await page.goto(`${base}#overview`)
    const overviewGuide = page.getByTestId(
      OPTIONS_OVERVIEW_TEST_IDS.unifiedApiGuidance,
    )
    await expect(overviewGuide.getByRole("listitem")).toHaveCount(3)
    await overviewGuide
      .getByRole("button", { name: "Collapse", exact: true })
      .click()
    await expect(
      overviewGuide.getByRole("button", {
        name: "Continue setup",
        exact: true,
      }),
    ).toBeVisible()
  })
}

test("gateway settings link opens the completed guide and direct import starts guidance", async ({
  context,
  page,
  extensionId,
}) => {
  const worker = await getServiceWorker(context)
  const base = `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`
  await setPlasmoStorageValue(
    worker,
    STORAGE_KEYS.FEATURE_GUIDANCE_STATE,
    guidanceHistory(true),
  )
  await page.goto(`${base}?tab=managedSite#basic`)
  await page.getByRole("button", { name: "Setup guide", exact: true }).click()
  const guide = page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.unifiedApiGuidance)
  await expectGuideBelowHeader(page, guide)
  await expect(guide.getByRole("listitem")).toHaveCount(3)
  await expect(page).toHaveURL(/#overview$/)
  await setPlasmoStorageValue(
    worker,
    STORAGE_KEYS.FEATURE_GUIDANCE_STATE,
    guidanceHistory(false),
  )
  await seedUserPreferences(worker, {
    managedSiteType: SITE_TYPES.NEW_API,
    newApi: {
      baseUrl: gatewayUrl,
      adminToken: "synthetic-admin-token",
      userId: "1",
    },
  })
  await page.goto(`${base}?tab=managedSite#basic`)
  await page
    .getByRole("button", { name: "Add channel with API key", exact: true })
    .click()
  await expect(page).toHaveURL(/#apiCredentialProfiles$/)
  const raw = await getPlasmoStorageRawValue<string>(
    worker,
    STORAGE_KEYS.FEATURE_GUIDANCE_STATE,
  )
  expect(JSON.parse(raw).gatewayGuidance.onboardingStartedAt).toBeGreaterThan(0)
})
