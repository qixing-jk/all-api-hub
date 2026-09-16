import type { Locator, Page } from "@playwright/test"

import {
  OPTIONS_PAGE_PATH,
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { THEME_ATTRIBUTES } from "~/constants/theme"
import { CONTENT_UI_HOST_TAG } from "~/entrypoints/content/shared/contentUi"
import { WEB_AI_API_CHECK_TEST_IDS } from "~/entrypoints/content/webAiApiCheck/testIds"
import { getAccountManagementListItemTestId } from "~/features/AccountManagement/testIds"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  closeExtensionViews,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"

test.use({ actionTimeout: 10_000 })

/** Fixed input heights must fit their line box; wrapping actions must fit all lines. */
async function expectControlsToFit(scope: Locator) {
  const clipped = await scope
    .locator(
      'input, [data-slot="button"]:not([data-size^="icon"]), [data-slot="select-trigger"]',
    )
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const rect = element.getBoundingClientRect()
        if (!rect.width || !rect.height) return []
        const style = getComputedStyle(element)
        const isInput = element instanceof HTMLInputElement
        if (
          isInput &&
          ["hidden", "radio", "checkbox", "range", "color"].includes(
            element.type,
          )
        )
          return []
        if (!isInput && !(element as HTMLElement).innerText.trim()) return []
        const contentHeight =
          rect.height -
          parseFloat(style.paddingTop) -
          parseFloat(style.paddingBottom) -
          parseFloat(style.borderTopWidth) -
          parseFloat(style.borderBottomWidth)
        const lineHeight = parseFloat(style.lineHeight)
        return (
          isInput
            ? contentHeight + 1 < lineHeight
            : element.scrollHeight > element.clientHeight + 1
        )
          ? [
              {
                label:
                  element.getAttribute("aria-label") ||
                  element.textContent?.trim(),
                contentHeight,
                lineHeight,
                height: rect.height,
                className: element.className,
              },
            ]
          : []
      }),
    )
  expect(clipped).toEqual([])
}

for (const hostRootSize of [10, 16, 20]) {
  for (const width of [390, 320]) {
    test(`large injected text stays inside the extension scope at ${width}px with ${hostRootSize}px host root`, async ({
      context,
      page,
      extensionId,
    }, testInfo) => {
      await forceExtensionLanguage(page, "en")
      await page.setViewportSize({ width, height: 900 })
      const worker = await getServiceWorker(context)
      await seedUserPreferences(worker, {
        language: "en",
        themeMode: "light",
        appearance: { density: "compact" },
        webAiApiCheck: {
          enabled: true,
          contextMenu: { enabled: true },
          autoDetect: { enabled: false },
        },
      })
      const url = "https://text-size.example.test/console"
      await context.route(url, (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><html lang="en" style="font-size:${hostRootSize}px"><body style="font-size:19px;line-height:1.8"><p id="host-text">Host page text stays unchanged</p></body></html>`,
        }),
      )
      await page.goto(url)
      const hostBefore = await page
        .locator("#host-text")
        .evaluate((element) => ({
          font: getComputedStyle(element).fontSize,
          line: getComputedStyle(element).lineHeight,
          html: getComputedStyle(document.documentElement).fontSize,
          body: getComputedStyle(document.body).fontSize,
        }))
      await expect
        .poll(() =>
          worker.evaluate(
            async ({ url, action }) => {
              const tabs = await chrome.tabs.query({})
              const tab = tabs.find((entry) => entry.url === url)
              if (tab?.id == null) return false
              return new Promise<boolean>((resolve) =>
                chrome.tabs.sendMessage(
                  tab.id!,
                  {
                    action,
                    pageUrl: url,
                    selectionText:
                      "base_url=https://api.example.test\napi_key=sk-text-size-fixture",
                  },
                  () => {
                    const error = chrome.runtime.lastError?.message
                    resolve(!error || error.includes("message port closed"))
                  },
                ),
              )
            },
            { url, action: RuntimeActionIds.ApiCheckContextMenuTrigger },
          ),
        )
        .toBe(true)
      const contentHost = page.locator(CONTENT_UI_HOST_TAG)
      const modal = contentHost.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)
      await expect(modal).toBeVisible()
      const options = await context.newPage()
      await forceExtensionLanguage(options, "en")
      await options.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#basic`,
      )
      for (const [label, textSize, font] of [
        ["Large", "large", "18px"],
        ["Extra large", "extra-large", "20px"],
      ]) {
        await options
          .locator(`#${SETTINGS_ANCHORS.APPEARANCE_TEXT_SIZE}`)
          .getByRole("radio", { name: label, exact: true })
          .locator("..")
          .click()
        await expect(
          contentHost.locator(`[${THEME_ATTRIBUTES.TEXT_SIZE}]`),
        ).toHaveAttribute(THEME_ATTRIBUTES.TEXT_SIZE, textSize)
        await expect(
          modal.getByRole("textbox", { name: "Base URL", exact: true }),
        ).toHaveCSS("font-size", font)
        await page.bringToFront()
        await expectControlsToFit(modal)
        expect(
          await page.locator("#host-text").evaluate((element) => ({
            font: getComputedStyle(element).fontSize,
            line: getComputedStyle(element).lineHeight,
            html: getComputedStyle(document.documentElement).fontSize,
            body: getComputedStyle(document.body).fontSize,
          })),
        ).toEqual(hostBefore)
        expect(
          await page.evaluate(
            (attribute) => [
              document.documentElement.hasAttribute(attribute),
              document.body.hasAttribute(attribute),
            ],
            THEME_ATTRIBUTES.TEXT_SIZE,
          ),
        ).toEqual([false, false])
      }
      const bounds = await modal.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      await page.screenshot({
        path: testInfo.outputPath(`content-extra-large-${width}.png`),
      })
      await options
        .locator(`#${SETTINGS_ANCHORS.APPEARANCE_TEXT_SIZE}`)
        .getByRole("button", { name: "Reset text size", exact: true })
        .click()
      await expect(
        modal.getByRole("textbox", { name: "Base URL", exact: true }),
      ).toHaveCSS("font-size", "16px")
      await modal.getByTestId(WEB_AI_API_CHECK_TEST_IDS.closeButton).click()
      await expect(modal).toBeHidden()
      await closeExtensionViews(context, page)
    })
  }
}

async function expectPageToFit(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await expectControlsToFit(page.locator("body"))
}

for (const width of [1280, 390, 320]) {
  test(`independent text sizes fit compact layouts and sync across ${width}px views`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    test.setTimeout(180_000)
    await forceExtensionLanguage(page, "en")
    await page.setViewportSize({ width, height: 900 })
    await stubLlmMetadataIndex(context)
    await stubNewApiSiteRoutes(context, {
      models: ["gpt-4o", "claude-sonnet-4"],
      initialTokens: [
        {
          id: 1,
          user_id: 1,
          key: "sk-text-size-example",
          status: 1,
          name: "Everyday development key",
          created_time: 1770000000,
          accessed_time: 1770000000,
          expired_time: -1,
          remain_quota: 0,
          unlimited_quota: true,
          model_limits_enabled: false,
          model_limits: "",
          allow_ips: "",
          used_quota: 0,
          group: "default",
        },
      ],
    })
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, { themeMode: "light" })
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: "text-size-account",
        site_name: "Everyday development account",
      }),
    ])
    const base = `chrome-extension://${extensionId}/`
    await page.goto(`${base}${OPTIONS_PAGE_PATH}#basic`)
    const popup = await context.newPage()
    const sidepanel = await context.newPage()
    for (const [view, path] of [
      [popup, POPUP_PAGE_PATH],
      [sidepanel, SIDEPANEL_PAGE_PATH],
    ] as const) {
      await view.setViewportSize({ width: Math.min(width, 390), height: 900 })
      await view.goto(`${base}${path}`)
    }
    await page.bringToFront()
    const density = page.locator(`#${SETTINGS_ANCHORS.APPEARANCE_DENSITY}`)
    const textSize = page.locator(`#${SETTINGS_ANCHORS.APPEARANCE_TEXT_SIZE}`)
    const preview = page.getByRole("region", { name: "Preview", exact: true })
    const accountName = preview.getByText("Example account", { exact: true })
    const supportingText = preview.getByText(
      "Today's usage $8.20 · Updated just now",
    )
    await expect(accountName).toHaveCSS("font-size", "16px")
    await expect(accountName).toHaveCSS("line-height", "24px")
    await expect(supportingText).toHaveCSS("font-size", "12px")
    await expect(preview.getByRole("textbox")).toHaveCSS("height", "36px")
    const rootFont = await page
      .locator("html")
      .evaluate((element) => getComputedStyle(element).fontSize)
    await density
      .getByRole("radio", { name: "Compact", exact: true })
      .locator("..")
      .click()
    await expect(page.locator("html")).toHaveAttribute(
      THEME_ATTRIBUTES.DENSITY,
      "compact",
    )
    const previewPadding = await preview.evaluate(
      (element) => getComputedStyle(element).paddingTop,
    )
    for (const [label, value, font, line, supportingFont] of [
      ["Large", "large", "18px", "28px", "14px"],
      ["Extra large", "extra-large", "20px", "32px", "16px"],
    ]) {
      await textSize
        .getByRole("radio", { name: label, exact: true })
        .locator("..")
        .click()
      for (const view of [page, popup, sidepanel]) {
        await expect(view.locator("html")).toHaveAttribute(
          THEME_ATTRIBUTES.TEXT_SIZE,
          value,
        )
        await expect(view.locator("html")).toHaveAttribute(
          THEME_ATTRIBUTES.DENSITY,
          "compact",
        )
        await expect(view.locator("body")).toHaveCSS(
          "font-size",
          supportingFont,
        )
        await expect(view.locator("html")).toHaveCSS("font-size", rootFont)
      }
      await expect(accountName).toHaveCSS("font-size", font)
      await expect(accountName).toHaveCSS("line-height", line)
      await expect(supportingText).toHaveCSS("font-size", supportingFont)
      await expect(preview).toHaveCSS("padding-top", previewPadding)
      await expectPageToFit(page)
    }
    await expect
      .poll(
        async () => (await preview.getByRole("textbox").boundingBox())!.height,
      )
      .toBeGreaterThan(32)
    await preview.screenshot({
      path: testInfo.outputPath(`compact-extra-large-preview-${width}.png`),
    })
    await page.reload()
    await expect(
      textSize.getByRole("radio", { name: "Extra large", exact: true }),
    ).toBeChecked()
    await page
      .locator(`#${SETTINGS_ANCHORS.APPEARANCE_PRESET}`)
      .getByRole("radio", { name: "Anthropic", exact: true })
      .locator("..")
      .click()
    await expect(
      textSize.getByRole("radio", { name: "Extra large", exact: true }),
    ).toBeChecked()

    // A portaled drawer inherits the same typography, supports keyboard selection,
    // and keeps its title clear of its close action on narrow screens.
    // The mobile header replaces its actions with search while scrolled down.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
    await page.getByRole("button", { name: /^Current:/ }).click()
    await page
      .getByRole("menuitem", { name: "Appearance settings", exact: true })
      .click()
    const drawer = page.getByRole("dialog", {
      name: "Appearance settings",
      exact: true,
    })
    const drawerTextSize = drawer.getByRole("group", {
      name: "Text size",
      exact: true,
    })
    await drawerTextSize
      .getByRole("radio", { name: "Extra large", exact: true })
      .focus()
    await page.keyboard.press("ArrowLeft")
    await expect(
      drawerTextSize.getByRole("radio", { name: "Large", exact: true }),
    ).toBeChecked()
    await page.keyboard.press("ArrowRight")
    await expect(
      drawerTextSize.getByRole("radio", { name: "Extra large", exact: true }),
    ).toBeChecked()
    await drawer
      .getByRole("radio", { name: "Dark", exact: true })
      .locator("..")
      .click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    const title = await drawer
      .locator('[data-slot="sheet-title"]')
      .boundingBox()
    const close = await drawer
      .getByRole("button", { name: "Close", exact: true })
      .boundingBox()
    expect(title!.x + title!.width).toBeLessThanOrEqual(close!.x)
    await expectControlsToFit(drawer)
    await drawer
      .getByRole("button", { name: "Reset density", exact: true })
      .click()
    await expect(popup.locator("html")).toHaveAttribute(
      THEME_ATTRIBUTES.TEXT_SIZE,
      "extra-large",
    )
    await expect(popup.locator("html")).toHaveAttribute(
      THEME_ATTRIBUTES.DENSITY,
      "default",
    )
    await drawer
      .getByRole("group", { name: "Interface density", exact: true })
      .getByRole("radio", { name: "Compact", exact: true })
      .locator("..")
      .click()
    await drawer.getByRole("button", { name: "Close", exact: true }).click()
    await expect(drawer).toBeHidden()

    // Exercise real lists, fields and menus, beyond the settings preview.
    for (const view of [page, popup, sidepanel]) {
      if (view === page) await view.goto(`${base}${OPTIONS_PAGE_PATH}#account`)
      await view.bringToFront()
      await expect(
        view.getByTestId(
          getAccountManagementListItemTestId("text-size-account"),
        ),
      ).toBeVisible()
      // Account metric captions use a nonstandard 10px baseline below sm.
      // They must follow text size too, including their responsive override.
      await expect(
        view
          .getByTestId(getAccountManagementListItemTestId("text-size-account"))
          .locator(".text-3xs")
          .first(),
      ).toHaveCSS(
        "font-size",
        view.viewportSize()!.width < 640 ? "14px" : "16px",
      )
      await expectPageToFit(view)
      await view.screenshot({
        path: testInfo.outputPath(
          `compact-extra-large-${view === page ? "options" : view === popup ? "popup" : "sidepanel"}-${width}.png`,
        ),
      })
    }
    await page.bringToFront()
    for (const route of [
      "models?accountId=text-size-account",
      "keys?accountId=text-size-account",
    ]) {
      await page.goto(`${base}${OPTIONS_PAGE_PATH}#${route}`)
      const row = route.startsWith("models")
        ? page
            .getByTestId(MODEL_LIST_TEST_IDS.modelDisplay)
            .locator('[data-slot="card"]')
            .first()
        : page.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeKeyRow).first()
      await expect(row).toBeVisible()
      await expectPageToFit(page)
      await page.screenshot({
        path: testInfo.outputPath(
          `compact-extra-large-${route.startsWith("models") ? "models" : "keys"}-${width}.png`,
        ),
      })
    }

    await page
      .getByRole("button", { name: "Open settings search", exact: true })
      .click()
    const search = page.getByRole("dialog", {
      name: "Search settings",
      exact: true,
    })
    await search.getByRole("combobox").fill("font size")
    await search.getByRole("option").filter({ hasText: "Text size" }).click()
    await expect(page).toHaveURL(/appearance-text-size/)
    await expect(textSize).toBeVisible()
    await textSize
      .getByRole("button", { name: "Reset text size", exact: true })
      .click()
    for (const view of [page, popup, sidepanel]) {
      await expect(view.locator("html")).toHaveAttribute(
        THEME_ATTRIBUTES.TEXT_SIZE,
        "default",
      )
      await expect(view.locator("html")).toHaveAttribute(
        THEME_ATTRIBUTES.DENSITY,
        "compact",
      )
    }
    await expect(accountName).toHaveCSS("font-size", "16px")
    await expect(preview.getByRole("textbox")).toHaveCSS("height", "32px")
    await page
      .getByRole("button", { name: "Reset appearance", exact: true })
      .click()
    await expect(page.locator("html")).toHaveAttribute(
      THEME_ATTRIBUTES.DENSITY,
      "default",
    )
    await expect(page.locator("html")).toHaveAttribute(
      THEME_ATTRIBUTES.TEXT_SIZE,
      "default",
    )
    // Unload the synchronized extension documents before browser shutdown.
    // Chrome 114 can otherwise leave a renderer alive after Browser.close.
    for (const view of [page, popup, sidepanel]) await view.goto("about:blank")
    await closeExtensionViews(context, page)
  })
}
