import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  WEBDAV_AUTO_SYNC_TARGET_IDS,
  WEBDAV_TARGET_IDS,
} from "~/features/ImportExport/searchTargets"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getServiceWorker,
  getStoredUserPreferences,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 420, height: 900 },
]) {
  test(`saves cloud data scope from its configuration card at ${viewport.width}px`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    await page.setViewportSize(viewport)
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, "zh-CN")
    await stubLlmMetadataIndex(context)
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
      language: "zh-CN",
      webdav: {
        url: "https://backup.example.invalid/backup.json",
        username: "demo",
        password: "demo-password",
        autoSync: false,
        syncData: {
          accounts: true,
          bookmarks: true,
          apiCredentialProfiles: true,
          preferences: true,
        },
      },
    })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=dataBackup#${MENU_ITEM_IDS.BASIC}`,
    )
    await waitForExtensionRoot(page)
    const configuration = page.getByRole("region", {
      name: "连接配置",
      exact: true,
    })
    const accounts = configuration.getByRole("checkbox", {
      name: "账号",
      exact: true,
    })
    await expect(accounts).toBeChecked()
    await accounts.uncheck()
    await expect
      .poll(async () => {
        const preferences = await getStoredUserPreferences(worker)
        return (preferences.webdav as { syncData?: { accounts?: boolean } })
          .syncData?.accounts
      })
      .toBe(false)
    const encryptionPassword = configuration.getByTitle("加密密码", {
      exact: true,
    })
    await encryptionPassword.fill("demo-backup-secret")
    await encryptionPassword.press("Tab")
    await expect
      .poll(
        async () =>
          (
            (await getStoredUserPreferences(worker)).webdav as {
              backupEncryptionPassword?: string
            }
          ).backupEncryptionPassword,
      )
      .toBe("demo-backup-secret")
    await expect
      .poll(async () => {
        const preferences = await getStoredUserPreferences(worker)
        return (preferences.webdav as { syncData?: { accounts?: boolean } })
          .syncData?.accounts
      })
      .toBe(false)
    await page.reload()
    await expect(accounts).not.toBeChecked()
    await expect(encryptionPassword).toHaveValue("demo-backup-secret")
    await expect(
      configuration.locator(`#${WEBDAV_TARGET_IDS.uploadBackup}`),
    ).toBeVisible()
    await expect(
      page.locator(`#${WEBDAV_AUTO_SYNC_TARGET_IDS.strategy}`),
    ).toBeVisible()
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("webdav.png"),
    })
    await configuration
      .getByRole("button", { name: "GitHub Secret Gist", exact: true })
      .click()
    await expect(encryptionPassword).toHaveValue("demo-backup-secret")
    await expect(
      configuration.getByText("始终加密", { exact: true }),
    ).toBeVisible()
    await expect(
      configuration.locator(`#${WEBDAV_TARGET_IDS.gistUpload}`),
    ).toBeVisible()
    await configuration
      .locator(`#${WEBDAV_TARGET_IDS.gistToken}`)
      .fill("demo-gist-token")
    await expect(
      configuration.locator(`#${WEBDAV_TARGET_IDS.gistId}`),
    ).toBeEmpty()
    await expect(
      configuration.locator(`#${WEBDAV_TARGET_IDS.uploadBackup}`),
    ).toBeEnabled()
    await expect(
      configuration.locator(`#${WEBDAV_TARGET_IDS.downloadImport}`),
    ).toBeDisabled()
    await expect(
      page.locator(`#${WEBDAV_AUTO_SYNC_TARGET_IDS.syncNow}`),
    ).toBeEnabled()
    await expect
      .poll(
        async () =>
          (
            (await getStoredUserPreferences(worker)).webdav as {
              provider?: string
            }
          ).provider,
      )
      .toBe("github_gist")
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("gist.png"),
    })
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true)
  })
}
