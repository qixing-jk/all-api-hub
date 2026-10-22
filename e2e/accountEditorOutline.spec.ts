import type { Locator, Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { SPONSOR_REMOTE_CATALOG_V5_URL } from "~/features/AccountManagement/sponsors/constants"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { ACCOUNT_STORAGE_KEYS } from "~/services/core/storageKeys"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { AuthTypeEnum, type AccountStorageConfig } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageJsonValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"
import sponsorCatalog from "~~/public/sponsor-catalog.v5.json" with { type: "json" }

async function chooseAccountSection(
  page: Page,
  navigation: Locator,
  name: string,
) {
  if (page.viewportSize()!.width < 640) {
    await navigation
      .getByRole("button", { name: /, Account settings sections$/ })
      .click()
    await page.getByRole("menuitem", { name, exact: true }).click()
  } else {
    await navigation.getByRole("button", { name, exact: true }).click()
  }
}

async function expectAccountSection(
  page: Page,
  navigation: Locator,
  name: string,
) {
  if (page.viewportSize()!.width < 640) {
    await expect(
      navigation.getByRole("button", {
        name: `${name}, Account settings sections`,
        exact: true,
      }),
    ).toContainText(name)
  } else {
    await expect(
      navigation.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-current", "location")
  }
}

test("failed account detection keeps recovery readable on narrow screens", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  installExtensionPageGuards(page, {
    ignoreConsoleError: (message) =>
      message.location().url.startsWith("https://unsupported.example/") &&
      message.text().includes("404 (Not Found)"),
  })
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await context.route(SPONSOR_REMOTE_CATALOG_V5_URL, (route) =>
    route.fulfill({ json: sponsorCatalog }),
  )
  await context.route("https://unsupported.example/**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/html",
      body: "Unsupported site",
    }),
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    preferencesVersion: DEFAULT_PREFERENCES.preferencesVersion,
    openChangelogOnUpdate: false,
  })
  await seedStoredAccounts(worker, [])
  await page.setViewportSize({ width: 360, height: 700 })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
  const dialog = page.getByRole("dialog")
  await dialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput)
    .fill("https://unsupported.example")
  await dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton).click()
  const message = dialog.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectErrorMessage,
  )
  await expect(message).toBeVisible()
  await captureVisualViews({
    page,
    ready: message,
    id: "failed-detection",
    extensionDir,
  })
  for (const width of [1440, 768, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 700 })
    expect((await message.boundingBox())!.width).toBeGreaterThan(150)
    expect((await message.boundingBox())!.height).toBeLessThan(200)
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toHaveCount(0)
    const detect = (await dialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton)
      .boundingBox())!
    const manual = (await dialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.manualAddButton)
      .boundingBox())!
    expect(Math.abs(detect.y - manual.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(detect.width - manual.width)).toBeLessThanOrEqual(1)
    expect(
      await dialog
        .locator('[data-slot="modal-body"]')
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1)
  }
  await page.setViewportSize({ width: 360, height: 700 })
  const navigation = dialog.getByRole("navigation", {
    name: "Account settings sections",
  })
  await navigation.scrollIntoViewIfNeeded()
  await captureVisualViews({
    page,
    ready: navigation,
    id: "failed-detection-navigation",
    extensionDir,
  })
  expect(
    await navigation.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    ),
  ).toBeLessThanOrEqual(1)
  await chooseAccountSection(page, navigation, "Account Authentication")
  await expect(
    dialog.getByRole("heading", {
      name: "Account Authentication",
      exact: true,
    }),
  ).toBeFocused()
  await expectAccountSection(page, navigation, "Account Authentication")
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await expect(dialog).toBeHidden()
})

test("popup account recommendations precede general guidance", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await context.route(SPONSOR_REMOTE_CATALOG_V5_URL, (route) =>
    route.fulfill({ json: sponsorCatalog }),
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    preferencesVersion: DEFAULT_PREFERENCES.preferencesVersion,
    openChangelogOnUpdate: false,
  })
  await seedStoredAccounts(worker, [])
  await page.setViewportSize({ width: 480, height: 600 })
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
  const dialog = page.getByRole("dialog")
  const siteUrl = dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput)
  await siteUrl.fill("https://example.com")
  const sponsors = dialog.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations,
  )
  await expect(sponsors).toBeVisible()
  await captureVisualViews({
    page,
    ready: siteUrl,
    id: "popup-add-entry",
    extensionDir,
  })
  for (const width of [480, 390]) {
    await page.setViewportSize({ width, height: 600 })
    const help = dialog.getByRole("note", { name: "Auto Detect", exact: true })
    const sponsorBounds = (await sponsors.boundingBox())!
    const urlBounds = (await siteUrl.boundingBox())!
    expect(
      sponsorBounds.y - urlBounds.y - urlBounds.height,
    ).toBeLessThanOrEqual(16)
    expect((await help.boundingBox())!.y).toBeGreaterThanOrEqual(
      sponsorBounds.y + sponsorBounds.height,
    )
    const firstCard = (await sponsors
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendationCard)
      .first()
      .boundingBox())!
    const footer = (await dialog
      .locator('[data-slot="modal-body"] + div')
      .boundingBox())!
    expect(firstCard.y + firstCard.height).toBeLessThanOrEqual(footer.y)
    expect(
      await dialog
        .locator('[data-slot="modal-body"]')
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1)
  }
})

test("slow detection hint uses available width", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await context.route(SPONSOR_REMOTE_CATALOG_V5_URL, (route) =>
    route.fulfill({ json: sponsorCatalog }),
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    preferencesVersion: DEFAULT_PREFERENCES.preferencesVersion,
    openChangelogOnUpdate: false,
  })
  await seedStoredAccounts(worker, [])
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  // Hold the detection transport pending so the real slow-state timer can fire.
  await page.evaluate((action) => {
    const runtimes = new Set([
      globalThis.chrome?.runtime,
      (globalThis as typeof globalThis & { browser?: typeof chrome }).browser
        ?.runtime,
    ])
    for (const runtime of runtimes) {
      if (!runtime) continue
      const original = runtime.sendMessage.bind(runtime)
      Object.defineProperty(runtime, "sendMessage", {
        configurable: true,
        value: (message: { action?: string }) =>
          message?.action === action
            ? new Promise(() => {})
            : original(message),
      })
    }
  }, RuntimeActionIds.CookieInterceptorTrackUrl)
  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
  const dialog = page.getByRole("dialog")
  await dialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput)
    .fill("https://example.com")
  await dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton).click()
  const alert = dialog
    .getByRole("alert")
    .filter({ hasText: "Auto-detect is taking longer" })
  await expect(alert).toBeVisible({ timeout: 15_000 })
  const help = alert.getByRole("button", {
    name: "Troubleshooting guide",
    exact: true,
  })
  const message = alert.locator("p")
  await captureVisualViews({
    page,
    ready: help,
    id: "slow-detection",
    extensionDir,
  })
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    const textBounds = (await message.boundingBox())!
    const buttonBounds = (await help.boundingBox())!
    if (width >= 768) {
      expect(buttonBounds.x).toBeGreaterThan(textBounds.x + textBounds.width)
      expect(
        Math.abs(
          buttonBounds.y +
            buttonBounds.height / 2 -
            textBounds.y -
            textBounds.height / 2,
        ),
      ).toBeLessThanOrEqual(1)
    } else {
      expect(buttonBounds.y).toBeGreaterThanOrEqual(
        textBounds.y + textBounds.height,
      )
    }
    expect(
      await alert.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    ).toBeLessThanOrEqual(1)
  }
  const opened = context.waitForEvent("page")
  await help.click()
  await expect.poll(async () => (await opened).url()).toContain("auto-detect")
})

for (const siteType of [SITE_TYPES.NEW_API, SITE_TYPES.CUBENCE]) {
  test(`account editor cookie layout ${siteType}`, async ({
    context,
    page,
    extensionId,
    extensionDir,
  }) => {
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
      preferencesVersion: DEFAULT_PREFERENCES.preferencesVersion,
      openChangelogOnUpdate: false,
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        pretriggerDailyOnUiOpen: false,
      },
    })
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: "cookie-outline",
        site_name: "Cookie example",
        site_type: siteType,
        authType: AuthTypeEnum.Cookie,
        cookieAuth: {
          sessionCookie:
            siteType === SITE_TYPES.CUBENCE
              ? ""
              : "session=fixture-session-cookie",
        },
      }),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
    )
    await waitForExtensionRoot(page)
    const row = page.getByTestId(
      getAccountManagementListItemTestId("cookie-outline"),
    )
    await row.hover()
    await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
    const dialog = page.getByRole("dialog")
    const navigation = dialog.getByRole("navigation", {
      name: "Account settings sections",
    })
    await chooseAccountSection(page, navigation, "Account Authentication")
    const cookie = dialog.getByRole("textbox", {
      name: /^Session Cookie/,
    })
    await expect(cookie).toBeVisible()
    if (siteType === SITE_TYPES.CUBENCE) {
      await expect(cookie).toHaveJSProperty("required", false)
    } else {
      await expect(cookie).toHaveJSProperty("required", true)
    }
    await captureVisualViews({
      page,
      ready: cookie,
      id: `cookie-${siteType}`,
      extensionDir,
    })
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await chooseAccountSection(page, navigation, "Account Authentication")
      await expect(cookie).toBeVisible()
      const body = dialog.locator('[data-slot="modal-body"]')
      expect(
        await body.evaluate(
          (element) => element.scrollWidth - element.clientWidth,
        ),
      ).toBeLessThanOrEqual(1)
      const importButton = dialog.getByRole("button", {
        name: "Import from current login",
        exact: true,
      })
      await expect(importButton).toBeVisible()
      if (width === 1440) {
        const fieldBounds = await cookie.boundingBox()
        const importBounds = await importButton.boundingBox()
        expect(importBounds!.width).toBeLessThan(fieldBounds!.width / 2)
      }
    }
    await cookie.fill("session=edited-cookie")
    await dialog
      .getByRole("button", { name: "Save Changes", exact: true })
      .click()
    await expect(dialog).toBeHidden()
    await expect
      .poll(async () => {
        const stored = await getPlasmoStorageJsonValue<AccountStorageConfig>(
          worker,
          ACCOUNT_STORAGE_KEYS.ACCOUNTS,
        )
        return stored?.accounts.find(
          (account) => account.id === "cookie-outline",
        )?.cookieAuth?.sessionCookie
      })
      .toBe("session=edited-cookie")
  })
}

test("account editor continuous outline", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    preferencesVersion: DEFAULT_PREFERENCES.preferencesVersion,
    openChangelogOnUpdate: false,
    autoCheckin: {
      ...DEFAULT_PREFERENCES.autoCheckin!,
      pretriggerDailyOnUiOpen: false,
    },
  })
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "outline-account",
      site_name: "Outline example",
      notes: "Existing account note",
    }),
  ])
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  const row = page.getByTestId(
    getAccountManagementListItemTestId("outline-account"),
  )
  await row.hover()
  await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput),
  ).toHaveValue("Outline example")
  await captureVisualViews({
    page,
    ready: dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput),
    id: "account-editor",
    extensionDir,
  })

  const navigation = dialog.getByRole("navigation", {
    name: "Account settings sections",
  })
  const body = dialog.locator('[data-slot="modal-body"]')
  const save = dialog.getByRole("button", { name: "Save Changes", exact: true })
  const guidance = dialog.getByRole("note", {
    name: "Editing help",
    exact: true,
  })
  const siteName = dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput)
  const notes = dialog.getByPlaceholder("Optional, enter notes")
  await expect(navigation.getByRole("button")).toHaveCount(5)
  for (const entry of await navigation.getByRole("button").all()) {
    const sectionId = await entry.getAttribute("aria-controls")
    const heading = dialog.locator(`#${sectionId}`).getByRole("heading").first()
    expect(await heading.locator("svg").innerHTML()).toBe(
      await entry.locator("svg").innerHTML(),
    )
  }
  const userIdIconSpacing = await dialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.userIdInput)
    .evaluate((input) => {
      const icon = input.parentElement!.querySelector("svg")!
      const iconBounds = icon.getBoundingClientRect()
      return {
        width: iconBounds.width,
        gap:
          input.getBoundingClientRect().left +
          parseFloat(getComputedStyle(input).paddingLeft) -
          iconBounds.right,
      }
    })
  expect(userIdIconSpacing.width).toBe(20)
  expect(userIdIconSpacing.gap).toBe(8)
  await siteName.fill("Edited outline account")

  await page.emulateMedia({ reducedMotion: "no-preference" })
  const balanceEntry = navigation.getByRole("button", {
    name: "Balance & Stats",
    exact: true,
  })
  const balanceDestination = await body.evaluate((scroller) => {
    const target = scroller.querySelector("#account-form-balance")!
    return Math.min(
      scroller.scrollHeight - scroller.clientHeight,
      scroller.scrollTop +
        target.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        12,
    )
  })
  await balanceEntry.click()
  await expect(balanceEntry).toHaveAttribute("aria-current", "location")
  await expect
    .poll(async () =>
      Math.abs(
        (await body.evaluate((element) => element.scrollTop)) -
          balanceDestination,
      ),
    )
    .toBeLessThanOrEqual(1)
  await expect(balanceEntry).toHaveAttribute("aria-current", "location")
  await balanceEntry.click()
  await expect(balanceEntry).toHaveAttribute("aria-current", "location")
  const balanceSection = dialog.locator("#account-form-balance")
  const menuSelection = await balanceEntry.evaluate((element) => ({
    shadow: getComputedStyle(element).boxShadow,
    border: getComputedStyle(element).borderLeftWidth,
    hasMarker: [...element.children].some(
      (child) => getComputedStyle(child).position === "absolute",
    ),
  }))
  expect(menuSelection).toEqual({
    shadow: "none",
    border: "0px",
    hasMarker: false,
  })
  const feedback = balanceSection.locator("[data-navigation-feedback]")
  const outerFeedback = await balanceSection.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const heading = element.querySelector("h3")!.getBoundingClientRect()
    return {
      feedbackBounds: (() => {
        const feedback = element.querySelector("[data-navigation-feedback]")!
        const feedbackBounds = feedback.getBoundingClientRect()
        return {
          width: feedbackBounds.width - element.clientWidth,
          height: feedbackBounds.height - element.clientHeight,
          shadow: getComputedStyle(feedback).boxShadow,
          radius: getComputedStyle(feedback).borderTopLeftRadius,
        }
      })(),
      leftInset: heading.left - bounds.left,
      nextGap:
        element.nextElementSibling!.getBoundingClientRect().top - bounds.bottom,
    }
  })
  expect(outerFeedback.feedbackBounds.width).toBe(0)
  expect(outerFeedback.feedbackBounds.height).toBe(0)
  expect(outerFeedback.feedbackBounds.shadow).not.toBe("none")
  expect(outerFeedback.feedbackBounds.radius).not.toBe("0px")
  expect(outerFeedback.leftInset).toBe(12)
  expect(Math.abs(outerFeedback.nextGap)).toBeLessThanOrEqual(1)
  expect(
    await balanceSection.evaluate(
      (element) => getComputedStyle(element).borderTopLeftRadius,
    ),
  ).toBe("0px")
  expect(
    await balanceSection.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).toBe("rgba(0, 0, 0, 0)")
  expect(
    await feedback.evaluate((element) =>
      Number(getComputedStyle(element).opacity),
    ),
  ).toBeGreaterThan(0)
  await expect(feedback).toHaveCSS("opacity", "0")
  await expect(balanceEntry).toHaveAttribute("aria-current", "location")
  await body.hover()
  await page.mouse.wheel(0, 4000)
  await expectAccountSection(page, navigation, "Tags & Notes")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await chooseAccountSection(page, navigation, "Site Information")

  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(siteName).toHaveValue("Edited outline account")
    await chooseAccountSection(page, navigation, "Tags & Notes")
    await expectAccountSection(page, navigation, "Tags & Notes")
    await expect(
      dialog.getByRole("heading", { name: "Tags & Notes", exact: true }),
    ).toBeFocused()
    const targetFeedback = await dialog
      .locator("#account-form-tags-notes [data-navigation-feedback]")
      .evaluate((element) => Number(getComputedStyle(element).opacity))
    expect(targetFeedback).toBeGreaterThan(0)
    await page.setViewportSize({
      width: width === 1440 ? 390 : 1440,
      height: 880,
    })
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    )
    await expectAccountSection(page, navigation, "Tags & Notes")
    await page.setViewportSize({ width, height: 900 })
    await chooseAccountSection(page, navigation, "Tags & Notes")
    const headingBounds = await dialog
      .getByRole("heading", { name: "Tags & Notes", exact: true })
      .boundingBox()
    const navigationBounds = await navigation.boundingBox()
    if (width < 1024)
      expect(headingBounds!.y).toBeGreaterThanOrEqual(
        navigationBounds!.y + navigationBounds!.height,
      )
    await expect(guidance).toBeInViewport()
    expect(
      await guidance.evaluate((element) => !!element.closest("aside")),
    ).toBe(width >= 1024)
    await expect(save).toBeInViewport()
    expect(
      await body.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    const bounds = await navigation.boundingBox()
    const bodyBounds = await body.boundingBox()
    const bodyPadding = await body.evaluate((element) =>
      parseFloat(getComputedStyle(element).paddingTop),
    )
    expect(bounds!.y).toBeGreaterThanOrEqual(bodyBounds!.y - 1)
    expect(bounds!.y).toBeLessThanOrEqual(bodyBounds!.y + bodyPadding + 1)
    if (width < 1024) {
      const stickyCoverage = await navigation.evaluate((element) => {
        const bar = element.closest("aside")!
        const scroller = element.closest('[data-slot="modal-body"]')!
        const body = scroller.getBoundingClientRect()
        const bounds = bar.getBoundingClientRect()
        const covered = [
          body.left + 2,
          (body.left + body.right) / 2,
          body.right - 2,
        ].every((x) => bar.contains(document.elementFromPoint(x, body.top + 2)))
        return {
          topGap: bounds.top - body.top,
          leftGap: bounds.left - body.left,
          rightGap: body.right - bounds.right,
          covered,
          background: getComputedStyle(bar).backgroundColor,
        }
      })
      expect(Math.abs(stickyCoverage.topGap)).toBeLessThanOrEqual(1)
      expect(Math.abs(stickyCoverage.leftGap)).toBeLessThanOrEqual(1)
      expect(Math.abs(stickyCoverage.rightGap)).toBeLessThanOrEqual(1)
      expect(stickyCoverage.covered).toBe(true)
      expect(stickyCoverage.background).not.toBe("rgba(0, 0, 0, 0)")
    }
    await chooseAccountSection(page, navigation, "Account Authentication")
    const authHelp = dialog.getByRole("button", {
      name: /^Prefer access tokens\./,
    })
    if (width === 768) await authHelp.hover()
    else await authHelp.focus()
    const authTooltip = dialog.getByRole("tooltip")
    await expect(authTooltip).toBeVisible()
    if (width === 1440) {
      await captureVisualViews({
        page,
        ready: authTooltip,
        id: "account-auth-help",
        extensionDir,
      })
    }
    const tooltipLayout = await authTooltip.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        width: bounds.width,
        left: bounds.left,
        right: bounds.right,
        maxWidth: style.maxWidth,
        whiteSpace: style.whiteSpace,
      }
    })
    expect(
      tooltipLayout.width,
      JSON.stringify(tooltipLayout),
    ).toBeLessThanOrEqual(Math.min(360, width - 16))
    expect(tooltipLayout.left).toBeGreaterThanOrEqual(0)
    expect(tooltipLayout.right).toBeLessThanOrEqual(width)
    expect(
      await body.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    ).toBeLessThanOrEqual(1)
    if (width < 1024) {
      const authBounds = await dialog
        .getByRole("heading", { name: "Account Authentication", exact: true })
        .boundingBox()
      const navBounds = await navigation.boundingBox()
      expect(authBounds!.y).toBeGreaterThanOrEqual(
        navBounds!.y + navBounds!.height,
      )
    }
    await chooseAccountSection(page, navigation, "Site Information")
    await expect(authTooltip).toBeHidden()
    await expect(siteName).toBeInViewport()
  }
  await page.setViewportSize({ width: 1440, height: 600 })
  await chooseAccountSection(page, navigation, "Tags & Notes")
  await expect(guidance).toBeInViewport()
  expect(await guidance.evaluate((element) => !!element.closest("aside"))).toBe(
    false,
  )
  await captureVisualViews({
    page,
    ready: guidance,
    id: "account-editor-guidance",
    extensionDir,
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  expect((await dialog.boundingBox())!.width).toBeGreaterThan(900)
  const cancelBounds = await dialog
    .getByRole("button", { name: "Cancel", exact: true })
    .boundingBox()
  const redetectBounds = await dialog
    .getByRole("button", { name: "Re-detect", exact: true })
    .boundingBox()
  const saveBounds = await save.boundingBox()
  expect(saveBounds!.width).toBeLessThan(200)
  expect(redetectBounds!.width).toBeLessThan(200)
  expect(cancelBounds!.x + cancelBounds!.width + 200).toBeLessThan(
    redetectBounds!.x,
  )
  expect(redetectBounds!.x + redetectBounds!.width).toBeLessThan(saveBounds!.x)
  const asideBounds = await dialog.locator("aside").boundingBox()
  const lastSectionBounds = await dialog
    .locator("#account-form-tags-notes")
    .boundingBox()
  expect(
    Math.abs(
      asideBounds!.y +
        asideBounds!.height -
        lastSectionBounds!.y -
        lastSectionBounds!.height,
    ),
  ).toBeLessThan(2)
  const identity = dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.usernameInput)
  expect((await identity.boundingBox())!.y).toBe(
    (await siteName.boundingBox())!.y,
  )

  await body.dispatchEvent("wheel")
  await body.evaluate((element) => {
    const auth = element.querySelector("#account-form-auth")!
    element.scrollTop +=
      auth.getBoundingClientRect().top -
      element.getBoundingClientRect().top -
      12
  })
  await expect(
    navigation.getByRole("button", {
      name: "Account Authentication",
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "location")
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expectAccountSection(page, navigation, "Tags & Notes")
  await chooseAccountSection(page, navigation, "Tags & Notes")
  const highlightedSection = dialog.locator("#account-form-tags-notes")
  if (process.env.AAH_VISUAL_CAPTURE_DIR) {
    await highlightedSection.evaluate((section) => {
      for (const animation of section.getAnimations({ subtree: true })) {
        animation.pause()
        animation.currentTime = 300
      }
    })
  }
  await captureVisualViews({
    page,
    ready: dialog.getByRole("heading", { name: "Tags & Notes", exact: true }),
    id: "account-navigation-target",
    extensionDir,
    animations: "allow",
  })
  await highlightedSection.evaluate((section) =>
    section
      .getAnimations({ subtree: true })
      .forEach((animation) => animation.play()),
  )
  await notes.fill("Edited note retained across sections")
  await captureVisualViews({
    page,
    ready: notes,
    id: "account-editor-bottom",
    extensionDir,
  })
  await chooseAccountSection(page, navigation, "Site Information")
  await expect(siteName).toHaveValue("Edited outline account")
  await save.click()
  await expect(dialog).toBeHidden()
  await expect
    .poll(async () => {
      const stored = await getPlasmoStorageJsonValue<AccountStorageConfig>(
        worker,
        ACCOUNT_STORAGE_KEYS.ACCOUNTS,
      )
      const account = stored?.accounts.find(
        (account) => account.id === "outline-account",
      )
      return {
        name: account?.site_name,
        notes: account?.notes,
        token: account?.account_info.access_token,
      }
    })
    .toEqual({
      name: "Edited outline account",
      notes: "Edited note retained across sections",
      token: "e2e-token",
    })
  await row.hover()
  await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
  await expect(siteName).toHaveValue("Edited outline account")
  await chooseAccountSection(page, navigation, "Tags & Notes")
  await expect(notes).toHaveValue("Edited note retained across sections")
  await notes.fill("Cancelled draft")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await row.hover()
  await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
  await chooseAccountSection(page, navigation, "Tags & Notes")
  await expect(notes).toHaveValue("Edited note retained across sections")
})

test("account creation shared outline", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await context.route(SPONSOR_REMOTE_CATALOG_V5_URL, (route) =>
    route.fulfill({ json: sponsorCatalog }),
  )
  await stubNewApiSiteRoutes(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    preferencesVersion: DEFAULT_PREFERENCES.preferencesVersion,
    openChangelogOnUpdate: false,
    autoProvisionKeyOnAccountAdd: false,
    autoCheckin: {
      ...DEFAULT_PREFERENCES.autoCheckin!,
      pretriggerDailyOnUiOpen: false,
    },
  })
  await seedStoredAccounts(worker, [])
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
  const dialog = page.getByRole("dialog")
  const siteUrl = dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput)
  await siteUrl.fill("https://example.com")
  const sponsors = dialog.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations,
  )
  await expect(sponsors).toBeVisible()
  await captureVisualViews({
    page,
    ready: siteUrl,
    id: "account-add-entry",
    extensionDir,
  })
  const entryBody = dialog.locator('[data-slot="modal-body"]')
  const sponsorHeading = sponsors.getByRole("heading", {
    name: "Recommended providers",
    exact: true,
  })
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(siteUrl).toHaveValue("https://example.com")
    const inputBounds = (await siteUrl.boundingBox())!
    const entryHelp = dialog.getByRole("note", {
      name: "Auto Detect",
      exact: true,
    })
    await expect(entryHelp).toBeVisible()
    const helpBounds = (await entryHelp.boundingBox())!
    const authBounds = (await dialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.authTypeTrigger)
      .boundingBox())!
    expect(helpBounds.y).toBeGreaterThanOrEqual(
      Math.max(
        inputBounds.y + inputBounds.height,
        authBounds.y + authBounds.height,
      ),
    )
    expect(Math.abs(helpBounds.x - inputBounds.x)).toBeLessThanOrEqual(1)
    expect(helpBounds.width).toBeGreaterThanOrEqual(
      (await entryBody.boundingBox())!.width - (width >= 640 ? 48 : 32) - 1,
    )
    await expect(entryHelp).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
    const sponsorBounds = (await sponsors.boundingBox())!
    expect(helpBounds.y).toBeGreaterThanOrEqual(
      sponsorBounds.y + sponsorBounds.height,
    )
    const discoveryLink = dialog.getByRole("button", {
      name: "Open LDOH site list",
      exact: true,
    })
    expect((await discoveryLink.boundingBox())!.y).toBeGreaterThan(
      sponsorBounds.y + sponsorBounds.height,
    )

    const cards = sponsors.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendationCard,
    )
    const firstCard = (await cards.nth(0).boundingBox())!
    const secondCard = (await cards.nth(1).boundingBox())!
    if (width >= 1024) {
      expect(Math.abs(firstCard.y - secondCard.y)).toBeLessThanOrEqual(1)
      expect(secondCard.x).toBeGreaterThan(firstCard.x + firstCard.width)
    } else {
      expect(secondCard.y).toBeGreaterThan(firstCard.y + firstCard.height)
    }
    expect((await sponsorHeading.boundingBox())!.width).toBeGreaterThan(100)
    expect(
      await entryBody.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toHaveCount(0)
    const manual = dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.manualAddButton,
    )
    const detect = dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton,
    )
    await expect(detect).toBeInViewport()
    await expect(manual).toBeInViewport()
    const detectBounds = (await detect.boundingBox())!
    const manualBounds = (await manual.boundingBox())!
    expect(Math.abs(detectBounds.y - manualBounds.y)).toBeLessThanOrEqual(1)
    expect(detectBounds.x + detectBounds.width).toBeLessThan(manualBounds.x)
    expect(
      Math.abs(detectBounds.width - manualBounds.width),
    ).toBeLessThanOrEqual(1)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.manualAddButton).click()
  const siteName = dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput)
  await expect(siteName).toBeVisible()
  const navigation = dialog.getByRole("navigation", {
    name: "Account settings sections",
  })
  await expect(navigation).toBeVisible()
  await expect(navigation.getByRole("button")).toHaveCount(5)
  await chooseAccountSection(page, navigation, "Site Information")
  await captureVisualViews({
    page,
    ready: dialog.getByRole("heading", {
      name: "Site Information",
      exact: true,
    }),
    id: "account-add-form",
    extensionDir,
  })
  await expect(sponsors).toHaveCount(0)
  await expect(dialog.locator("#account-form-site-info")).toContainText(
    "Site URL",
  )
  await siteName.fill("Added outline account")
  await dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteTypeTrigger).click()
  await page
    .getByRole("option", { name: SITE_TYPES.NEW_API, exact: true })
    .click()
  await dialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.usernameInput)
    .fill("e2e-user")
  await dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.userIdInput).fill("1")
  await chooseAccountSection(page, navigation, "Account Authentication")
  await dialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput)
    .fill("e2e-token")
  const body = dialog.locator('[data-slot="modal-body"]')
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await chooseAccountSection(page, navigation, "Tags & Notes")
    await expect(
      dialog.getByRole("heading", { name: "Tags & Notes", exact: true }),
    ).toBeFocused()
    await expectAccountSection(page, navigation, "Tags & Notes")
    expect(
      await body.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    await expect(
      dialog.getByRole("note", { name: "Manual Add", exact: true }),
    ).toBeInViewport()
  }
  await dialog
    .getByPlaceholder("Optional, enter notes")
    .fill("Added with the shared outline")
  await page.setViewportSize({ width: 1440, height: 1000 })
  await chooseAccountSection(page, navigation, "Balance & Stats")
  await dialog.getByPlaceholder("Please enter exchange rate").fill("7")
  await captureVisualViews({
    page,
    ready: navigation,
    id: "account-add-filled",
    extensionDir,
  })
  await dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton).click()
  await expect(dialog).toBeHidden()
  await expect
    .poll(async () => {
      const stored = await getPlasmoStorageJsonValue<AccountStorageConfig>(
        worker,
        ACCOUNT_STORAGE_KEYS.ACCOUNTS,
      )
      return stored?.accounts.find(
        (account) => account.site_name === "Added outline account",
      )?.notes
    })
    .toBe("Added with the shared outline")
})
