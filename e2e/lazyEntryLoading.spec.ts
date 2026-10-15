import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { SITE_BOOKMARKS_TEST_IDS } from "~/features/SiteBookmarks/testIds"
import { USAGE_ANALYTICS_TEST_IDS } from "~/features/UsageAnalytics/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredApiCredentialProfile,
  createStoredBookmark,
  seedApiCredentialProfiles,
  seedStoredBookmarks,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import {
  attachJsonReport,
  captureExtensionResourceSnapshot,
  createExtensionRequestTracker,
  diffExtensionResourceSnapshots,
  shouldAssertLazyLoading,
  waitForExtensionRoot,
  waitForProbeSettle,
  waitForTrackedResourceCountIncrease,
} from "~~/e2e/utils/lazyLoading"

test.beforeEach(({ page }) => {
  page.on("pageerror", (error) => {
    throw error
  })

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      throw new Error(msg.text())
    }
  })
})

test("popup defers non-default tab chunks until users select them", async ({
  page,
  extensionId,
  context,
}, testInfo) => {
  await stubLlmMetadataIndex(context)
  const serviceWorker = await getServiceWorker(context)
  // Statistics are only mounted for populated libraries.
  await seedStoredBookmarks(serviceWorker, [createStoredBookmark()])
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile(),
  ])
  const strictMode = shouldAssertLazyLoading()
  const tracker = createExtensionRequestTracker(page, extensionId)

  try {
    await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
    await waitForExtensionRoot(page)

    const initial = await captureExtensionResourceSnapshot(
      page,
      "initial",
      tracker,
    )

    if (strictMode) {
      expect(
        initial.resources.some((resource) =>
          /chunks\/BookmarksList-.*\.js$/.test(resource),
        ),
      ).toBeFalsy()
      expect(
        initial.resources.some((resource) =>
          /chunks\/BookmarkStatsSection-.*\.js$/.test(resource),
        ),
      ).toBeFalsy()
      expect(
        initial.resources.some((resource) =>
          /chunks\/ApiCredentialProfilesPopupView-.*\.js$/.test(resource),
        ),
      ).toBeFalsy()
      expect(
        initial.resources.some((resource) =>
          /chunks\/ApiCredentialProfilesStatsSection-.*\.js$/.test(resource),
        ),
      ).toBeFalsy()
    }

    const bookmarksTab = page.getByRole("tab", {
      name: /^(Bookmarks|书签)$/,
    })
    const apiCredentialProfilesTab = page.getByTestId(
      POPUP_TEST_IDS.apiCredentialProfilesTab,
    )

    await bookmarksTab.click()
    if (strictMode) {
      await waitForTrackedResourceCountIncrease(tracker, initial.resourceCount)
      await expect
        .poll(() =>
          tracker
            .getResources()
            .some((resource) =>
              /chunks\/BookmarkStatsSection-.*\.js$/.test(resource),
            ),
        )
        .toBeTruthy()
    } else {
      await waitForProbeSettle(page, 500, {
        expectedSelector: `[data-testid="${SITE_BOOKMARKS_TEST_IDS.listView}"]`,
      })
    }

    const afterBookmarks = await captureExtensionResourceSnapshot(
      page,
      "afterBookmarksTab",
      tracker,
    )
    const bookmarksDelta = diffExtensionResourceSnapshots(
      initial,
      afterBookmarks,
    )

    if (strictMode) {
      expect(
        bookmarksDelta.newResources.some((resource) =>
          /chunks\/BookmarksList-.*\.js$/.test(resource),
        ),
      ).toBeTruthy()
      expect(
        bookmarksDelta.newResources.some((resource) =>
          /chunks\/BookmarkStatsSection-.*\.js$/.test(resource),
        ),
      ).toBeTruthy()
    }

    await apiCredentialProfilesTab.click()
    if (strictMode) {
      await waitForTrackedResourceCountIncrease(
        tracker,
        afterBookmarks.resourceCount,
      )
      await expect
        .poll(() =>
          tracker
            .getResources()
            .some((resource) =>
              /chunks\/ApiCredentialProfilesStatsSection-.*\.js$/.test(
                resource,
              ),
            ),
        )
        .toBeTruthy()
    } else {
      await waitForProbeSettle(page, 500, {
        expectedSelector: `[data-testid="${API_CREDENTIAL_PROFILES_TEST_IDS.popupView}"]`,
      })
    }

    const afterApiCredentialProfiles = await captureExtensionResourceSnapshot(
      page,
      "afterApiCredentialProfilesTab",
      tracker,
    )
    const apiCredentialProfilesDelta = diffExtensionResourceSnapshots(
      afterBookmarks,
      afterApiCredentialProfiles,
    )

    if (strictMode) {
      expect(
        apiCredentialProfilesDelta.newResources.some((resource) =>
          /chunks\/ApiCredentialProfilesPopupView-.*\.js$/.test(resource),
        ),
      ).toBeTruthy()
      expect(
        apiCredentialProfilesDelta.newResources.some((resource) =>
          /chunks\/ApiCredentialProfilesStatsSection-.*\.js$/.test(resource),
        ),
      ).toBeTruthy()
    }

    await attachJsonReport(testInfo, "popup-lazy-loading-report", {
      initial,
      afterBookmarks,
      bookmarksDelta,
      afterApiCredentialProfiles,
      apiCredentialProfilesDelta,
    })
  } finally {
    tracker.dispose()
  }
})

test("options defers heavy page chunks until hash navigation loads them", async ({
  page,
  extensionId,
}, testInfo) => {
  const strictMode = shouldAssertLazyLoading()
  const tracker = createExtensionRequestTracker(page, extensionId)

  try {
    await page.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)
    await waitForExtensionRoot(page)

    const initial = await captureExtensionResourceSnapshot(
      page,
      "initial",
      tracker,
    )

    await page.evaluate((menuItemId) => {
      window.location.hash = `#${menuItemId}`
    }, MENU_ITEM_IDS.USAGE_ANALYTICS)

    await page.waitForFunction(
      (expectedHash) => window.location.hash === expectedHash,
      `#${MENU_ITEM_IDS.USAGE_ANALYTICS}`,
    )
    if (strictMode) {
      await waitForTrackedResourceCountIncrease(tracker, initial.resourceCount)
    } else {
      await waitForProbeSettle(page, 500, {
        expectedSelector: `[data-testid="${USAGE_ANALYTICS_TEST_IDS.page}"]`,
      })
    }

    const afterUsageAnalytics = await captureExtensionResourceSnapshot(
      page,
      "afterUsageAnalytics",
      tracker,
    )
    const usageAnalyticsDelta = diffExtensionResourceSnapshots(
      initial,
      afterUsageAnalytics,
    )

    if (strictMode) {
      expect(afterUsageAnalytics.resourceCount).toBeGreaterThan(
        initial.resourceCount,
      )
      expect(usageAnalyticsDelta.newJsResources.length).toBeGreaterThan(0)
    }

    await attachJsonReport(testInfo, "options-lazy-loading-report", {
      initial,
      afterUsageAnalytics,
      usageAnalyticsDelta,
    })
  } finally {
    tracker.dispose()
  }
})
