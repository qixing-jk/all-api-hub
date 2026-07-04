import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { PRODUCT_ANNOUNCEMENT_TEST_IDS } from "~/features/ProductAnnouncements/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type {
  ProductAnnouncementState,
  RawProductAnnouncementFeed,
} from "~/services/productAnnouncements/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const RISK_ANNOUNCEMENT_ID = "e2e-critical-product-risk"
const INFO_ANNOUNCEMENT_ID = "e2e-info-product-update"
const RISK_ANNOUNCEMENT_TITLE = "Critical extension compatibility notice"
const INFO_ANNOUNCEMENT_TITLE = "New dashboard overview available"
const PRODUCT_ANNOUNCEMENT_REMOTE_URL =
  "https://raw.githubusercontent.com/qixing-jk/all-api-hub/main/public/product-announcements.json"

const PRODUCT_ANNOUNCEMENT_FEED: RawProductAnnouncementFeed = {
  schemaVersion: 1,
  defaultLocale: "en",
  announcements: [
    {
      id: RISK_ANNOUNCEMENT_ID,
      revision: 2,
      severity: "critical",
      priority: 100,
      affectedVersions: "*",
      startsAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      content: {
        en: {
          title: RISK_ANNOUNCEMENT_TITLE,
          message:
            "Open this notice from the header before updating managed sites.",
          cta: {
            label: "Read compatibility notes",
            url: "https://example.invalid/product-announcements/risk",
          },
        },
      },
    },
    {
      id: INFO_ANNOUNCEMENT_ID,
      revision: 1,
      severity: "info",
      priority: 10,
      affectedVersions: "*",
      startsAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      content: {
        en: {
          title: INFO_ANNOUNCEMENT_TITLE,
          message: "The options overview now summarizes setup and automation.",
        },
      },
    },
  ],
}

function createProductAnnouncementState(): ProductAnnouncementState {
  return {
    schemaVersion: 1,
    cachedFeed: PRODUCT_ANNOUNCEMENT_FEED,
    lastFetchedAt: Date.now(),
    dismissed: {},
    seenAt: {},
    lastShownAt: {},
  }
}

async function seedProductAnnouncementState(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
) {
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.PRODUCT_ANNOUNCEMENTS_STATE,
    createProductAnnouncementState(),
  )
}

async function readProductAnnouncementState(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<ProductAnnouncementState | null> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.PRODUCT_ANNOUNCEMENTS_STATE,
  )

  if (typeof raw === "string") {
    return JSON.parse(raw) as ProductAnnouncementState
  }

  return raw && typeof raw === "object"
    ? (raw as ProductAnnouncementState)
    : null
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await context.route(PRODUCT_ANNOUNCEMENT_REMOTE_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PRODUCT_ANNOUNCEMENT_FEED),
    }),
  )
})

test("persists product announcement seen, dismiss, and restore state across options and popup headers", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedProductAnnouncementState(serviceWorker)

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.OVERVIEW}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(page.getByText(RISK_ANNOUNCEMENT_TITLE)).toBeVisible()
  await expect(
    page.getByText(
      "Open this notice from the header before updating managed sites.",
    ),
  ).toBeVisible()
  await expect(
    page.getByTestId(PRODUCT_ANNOUNCEMENT_TEST_IDS.badge),
  ).toHaveText("1")

  await page.getByTestId(PRODUCT_ANNOUNCEMENT_TEST_IDS.button).click()

  await expect(
    page.getByTestId(PRODUCT_ANNOUNCEMENT_TEST_IDS.popover),
  ).toBeVisible()
  await expect(
    page.getByTestId(PRODUCT_ANNOUNCEMENT_TEST_IDS.activeList),
  ).toContainText(RISK_ANNOUNCEMENT_TITLE)
  await expect(
    page.getByTestId(PRODUCT_ANNOUNCEMENT_TEST_IDS.activeList),
  ).toContainText(INFO_ANNOUNCEMENT_TITLE)

  await expect
    .poll(async () => {
      const state = await readProductAnnouncementState(serviceWorker)
      return {
        infoSeen: typeof state?.seenAt[INFO_ANNOUNCEMENT_ID] === "number",
        riskSeen: typeof state?.seenAt[RISK_ANNOUNCEMENT_ID] === "number",
      }
    })
    .toEqual({ infoSeen: true, riskSeen: true })

  await page
    .getByTestId(PRODUCT_ANNOUNCEMENT_TEST_IDS.activeList)
    .getByRole("button", { name: `Dismiss ${RISK_ANNOUNCEMENT_TITLE}` })
    .click()

  await expect
    .poll(async () => {
      const state = await readProductAnnouncementState(serviceWorker)
      return state?.dismissed[RISK_ANNOUNCEMENT_ID]
    })
    .toBe(2)

  await expect(page.getByText(RISK_ANNOUNCEMENT_TITLE)).toHaveCount(0)
  await expect(page.getByText(INFO_ANNOUNCEMENT_TITLE)).toBeVisible()
  await expect(
    page.getByTestId(PRODUCT_ANNOUNCEMENT_TEST_IDS.badge),
  ).toHaveCount(0)

  const popupPage = await context.newPage()
  installExtensionPageGuards(popupPage)
  await forceExtensionLanguage(popupPage, "en")
  await popupPage.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(popupPage)

  await expect(
    popupPage.getByTestId(PRODUCT_ANNOUNCEMENT_TEST_IDS.reservedSlot),
  ).toBeVisible()
  await expect(
    popupPage.getByTestId(PRODUCT_ANNOUNCEMENT_TEST_IDS.button),
  ).toHaveCount(0)
  await popupPage.close()

  await page.getByRole("button", { name: "Dismissed" }).click()
  await expect(
    page.getByTestId(PRODUCT_ANNOUNCEMENT_TEST_IDS.dismissedList),
  ).toContainText(RISK_ANNOUNCEMENT_TITLE)

  await page
    .getByTestId(PRODUCT_ANNOUNCEMENT_TEST_IDS.dismissedList)
    .getByRole("button", { name: `Restore ${RISK_ANNOUNCEMENT_TITLE}` })
    .click()

  await expect
    .poll(async () => {
      const state = await readProductAnnouncementState(serviceWorker)
      return state?.dismissed[RISK_ANNOUNCEMENT_ID] ?? null
    })
    .toBeNull()

  const restoredPopupPage = await context.newPage()
  installExtensionPageGuards(restoredPopupPage)
  await forceExtensionLanguage(restoredPopupPage, "en")
  await restoredPopupPage.goto(
    `chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`,
  )
  await waitForExtensionRoot(restoredPopupPage)

  await expect(
    restoredPopupPage.getByTestId(PRODUCT_ANNOUNCEMENT_TEST_IDS.button),
  ).toBeVisible()
  await expect(
    restoredPopupPage.getByTestId(PRODUCT_ANNOUNCEMENT_TEST_IDS.badge),
  ).toHaveText("1")
})
