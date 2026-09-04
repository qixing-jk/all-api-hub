import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  PRODUCT_TOUR_TARGET_ATTRIBUTE,
  PRODUCT_TOUR_TARGETS,
  PRODUCT_TOUR_VERSIONS,
} from "~/features/ProductTour/constants"
import { PRODUCT_TOUR_TEST_IDS } from "~/features/ProductTour/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { PRODUCT_TOUR_VARIANTS } from "~/services/featureGuidance/featureGuidanceState"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageJsonValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("introduces options modules without navigating or performing actions", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker)

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.OVERVIEW}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const invitation = page.getByTestId(PRODUCT_TOUR_TEST_IDS.invitation)
  await expect(invitation).toBeVisible()
  await invitation.getByRole("button", { name: "Start tour" }).click()

  const tooltip = page.getByRole("alertdialog")
  const expectedStepTitles = [
    "Find anything, right away",
    "Keep account resources together",
    "Manage models and keys together",
    "Automate routine tasks",
    "See usage changes at a glance",
    "Connect a gateway for unified access",
    "Keep settings and data in your control",
  ]

  for (const [index, title] of expectedStepTitles.entries()) {
    await expect(tooltip.getByRole("heading", { name: title })).toBeVisible()

    if (index === 0) {
      const searchButton = page
        .getByRole("button", { name: "Open settings search" })
        .first()
      const searchTarget = page.locator(
        `[${PRODUCT_TOUR_TARGET_ATTRIBUTE}="${PRODUCT_TOUR_TARGETS.Workspace}"]`,
      )

      await expect(searchTarget).toHaveCount(1)
      await expect(searchTarget).toHaveJSProperty("tagName", "BUTTON")
      expect(await searchTarget.boundingBox()).toEqual(
        await searchButton.boundingBox(),
      )
    }

    if (index === 1) {
      const category = page.locator(
        `[${PRODUCT_TOUR_TARGET_ATTRIBUTE}="${PRODUCT_TOUR_TARGETS.General}"]`,
      )
      const lastCategoryItem = page.getByRole("button", {
        name: "Bookmark Management",
      })

      await expect(
        category.getByRole("button", { name: "Bookmark Management" }),
      ).toHaveCount(1)
      const categoryBox = await category.boundingBox()
      const lastItemBox = await lastCategoryItem.boundingBox()

      expect(categoryBox).not.toBeNull()
      expect(lastItemBox).not.toBeNull()
      expect(categoryBox!.y + categoryBox!.height).toBe(
        lastItemBox!.y + lastItemBox!.height,
      )
    }

    if (index < expectedStepTitles.length - 1) {
      await tooltip.getByRole("button", { name: "Next" }).click()
    }
  }

  await tooltip.getByRole("button", { name: "Finish" }).click()
  await expect(tooltip).toHaveCount(0)
  await expect(invitation).toHaveCount(0)
  await expect(page).toHaveURL(
    new RegExp(`options\\.html#${MENU_ITEM_IDS.OVERVIEW}$`),
  )

  await expect
    .poll(async () => {
      const guidance = await getPlasmoStorageJsonValue<{
        productTour?: { expanded?: { handledVersion?: number } }
      }>(serviceWorker, STORAGE_KEYS.FEATURE_GUIDANCE_STATE)
      return guidance?.productTour?.expanded?.handledVersion
    })
    .toBe(PRODUCT_TOUR_VERSIONS[PRODUCT_TOUR_VARIANTS.Expanded])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  await page.getByRole("button", { name: "Open settings search" }).click()
  const searchDialog = page.getByRole("dialog", { name: "Search settings" })
  await searchDialog.getByPlaceholder("Search settings...").fill("feature tour")
  await searchDialog
    .getByRole("option", { name: /Feature tour/ })
    .first()
    .click()

  await expect(page).toHaveURL(
    new RegExp(`options\\.html\\?.*#${MENU_ITEM_IDS.ABOUT}$`),
  )
  await expect(page.getByTestId(PRODUCT_TOUR_TEST_IDS.replay)).toBeVisible()
  await expect(page.getByTestId(PRODUCT_TOUR_TEST_IDS.replay)).toBeInViewport()
  await expect(
    page.getByRole("button", { name: "View tour again" }),
  ).toBeEnabled()

  await page.setViewportSize({ width: 320, height: 568 })
  await page.getByRole("button", { name: "View tour again" }).click()

  const compactTooltip = page.getByRole("alertdialog")
  await expect(
    compactTooltip.getByRole("heading", { name: "All features within reach" }),
  ).toBeVisible()
  const mobileMenuTarget = page.locator(
    `[${PRODUCT_TOUR_TARGET_ATTRIBUTE}="${PRODUCT_TOUR_TARGETS.MobileMenu}"]`,
  )
  const mobileMenuButton = page.getByRole("button", {
    name: "Toggle menu",
  })
  expect(await mobileMenuTarget.boundingBox()).toEqual(
    await mobileMenuButton.boundingBox(),
  )

  const navigationTarget = page.locator(
    `[${PRODUCT_TOUR_TARGET_ATTRIBUTE}="${PRODUCT_TOUR_TARGETS.Navigation}"]`,
  )
  await compactTooltip.getByRole("button", { name: "Next" }).click()
  await expect(
    compactTooltip.getByRole("heading", {
      name: "Multi-site management in one place",
    }),
  ).toBeVisible()
  const navigationTooltipBox = await compactTooltip.boundingBox()
  expect(navigationTooltipBox).not.toBeNull()
  expect(navigationTooltipBox!.y).toBeGreaterThanOrEqual(0)
  expect(
    navigationTooltipBox!.y + navigationTooltipBox!.height,
  ).toBeLessThanOrEqual(568)
  await expect
    .poll(async () => (await navigationTarget.boundingBox())?.x)
    .toBeGreaterThanOrEqual(0)

  await compactTooltip.getByRole("button", { name: "Back" }).click()
  await expect(
    compactTooltip.getByRole("heading", { name: "All features within reach" }),
  ).toBeVisible()
  await expect
    .poll(async () => (await navigationTarget.boundingBox())?.x)
    .toBeLessThanOrEqual(-250)

  await compactTooltip.getByRole("button", { name: "Next" }).click()
  await compactTooltip.getByRole("button", { name: "Next" }).click()
  await expect(
    compactTooltip.getByRole("heading", {
      name: "Finish each task in one place",
    }),
  ).toBeVisible()
  await expect
    .poll(async () => (await navigationTarget.boundingBox())?.x)
    .toBeLessThanOrEqual(-250)

  const contentTarget = page.locator(
    `[${PRODUCT_TOUR_TARGET_ATTRIBUTE}="${PRODUCT_TOUR_TARGETS.Content}"]`,
  )
  await expect(contentTarget).toBeInViewport()
  const compactBox = await compactTooltip.boundingBox()
  expect(compactBox).not.toBeNull()
  expect(compactBox!.x).toBeGreaterThanOrEqual(0)
  expect(compactBox!.x + compactBox!.width).toBeLessThanOrEqual(320)
  expect(compactBox!.y).toBeGreaterThanOrEqual(0)
  expect(compactBox!.y + compactBox!.height).toBeLessThanOrEqual(568)

  await page.keyboard.press("Escape")
  await expect(compactTooltip).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "View tour again" }),
  ).toBeFocused()
  await expect
    .poll(async () => (await navigationTarget.boundingBox())?.x)
    .toBeLessThanOrEqual(-250)
})
