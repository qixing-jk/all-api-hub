import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { BASIC_SETTINGS_TEST_IDS } from "~/features/BasicSettings/testIds"
import { OPTIONS_OVERVIEW_TEST_IDS } from "~/features/OptionsOverview/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("options default route opens overview and preserves explicit basic links", async ({
  extensionId,
  page,
}) => {
  await page.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)
  await expect(page).toHaveURL(new RegExp(`#${MENU_ITEM_IDS.OVERVIEW}$`))
  await expect(page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.page)).toBeVisible()

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  await expect(page).toHaveURL(new RegExp(`#${MENU_ITEM_IDS.BASIC}$`))
})

test("overview action center opens disabled auto check-in settings", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    autoCheckin: {
      globalEnabled: false,
    },
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.OVERVIEW}`,
  )
  await waitForExtensionRoot(page)

  await expect(page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.page)).toBeVisible()
  const actionCenter = page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.actionCenter)
  await expect(actionCenter).toBeVisible()

  await actionCenter
    .getByRole("button", { name: "Auto check-in", exact: true })
    .click()

  await expect
    .poll(() => {
      const url = new URL(page.url())
      return {
        hash: url.hash,
        tab: url.searchParams.get("tab"),
        anchor: url.searchParams.get("anchor"),
        highlight: url.searchParams.get("highlight"),
      }
    })
    .toEqual({
      hash: `#${MENU_ITEM_IDS.BASIC}`,
      tab: "checkinRedeem",
      anchor: SETTINGS_ANCHORS.AUTO_CHECKIN,
      highlight: SETTINGS_ANCHORS.AUTO_CHECKIN,
    })

  await expect(page.getByTestId(BASIC_SETTINGS_TEST_IDS.page)).toBeVisible()
  await expect(
    page.locator(`#${SETTINGS_ANCHORS.AUTO_CHECKIN}`),
  ).toBeInViewport()
  await expect(
    page.getByRole("heading", { name: "Auto Check-in" }).first(),
  ).toBeVisible()
})
