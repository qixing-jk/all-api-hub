import { SITE_TYPES } from "~/constants/siteType"
import { MODEL_METADATA_URL } from "~/services/models/modelMetadata/constants"
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

test("inspects published pricing with a bounded scrolling diagnostic region", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  test.skip(
    process.env.AAH_E2E_DIAGNOSTICS !== "1",
    "Requires an explicitly built development-mode extension; production diagnostics stay hidden",
  )
  test.setTimeout(120_000)
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await context.route(MODEL_METADATA_URL, (route) =>
    route.fulfill({
      json: {
        models: [
          {
            id: "blackforestlabs/flux-2-flex",
            name: "FLUX.2 Flex",
            provider_id: "blackforestlabs",
          },
        ],
      },
    }),
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const flux = "blackforestlabs/flux-2-flex"
  const pricedIds = [
    flux,
    ...Array.from(
      { length: 59 },
      (_, i) => `fixture/image-${String(i).padStart(2, "0")}`,
    ),
  ]
  const ids = [...pricedIds, "fixture/unpriced"]
  await context.route(
    "https://api.aimlapi.com/v1/models?include=pricing",
    (route) =>
      route.fulfill({
        json: {
          data: ids.map((id) => ({
            id,
            type: "openai/image-generations",
            info: { name: id, developer: "Black Forest Labs" },
            ...(id === "fixture/unpriced"
              ? {}
              : {
                  pricing: {
                    kind: id === flux ? "variable" : "fixed",
                    currency: "USD",
                    units: [
                      {
                        type: "charge",
                        name: "megapixel",
                        content: "image",
                        origin: "generated",
                        price: 0.05,
                        per: 1,
                        variable: id === flux,
                      },
                    ],
                  },
                }),
          })),
        },
      }),
  )
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount({
      id: "diagnostic-prices",
      site_name: "AI/ML API",
      site_url: "https://aimlapi.com",
      site_type: SITE_TYPES.AIMLAPI,
    }),
  ])
  await verifyAccountModelCatalogUsage({
    page,
    extensionId,
    account: { accountId: "diagnostic-prices" },
    expectations: { totalModels: 61 },
  })
  for (const extra of context.pages()) {
    if (extra !== page && extra.url().includes("onboarding=permissions"))
      await extra.close()
  }
  await page.bringToFront()
  const trigger = page.getByRole("button", {
    name: "[DEV] Pricing diagnostics",
    exact: true,
  })
  await expect(trigger).toBeVisible()
  const panel = trigger.locator("xpath=ancestor::section[1]")
  await expect(panel).toContainText(
    "61 records · 60 published · 0 quoted · 1 need review",
  )
  await captureVisualViews({
    page,
    ready: panel,
    id: "diagnostics-overview",
    extensionDir,
  })
  await panel.getByRole("button", { name: "Review 1", exact: true }).click()
  const region = panel.getByRole("region", {
    name: "Diagnostic results",
    exact: true,
  })
  await expect(
    region.getByText("fixture/unpriced", { exact: true }),
  ).toBeVisible()
  await panel
    .getByRole("combobox", { name: "Filter diagnostic issues", exact: true })
    .click()
  await page.getByRole("option", { name: "All offers", exact: true }).click()
  await expect(region.getByText(flux, { exact: true })).toBeVisible()
  const bounds = await region.evaluate((node) => ({
    height: node.clientHeight,
    content: node.scrollHeight,
  }))
  expect(bounds.height).toBeLessThanOrEqual(400)
  expect(bounds.content).toBeGreaterThan(bounds.height)
  expect(await region.getByRole("listitem").count()).toBeLessThan(61)
  await region.evaluate((node) => node.scrollTo(0, node.scrollHeight))
  await expect(
    region.getByText("fixture/unpriced", { exact: true }),
  ).toBeVisible()
  await captureVisualViews({
    page,
    ready: region,
    id: "diagnostics-results",
    extensionDir,
  })
  await panel
    .getByRole("textbox", {
      name: "Search model, source or group",
      exact: true,
    })
    .fill("flux-2-flex")
  await expect(
    region.getByText("Reference price", { exact: true }),
  ).toBeVisible()
  await expect(region).toContainText("megapixel")
  await expect(panel).not.toContainText("availability:undefined")
  await expect(region).not.toContainText("million-selected-tokens")
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    const searchBounds = await panel
      .getByRole("textbox", {
        name: "Search model, source or group",
        exact: true,
      })
      .boundingBox()
    const filterBounds = await panel
      .getByRole("combobox", { name: "Filter diagnostic issues", exact: true })
      .boundingBox()
    const resultBounds = await region.boundingBox()
    const copyBounds = await panel
      .getByRole("button", { name: "Copy filtered results", exact: true })
      .boundingBox()
    expect(searchBounds!.width).toBeGreaterThanOrEqual(filterBounds!.width - 48)
    expect(filterBounds!.y).toBeGreaterThan(
      searchBounds!.y + searchBounds!.height,
    )
    expect(copyBounds!.y).toBeGreaterThan(
      resultBounds!.y + resultBounds!.height,
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  await captureVisualViews({
    page,
    ready: panel,
    id: "diagnostics-reference",
    extensionDir,
  })
  await region
    .getByRole("button", { name: `Inspect diagnostics: ${flux}`, exact: true })
    .click()
  const drawer = page.getByRole("dialog")
  await expect(
    drawer.getByRole("heading", { name: flux, exact: true }),
  ).toBeVisible()
  await expect(drawer).toContainText("$0.0500")
  await captureVisualViews({
    page,
    ready: drawer,
    id: "diagnostics-record",
    extensionDir,
  })
  await drawer.getByRole("button", { name: "Copy record", exact: true }).click()
  await expect(
    page.getByText("Diagnostic report copied", { exact: true }),
  ).toBeVisible()
  await expect(drawer).not.toContainText("Diagnostic report copied")
  await captureVisualViews({
    page,
    ready: page.getByText("Diagnostic report copied", { exact: true }),
    id: "diagnostics-copy-toast",
    extensionDir,
  })
  const exported = JSON.parse(
    await page.evaluate(() => navigator.clipboard.readText()),
  )
  expect(exported.scope).toBe("selected-diagnostic")
  expect(exported.rows).toHaveLength(1)
  expect(exported.rows[0]).toMatchObject({
    model: flux,
    status: "reference",
    unit: "megapixel",
    issues: [],
  })
  await drawer
    .getByRole("button", { name: "Locate model", exact: true })
    .click()
  await expect(drawer).not.toBeVisible()
  await expect(
    page.getByRole("textbox", { name: "Search Models", exact: true }),
  ).toHaveValue(flux)
})
