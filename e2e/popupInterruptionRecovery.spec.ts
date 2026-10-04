import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageJsonValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"

for (const mode of ["unavailable", "rejected", "native"] as const) {
  test(`continues interrupted popup detection with ${mode} side panel support`, async ({
    context,
    extensionId,
    page,
  }) => {
    const worker = await getServiceWorker(context)
    await stubLlmMetadataIndex(context)
    await forceExtensionLanguage(page)
    await seedUserPreferences(worker, {
      actionClickBehavior: "popup",
      autoFillCurrentSiteUrlOnAccountAdd: false,
    })
    await worker.evaluate(
      async ({ key, lock }) => {
        await navigator.locks.request(lock, async () => {
          await chrome.storage.local.set({
            [key]: {
              flow: "account-auto-detect",
              status: "pending",
              startedAt: 1,
              interruptedAt: 2,
            },
          })
        })
      },
      {
        key: STORAGE_KEYS.POPUP_INTERRUPTION_HINT,
        lock: STORAGE_LOCKS.POPUP_INTERRUPTION_HINT,
      },
    )
    if (mode !== "native") {
      await page.addInitScript((nextMode) => {
        const sidePanel = (globalThis as any).chrome.sidePanel
        sidePanel.open =
          nextMode === "unavailable"
            ? undefined
            : () => Promise.reject(new Error("Side panel opening rejected"))
      }, mode)
    }
    await page.goto(`chrome-extension://${extensionId}/popup.html`)
    await expect(
      page.getByText("Auto-detect may have been interrupted"),
    ).toBeVisible()
    if (mode === "native") {
      await page.getByRole("button", { name: "Continue in side panel" }).click()
      const bridge = await context.newPage()
      await bridge.goto(`chrome-extension://${extensionId}/options.html#about`)
      await expect
        .poll(() =>
          bridge.evaluate(() =>
            chrome.extension
              .getViews()
              .some((view) => view.location.pathname === "/sidepanel.html"),
          ),
        )
        .toBe(true)
      const sidePanelHasHint = await bridge.evaluate(() => {
        const view = chrome.extension
          .getViews()
          .find((item) => item.location.pathname === "/sidepanel.html")
        return (
          view?.document.body.textContent?.includes(
            "Auto-detect may have been interrupted",
          ) ?? false
        )
      })
      expect(sidePanelHasHint).toBe(false)
    } else {
      const destinationPromise = context.waitForEvent("page")
      await page
        .getByRole("button", {
          name:
            mode === "unavailable"
              ? "Continue in full page"
              : "Continue in side panel",
        })
        .click()
      const destination = await destinationPromise
      await expect(destination).toHaveURL(
        new RegExp(`options\\.html\\?action=add#account$`),
      )
      await expect(
        destination.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog),
      ).toBeVisible()
    }
    await expect
      .poll(async () => {
        const stored = await worker.evaluate(
          (key) => chrome.storage.local.get(key),
          STORAGE_KEYS.POPUP_INTERRUPTION_HINT,
        )
        return stored[STORAGE_KEYS.POPUP_INTERRUPTION_HINT] ?? null
      })
      .toBeNull()
    const preferences = await getPlasmoStorageJsonValue<{
      actionClickBehavior: string
    }>(worker, STORAGE_KEYS.USER_PREFERENCES)
    expect(preferences?.actionClickBehavior).toBe("popup")
  })
}

test("does not report a live popup flow as interrupted and recovers after its owner closes", async ({
  context,
  extensionId,
  page,
}) => {
  await stubLlmMetadataIndex(context)
  await forceExtensionLanguage(page)
  const owner = await context.newPage()
  await owner.goto(`chrome-extension://${extensionId}/options.html#about`)
  await owner.evaluate(
    async ({ key, leaseName, writeLock }) => {
      await new Promise<void>((ready, reject) => {
        void navigator.locks
          .request(leaseName, async () => {
            await navigator.locks.request(writeLock, async () => {
              await chrome.storage.local.set({
                [key]: {
                  flow: "account-auto-detect",
                  status: "active",
                  startedAt: Date.now(),
                  ownerId: "browser-test-owner",
                  leaseName,
                },
              })
            })
            ready()
            return new Promise<void>(() => {})
          })
          .catch(reject)
      })
    },
    {
      key: STORAGE_KEYS.POPUP_INTERRUPTION_HINT,
      leaseName: `${STORAGE_LOCKS.POPUP_CRITICAL_FLOW_PREFIX}browser-test-owner`,
      writeLock: STORAGE_LOCKS.POPUP_INTERRUPTION_HINT,
    },
  )
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(
    page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton),
  ).toBeVisible()
  await expect(
    page.getByText("Auto-detect may have been interrupted"),
  ).not.toBeVisible()
  await owner.close()
  await page.reload()
  await expect(
    page.getByText("Auto-detect may have been interrupted"),
  ).toBeVisible()
})
