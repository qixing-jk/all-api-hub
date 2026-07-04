import type { BrowserContext, Page, Worker } from "@playwright/test"

import { RELEASE_UPDATE_STATUS_PANEL_TEST_IDS } from "~/components/ReleaseUpdateStatusPanel.testIds"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { ReleaseUpdateStatus } from "~/services/updates/releaseUpdateStatus"
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
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const GITHUB_LATEST_RELEASE_API_URL =
  "https://api.github.com/repos/qixing-jk/all-api-hub/releases/latest"
const LATEST_RELEASE_URL =
  "https://github.com/qixing-jk/all-api-hub/releases/tag/v9.9.9"

async function readReleaseUpdateStatus(
  serviceWorker: Worker,
): Promise<ReleaseUpdateStatus | null> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.RELEASE_UPDATE_STATUS,
  )

  if (typeof raw === "string") {
    return JSON.parse(raw) as ReleaseUpdateStatus
  }

  if (raw && typeof raw === "object") {
    return raw as ReleaseUpdateStatus
  }

  return null
}

async function openAboutPageAndCheckForReleaseUpdate(params: {
  context: BrowserContext
  extensionId: string
  page: Page
  responseStatus: number
  responseBody: unknown
}): Promise<() => number> {
  let githubReleaseRequests = 0

  await params.context.route(GITHUB_LATEST_RELEASE_API_URL, (route) => {
    githubReleaseRequests += 1
    return route.fulfill({
      status: params.responseStatus,
      contentType: "application/json",
      body: JSON.stringify(params.responseBody),
    })
  })

  await params.page.goto(
    `chrome-extension://${params.extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ABOUT}`,
  )
  await waitForExtensionRoot(params.page)
  await expectPermissionOnboardingHidden(params.page)

  const panel = params.page.getByTestId(
    RELEASE_UPDATE_STATUS_PANEL_TEST_IDS.panel,
  )
  await expect(panel).toBeVisible()

  await panel
    .getByTestId(RELEASE_UPDATE_STATUS_PANEL_TEST_IDS.checkNowButton)
    .click()

  return () => githubReleaseRequests
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("checks for a GitHub release update from the About page", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const readGithubReleaseRequests = await openAboutPageAndCheckForReleaseUpdate(
    {
      context,
      extensionId,
      page,
      responseStatus: 200,
      responseBody: {
        tag_name: "v9.9.9",
        html_url: LATEST_RELEASE_URL,
      },
    },
  )
  const panel = page.getByTestId(RELEASE_UPDATE_STATUS_PANEL_TEST_IDS.panel)

  await expect(
    panel.getByText("A newer version is available to upgrade"),
  ).toBeVisible()
  await expect(panel.getByText("Latest stable: v9.9.9")).toBeVisible()
  await expect(
    panel.getByTestId(RELEASE_UPDATE_STATUS_PANEL_TEST_IDS.primaryAction),
  ).toHaveAttribute("href", LATEST_RELEASE_URL)

  await expect
    .poll(readGithubReleaseRequests, {
      message: "manual check should call the GitHub latest-release API",
    })
    .toBeGreaterThanOrEqual(1)

  await expect
    .poll(() => readReleaseUpdateStatus(serviceWorker), {
      message:
        "manual check should persist the latest release metadata through the background service",
    })
    .toEqual(
      expect.objectContaining({
        eligible: true,
        reason: "chromium-development",
        latestVersion: "9.9.9",
        updateAvailable: true,
        releaseUrl: LATEST_RELEASE_URL,
        lastError: null,
      }),
    )
})

test("shows a failed GitHub release check from the About page", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const readGithubReleaseRequests = await openAboutPageAndCheckForReleaseUpdate(
    {
      context,
      extensionId,
      page,
      responseStatus: 503,
      responseBody: { message: "Service unavailable" },
    },
  )
  const panel = page.getByTestId(RELEASE_UPDATE_STATUS_PANEL_TEST_IDS.panel)

  await expect(
    panel.getByText(
      "Check failed, so the latest stable release could not be retrieved",
    ),
  ).toBeVisible()
  await expect(panel.getByText("Latest stable: unavailable")).toBeVisible()

  await expect
    .poll(readGithubReleaseRequests, {
      message: "manual check should call the GitHub latest-release API",
    })
    .toBeGreaterThanOrEqual(1)

  await expect
    .poll(() => readReleaseUpdateStatus(serviceWorker), {
      message:
        "manual check failure should persist the release-check error through the background service",
    })
    .toEqual(
      expect.objectContaining({
        eligible: true,
        reason: "chromium-development",
        latestVersion: null,
        updateAvailable: false,
        lastError: "GitHub release request failed with HTTP 503",
      }),
    )
})
