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
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

const GITHUB_LATEST_RELEASE_API_URL =
  "https://api.github.com/repos/qixing-jk/all-api-hub/releases/latest"
const LATEST_RELEASE_URL =
  "https://github.com/qixing-jk/all-api-hub/releases/tag/v9.9.9"

/** Deterministic responses at the page's public release-update transport boundary. */
async function stubReleaseUpdateTransport(
  page: Page,
  status: ReleaseUpdateStatus,
) {
  await page.addInitScript((fixture) => {
    const runtime = globalThis.chrome?.runtime
    if (!runtime) return
    const send = runtime.sendMessage.bind(runtime)
    runtime.sendMessage = (...args: unknown[]) => {
      const message = args[0] as { type?: unknown } | undefined
      if (
        message?.type === "releaseUpdate:getStatus" ||
        message?.type === "releaseUpdate:checkNow"
      ) {
        const response = { res: { success: true, data: fixture } }
        const callback = args.find((arg) => typeof arg === "function")
        if (callback) {
          callback(response)
          return
        }
        return Promise.resolve(response)
      }
      return Reflect.apply(send, runtime, args)
    }
  }, status)
}

test("shows an unchecked release in a deterministic transport fixture", async ({
  page,
  extensionId,
  extensionDir,
}) => {
  await stubReleaseUpdateTransport(page, {
    distributionChannel: "local-development",
    reason: "chromium-development",
    eligible: true,
    currentVersion: "4.5.0",
    latestVersion: null,
    updateAvailable: false,
    checkedAt: null,
    lastError: null,
    releaseUrl: LATEST_RELEASE_URL,
    storeUpdate: { supported: false, status: "unsupported", version: null },
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ABOUT}`,
  )
  await waitForExtensionRoot(page)
  const panel = page.getByTestId(RELEASE_UPDATE_STATUS_PANEL_TEST_IDS.panel)
  await expect(panel.getByText("Current version: v4.5.0")).toBeVisible()
  await expect(
    panel.getByTestId(RELEASE_UPDATE_STATUS_PANEL_TEST_IDS.checkNowButton),
  ).toBeEnabled()
  await expect(panel.locator("details")).toHaveCount(0)
  await expect(panel.getByRole("link", { name: "Changelog" })).toHaveAttribute(
    "href",
    /changelog\.html/,
  )
  for (const width of [1280, 380]) {
    await page.setViewportSize({ width, height: 800 })
    const heading = await panel.getByRole("heading").boundingBox()
    const icon = await panel.locator('div[aria-hidden="true"]').boundingBox()
    expect(heading).not.toBeNull()
    expect(icon).not.toBeNull()
    const headingCenter = heading!.y + heading!.height / 2
    expect(
      Math.abs(headingCenter - (icon!.y + icon!.height / 2)),
    ).toBeLessThanOrEqual(1)
    if (width >= 640) {
      const check = await panel
        .getByTestId(RELEASE_UPDATE_STATUS_PANEL_TEST_IDS.checkNowButton)
        .boundingBox()
      expect(check).not.toBeNull()
      expect(
        Math.abs(headingCenter - (check!.y + check!.height / 2)),
      ).toBeLessThanOrEqual(1)
    }
  }
  await captureVisualViews({
    page,
    ready: panel,
    id: "unchecked",
    extensionDir,
  })
})

test("shows AMO availability without unrelated metadata in a deterministic transport fixture", async ({
  page,
  extensionId,
  extensionDir,
}) => {
  const status: ReleaseUpdateStatus = {
    distributionChannel: "firefox-amo",
    reason: "firefox-amo",
    eligible: true,
    currentVersion: "4.5.0",
    latestVersion: "4.6.0",
    githubLatestVersion: "4.7.0",
    updateAvailable: true,
    checkedAt: 1792141200000,
    lastError: null,
    releaseUrl:
      "https://addons.mozilla.org/firefox/addon/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D",
    storeUpdate: { supported: false, status: "unsupported", version: null },
  }
  await stubReleaseUpdateTransport(page, status)
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ABOUT}`,
  )
  await waitForExtensionRoot(page)
  const panel = page.getByTestId(RELEASE_UPDATE_STATUS_PANEL_TEST_IDS.panel)
  await expect(panel.getByText("Firefox Add-ons: v4.6.0")).toBeVisible()
  await expect(panel.getByText("GitHub stable: v4.7.0")).toHaveCount(0)
  await expect(panel.locator("details")).toHaveCount(0)
  await expect(
    panel.getByRole("link", { name: "Download update" }),
  ).toHaveAttribute("href", status.releaseUrl)
  await expect(panel.getByRole("button", { name: /reload/i })).toHaveCount(0)
  await panel.getByRole("button", { name: "Check for updates" }).click()
  await expect(panel.getByText("Firefox Add-ons: v4.6.0")).toBeVisible()
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Close", exact: true }),
  ).toHaveCount(0)
  await captureVisualViews({
    page,
    ready: panel,
    id: "amo-update",
    extensionDir,
  })
})

test("keeps the up-to-date panel concise and responsive", async ({
  page,
  extensionId,
  extensionDir,
}) => {
  const status: ReleaseUpdateStatus = {
    distributionChannel: "local-development",
    reason: "chromium-development",
    eligible: true,
    currentVersion: "4.5.0",
    latestVersion: "4.5.0",
    updateAvailable: false,
    checkedAt: 1792168800000,
    lastError: null,
    releaseUrl: "https://github.com/qixing-jk/all-api-hub/releases/latest",
    storeUpdate: { supported: false, status: "unsupported", version: null },
  }
  await stubReleaseUpdateTransport(page, status)
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ABOUT}`,
  )
  await waitForExtensionRoot(page)
  const panel = page.getByTestId(RELEASE_UPDATE_STATUS_PANEL_TEST_IDS.panel)
  await expect(panel.getByText("Current version: v4.5.0")).toBeVisible()
  await expect(panel.getByText("You’re up to date")).toBeVisible()
  await expect(panel.getByText("Latest stable: v4.5.0")).toHaveCount(0)
  await expect(panel.getByRole("link", { name: "Changelog" })).toHaveAttribute(
    "href",
    /changelog\.html/,
  )
  for (const width of [1280, 380]) {
    await page.setViewportSize({ width, height: 900 })
    await panel.scrollIntoViewIfNeeded()
    const current = await panel
      .getByText("Current version: v4.5.0")
      .boundingBox()
    const check = await panel
      .getByRole("button", { name: "Check for updates" })
      .boundingBox()
    expect(current).not.toBeNull()
    expect(check).not.toBeNull()
    if (width < 640) {
      expect(check!.y).toBeGreaterThanOrEqual(current!.y + current!.height)
    } else {
      expect(check!.x).toBeGreaterThanOrEqual(current!.x + current!.width)
    }
    expect(
      await panel.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    await expect(
      panel.getByRole("link", { name: "Changelog" }),
    ).toBeInViewport()
  }
  await captureVisualViews({
    page,
    ready: panel,
    id: "local-development",
    extensionDir,
  })
})

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

  await expect(panel.getByText("Update available")).toBeVisible()
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

  await expect(panel.getByText("Could not check for updates")).toBeVisible()
  await expect(panel.getByText("Latest stable: unavailable")).toHaveCount(0)

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
