import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import enFeedback from "~/locales/en/accountDialog.json" with { type: "json" }
import enCheckin from "~/locales/en/autoCheckin.json" with { type: "json" }
import enCommon from "~/locales/en/common.json" with { type: "json" }
import zhFeedback from "~/locales/zh-CN/accountDialog.json" with { type: "json" }
import zhCheckin from "~/locales/zh-CN/autoCheckin.json" with { type: "json" }
import zhCommon from "~/locales/zh-CN/common.json" with { type: "json" }
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/compatibilityConfig"
import { STORAGE_LOCKS } from "~/services/core/storageKeys"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedAutoCheckinStatus,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
  type AutoCheckinAccountResultFixture,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageJsonValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

for (const language of ["zh-CN", "en"] as const) {
  test(`keeps result actions compact and available at every width (${language})`, async ({
    context,
    extensionId,
    page,
  }, testInfo) => {
    const copy = language === "en" ? enCheckin : zhCheckin
    const feedback = (language === "en" ? enFeedback : zhFeedback)
      .checkInFeedback
    const common = language === "en" ? enCommon : zhCommon
    const cases: {
      name: string
      result: AutoCheckinAccountResultFixture
      primary?: string
      external?: boolean
    }[] = [
      {
        name: "Failed Account",
        result: { status: "failed" },
        primary: copy.execution.actions.retryAccount,
      },
      {
        name: "Uncertain Account",
        result: { status: "uncertain", reconciliation: "unknown" },
        primary: copy.execution.actions.verifyStatus,
        external: true,
      },
      {
        name: "Unsupported Account",
        result: { status: "failed", reasonCode: "method_unsupported" },
        primary: feedback.request,
      },
      {
        name: "No Provider Account",
        result: { status: "skipped", reasonCode: "no_provider" },
        primary: feedback.request,
      },
      {
        name: "Unavailable Account",
        result: { status: "skipped", reasonCode: "status_unavailable" },
        primary: copy.execution.actions.retryAccount,
      },
      {
        name: "External Account",
        result: { status: "success" },
        primary: copy.execution.actions.openExternal,
        external: true,
      },
      { name: "Success Account", result: { status: "success" } },
    ]
    const serviceWorker = await getServiceWorker(context)
    await stubLlmMetadataIndex(context)
    await context.route("https://result-actions.example.invalid/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      }),
    )
    await seedStoredAccounts(
      serviceWorker,
      cases.map(({ name, external }) =>
        createStoredAccount({
          id: name,
          site_name: name,
          site_url: "https://result-actions.example.invalid",
          site_type: SITE_TYPES.NEW_API,
          checkIn: createCompatibilityCheckInConfig({
            siteType: SITE_TYPES.NEW_API,
            supported: true,
            automaticExecutionEnabled: true,
            ...(external
              ? {
                  customCheckIn: {
                    url: "https://result-actions.example.invalid/checkin",
                  },
                }
              : {}),
          }),
        }),
      ),
    )
    await seedUserPreferences(serviceWorker, {
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: false,
        pretriggerDailyOnUiOpen: false,
      },
    })
    // Startup scheduling writes an initial status. Seed historical results only
    // after that write so a slower browser cannot replace them with empty state.
    await expect
      .poll(() =>
        getPlasmoStorageJsonValue(serviceWorker, "autoCheckin_status"),
      )
      .toBeTruthy()
    // Reproduce a scheduler cycle that has already read the old status. It
    // must finish before the fixture writes historical results under its lock.
    await serviceWorker.evaluate(async (lockName) => {
      const state = globalThis as typeof globalThis & {
        fixtureStatusUpdate?: Promise<unknown>
      }
      await new Promise<void>((resolve) => {
        state.fixtureStatusUpdate = navigator.locks.request(
          lockName,
          async () => {
            const previous =
              await chrome.storage.local.get("autoCheckin_status")
            resolve()
            await new Promise((finish) => setTimeout(finish, 300))
            await chrome.storage.local.set(previous)
          },
        )
      })
    }, STORAGE_LOCKS.AUTO_CHECKIN_STATUS)
    await seedAutoCheckinStatus(serviceWorker, {
      lastRunAt: new Date().toISOString(),
      lastRunResult: "failed",
      perAccount: Object.fromEntries(
        cases.map(({ name, result }) => [
          name,
          {
            accountId: name,
            accountName: name,
            timestamp: Date.now(),
            ...result,
          },
        ]),
      ),
      accountsSnapshot: [],
    })
    await serviceWorker.evaluate(async () => {
      const state = globalThis as typeof globalThis & {
        fixtureStatusUpdate?: Promise<unknown>
      }
      await state.fixtureStatusUpdate
      delete state.fixtureStatusUpdate
    })
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, language)
    await page.setViewportSize({ width: 1600, height: 1100 })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.AUTO_CHECKIN}`,
    )
    await waitForExtensionRoot(page)
    await expect(
      page.getByRole("row").filter({ hasText: "Failed Account" }),
    ).toBeVisible()

    for (const width of [1600, 1200, 640]) {
      await page.setViewportSize({ width, height: 1100 })
      for (const { name, primary } of cases) {
        const row = page.getByRole("row").filter({ hasText: name })
        const actions = row.getByRole("cell").last()
        await actions
          .getByRole("button", { name: common.actions.more, exact: true })
          .scrollIntoViewIfNeeded()
        await expect(actions.getByRole("button")).toHaveCount(
          width >= 1200 && primary ? 2 : 1,
        )
        if (width >= 1200 && primary) {
          const primaryButton = actions.getByRole("button", {
            name: primary,
            exact: true,
          })
          await expect(primaryButton).toBeVisible()
          const buttonBounds = await primaryButton.boundingBox()
          const cellBounds = await actions.boundingBox()
          expect(buttonBounds!.height).toBeLessThanOrEqual(40)
          expect(buttonBounds!.x).toBeGreaterThanOrEqual(cellBounds!.x)
        }
        await expect(
          actions.getByRole("button", {
            name: common.actions.more,
            exact: true,
          }),
        ).toBeInViewport()
      }
      const uncertain = page
        .getByRole("row")
        .filter({ hasText: "Uncertain Account" })
        .getByRole("cell")
        .last()
      await uncertain
        .getByRole("button", { name: common.actions.more, exact: true })
        .click()
      await expect(
        page.getByRole("menuitem", {
          name: copy.execution.actions.openExternal,
          exact: true,
        }),
      ).toBeVisible()
      await expect(
        page.getByRole("menuitem", {
          name: copy.execution.actions.verifyStatus,
          exact: true,
        }),
      ).toBeVisible()
      await page
        .getByRole("menuitem", { name: feedback.feedback, exact: true })
        .click()
      const notes = page.getByRole("dialog").getByLabel(feedback.notes)
      await expect(notes).toBeVisible()
      // Closing is part of this layout flow; automatic scanning can activate
      // another page while a keyboard dismissal is being dispatched.
      await page
        .getByRole("dialog")
        .getByRole("button", { name: common.actions.close, exact: true })
        .filter({ hasText: common.actions.close })
        .click()
      await expect(page.getByRole("dialog")).toBeHidden()
      await page.screenshot({
        path: testInfo.outputPath(`result-actions-${language}-${width}.png`),
        animations: "disabled",
        fullPage: true,
      })
    }
  })
}
