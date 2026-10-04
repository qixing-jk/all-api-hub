import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

test("mobile log viewer retains history and receives live logs across page lifetimes", async ({
  context,
  page,
  extensionId,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await seedUserPreferences(await getServiceWorker(context), {
    logging: { consoleEnabled: true, level: "debug" },
  })
  const optionsUrl = `chrome-extension://${extensionId}/options.html?tab=general&anchor=${SETTINGS_ANCHORS.LOGGING_HISTORY}#basic`
  await page.goto(optionsUrl)
  const report = async (message: string, timestamp = Date.now()) => {
    const response = await page.evaluate(
      async ({ action, message, timestamp }) => {
        return await chrome.runtime.sendMessage({
          action,
          logEntry: {
            id: `log-viewer-${message}`,
            timestamp,
            level: "info",
            context: "Content",
            scope: "LogViewerSmoke",
            message,
            details: {
              requestId: "log-viewer-trace",
              access_token: "must-not-retain-log-secret",
            },
          },
        })
      },
      { action: RuntimeActionIds.CloudflareGuardLog, message, timestamp },
    )
    expect(response.success).toBe(true)
  }
  await report("Earlier account read", Date.now() - 30 * 60 * 1000)
  await page.getByRole("button", { name: "View logs", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Recent logs" })
  await dialog
    .getByRole("textbox", { name: "Search message, scope or request ID" })
    .fill("log-viewer-trace")
  await expect(
    dialog.getByText("Earlier account read", { exact: true }),
  ).toBeVisible()
  await report("Live account read")
  await expect(
    dialog.getByText("Live account read", { exact: true }),
  ).toBeVisible()
  await dialog.getByRole("button", { name: "Pause updates" }).click()
  await report("Read while paused")
  await expect(
    dialog.getByText("Read while paused", { exact: true }),
  ).toHaveCount(0)
  await dialog.getByRole("button", { name: "Resume live updates" }).click()
  await expect(
    dialog.getByText("Read while paused", { exact: true }),
  ).toBeVisible()
  await expect
    .poll(
      async () =>
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
    )
    .toBe(true)
  await dialog.getByRole("combobox", { name: "Time range" }).click()
  await page.getByRole("option", { name: "Last 5 minutes" }).click()
  await expect(
    dialog.getByText("Earlier account read", { exact: true }),
  ).toHaveCount(0)
  await page.keyboard.press("Escape")
  await page.reload()
  await page.getByRole("button", { name: "View logs", exact: true }).click()
  await dialog
    .getByRole("textbox", { name: "Search message, scope or request ID" })
    .fill("log-viewer-trace")
  await expect(
    dialog.getByText("Earlier account read", { exact: true }),
  ).toBeVisible()
  await expect(
    dialog.getByText("Live account read", { exact: true }),
  ).toBeVisible()
  await dialog.getByText("Details", { exact: true }).first().click()
  await expect(dialog.locator("pre").first()).toContainText("[REDACTED]")
  await expect(dialog).not.toContainText("must-not-retain-log-secret")
  await page.evaluate(async (action) => {
    await chrome.runtime.sendMessage({
      action,
      event: "background-history-smoke",
      details: { requestId: "background-history-trace" },
    })
  }, RuntimeActionIds.CloudflareGuardLog)
  await dialog
    .getByRole("textbox", { name: "Search message, scope or request ID" })
    .fill("background-history-trace")
  await expect(dialog.getByText("CFGuardRelay", { exact: true })).toBeVisible()
})
