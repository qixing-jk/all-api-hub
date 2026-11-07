import type { Page } from "@playwright/test"

import { ACCOUNT_MANAGEMENT_TEST_IDS as accounts } from "~/features/AccountManagement/testIds"
import enMessages from "~/locales/en/messages.json" with { type: "json" }
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { createExtensionWorkerEvaluator } from "~~/e2e/utils/extensionWorkerEvaluator"
import { assertAccountDetectionOutcome } from "~~/scripts/flows/auto-detect.mjs"

const SITE = "https://nano-gpt.com"

for (const signedIn of [true, false]) {
  test(`current-tab detection recovers an existing page after extension reload: ${signedIn ? "signed in without refreshing" : "signed out with accurate guidance"}`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    test.setTimeout(120000)
    await forceExtensionLanguage(page, "en")
    await page.setViewportSize({ width: 520, height: 960 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await stubLlmMetadataIndex(context)
    await context.route(`${SITE}/**`, async (route) => {
      expect(route.request().method()).toBe("GET")
      const pathname = new URL(route.request().url()).pathname
      if (pathname === "/api/auth/session")
        return route.fulfill({
          json: signedIn
            ? {
                user: {
                  id: "00000000-0000-4000-8000-0000000000a1",
                  name: "Reload Fixture",
                },
              }
            : {},
        })
      if (pathname === "/api/auth/local-session")
        return route.fulfill({
          json: signedIn
            ? { data: { nanoDepositAddress: "nano_reload_fixture" } }
            : {},
        })
      return route.fulfill({
        contentType: "text/html",
        body: "<html><title>NanoGPT</title><body>Reload fixture</body></html>",
      })
    })
    const site = await context.newPage()
    await site.goto(SITE)
    await site.evaluate(() => {
      ;(window as any).unsavedDraft = "preserve this draft"
    })
    const worker = await getServiceWorker(context)
    const settings = await context.newPage()
    await settings.goto("chrome://extensions/")
    const developerMode = settings.locator("extensions-toolbar #devMode")
    if (!(await developerMode.evaluate((element: any) => element.checked)))
      await developerMode.click()
    try {
      await worker
        .evaluate(() => (globalThis as any).chrome.runtime.reload())
        .catch((error) => {
          if (
            !/Execution context was destroyed|Target.*closed/i.test(
              error.message,
            )
          )
            throw error
        })
      await expect
        .poll(() =>
          settings.evaluate(
            (id) =>
              new Promise<boolean>((resolve) =>
                (globalThis as any).chrome.developerPrivate.getExtensionInfo(
                  id,
                  (info: { state?: string }) =>
                    resolve(info?.state === "ENABLED"),
                ),
              ),
            extensionId,
          ),
        )
        .toBe(true)
      const popup = await context.newPage()
      await forceExtensionLanguage(popup, "en")
      await popup.setViewportSize({ width: 520, height: 960 })
      await popup.emulateMedia({ reducedMotion: "reduce" })
      await popup.goto(`chrome-extension://${extensionId}/popup.html`)
      await createExtensionWorkerEvaluator(context, extensionId)
      await site.bringToFront()
      await popup
        .getByTestId(accounts.addAccountButton)
        .or(popup.getByTestId(accounts.emptyStateAddAccountButton))
        .first()
        .click()
      const dialog = popup.getByTestId(accounts.accountDialog)
      await expect(dialog.getByTestId(accounts.siteUrlInput)).toHaveValue(SITE)
      const opened: Page[] = []
      context.on("page", (newPage) => opened.push(newPage))
      await dialog.getByTestId(accounts.autoDetectButton).click()
      try {
        if (signedIn) {
          await assertAccountDetectionOutcome({
            page: popup,
            expectedType: "nanogpt",
            fields: {
              usernameInput: "Reload Fixture",
              userIdInput: "nano_reload_fixture",
              accessTokenInput: "",
            },
            saveState: "absent",
            guidance: "Complete NanoGPT credentials",
            timeoutMs: 45000,
          })
          expect(
            opened.map((entry) => entry.url()),
            "Recover the current page without opening a fallback page",
          ).toEqual([])
        } else {
          await expect(
            dialog.getByTestId(accounts.autoDetectErrorMessage),
          ).toHaveText(
            enMessages.operations.detection.getUserIdFailedDetailed,
            { timeout: 45000 },
          )
          await expect(
            dialog.getByText(enMessages.autodetect.currentTabNeedsReload),
          ).toHaveCount(0)
        }
        expect(await site.evaluate(() => (window as any).unsavedDraft)).toBe(
          "preserve this draft",
        )
      } finally {
        // Detection keeps the site tab active. Older Chrome may not paint the
        // background extension page for capture until it is brought forward.
        await popup.bringToFront()
        await popup.screenshot({
          path: testInfo.outputPath("current-tab-after-reload.png"),
          animations: "disabled",
        })
      }
    } finally {
      await settings.close()
    }
  })
}
