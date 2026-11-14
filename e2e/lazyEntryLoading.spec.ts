import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { SITE_BOOKMARKS_TEST_IDS } from "~/features/SiteBookmarks/testIds"
import { USAGE_ANALYTICS_TEST_IDS } from "~/features/UsageAnalytics/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  createStoredApiCredentialProfile,
  createStoredBookmark,
  seedApiCredentialProfiles,
  seedStoredAccounts,
  seedStoredBookmarks,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
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

test("returns focus to the key action after asynchronous inventory opens a cold dialog", async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  const worker = await getServiceWorker(context)
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "deferred-key-focus",
      site_url: "https://key-focus.example.com",
    }),
  ])
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context, {
    baseUrl: "https://key-focus.example.com",
    initialTokens: [1, 2].map((id) => ({
      id,
      user_id: 1,
      key: `sk-synthetic-focus-${id}`,
      status: 1,
      name: `Focus key ${id}`,
      created_time: 1,
      accessed_time: 1,
      expired_time: -1,
      remain_quota: -1,
      unlimited_quota: true,
      model_limits_enabled: false,
      model_limits: "",
      allow_ips: "",
      used_quota: 0,
      group: "default",
    })),
  })
  let releaseLookup!: () => void
  const lookupGate = new Promise<void>((resolve) => {
    releaseLookup = resolve
  })
  await context.route(
    /^https:\/\/key-focus\.example\.com\/api\/token(?:\/|\?|$)/,
    async (route) => {
      await lookupGate
      await route.fallback()
    },
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  const row = page.getByTestId(
    getAccountManagementListItemTestId("deferred-key-focus"),
  )
  const opener = row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowCopyKeyButton)
  for (let attempt = 0; attempt < 2; attempt++) {
    await row.hover()
    await opener.click()
    if (attempt === 0) {
      try {
        await expect(opener).toHaveAttribute("aria-busy", "true")
        await expect(opener).toHaveAttribute("aria-disabled", "true")
        await expect(opener).toBeFocused()
        await row.screenshot({
          path: testInfo.outputPath("key-action-busy.png"),
          animations: "disabled",
        })
      } finally {
        releaseLookup()
      }
    }
    const details = page.getByRole("button", {
      name: "View details for Focus key 1",
      exact: true,
    })
    await expect(details).toBeVisible()
    await details.click()
    await page.keyboard.press("Escape")
    await expect(
      page.getByRole("heading", { name: "Key List", exact: true }),
    ).toBeHidden()
    await expect(opener).toBeFocused()
  }
})

test("opens the account editor and restores focus on close and reopen", async ({
  page,
  extensionId,
  context,
}) => {
  await stubLlmMetadataIndex(context)
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  const opener = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await opener.click()
    const dialog = page.getByRole("dialog")
    await expect(
      dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
  }
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
