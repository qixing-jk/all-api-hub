import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

for (const language of ["en", "zh-CN"] as const) {
  const chinese = language === "zh-CN"
  test(`permissions settings explain browser access${chinese ? " in Chinese" : ""}`, async ({
    context,
    page,
    extensionId,
    extensionDir,
  }) => {
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, language)
    await stubLlmMetadataIndex(context)
    await seedUserPreferences(await getServiceWorker(context), {
      preferencesVersion: DEFAULT_PREFERENCES.preferencesVersion,
      openChangelogOnUpdate: false,
    })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=permissions#basic`,
    )
    await waitForExtensionRoot(page)
    const permissions = page.locator("#permissions").last()
    await expect(
      page.getByRole("button", {
        name: chinese ? "刷新状态" : "Refresh status",
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByText(
        chinese ? "无痕／隐私窗口访问" : "Incognito / private browsing access",
        { exact: true },
      ),
    ).toBeVisible()
    await captureVisualViews({
      page,
      ready: permissions,
      id: chinese ? "permissions-access-zh-CN" : "permissions-access",
      extensionDir,
    })
    await page
      .locator("#permissions-incognito")
      .getByRole("button", {
        name: chinese ? "去设置" : "Settings",
        exact: true,
      })
      .click()
    const accessDialog = page.getByRole("dialog", {
      name: chinese
        ? "无痕／隐私窗口访问"
        : "Incognito / private browsing access",
      exact: true,
    })
    await expect(
      accessDialog.getByText(
        chinese
          ? "更改此权限可能重新加载扩展、关闭扩展页面或中断任务。请先保存未完成的编辑。"
          : "Changing this permission may reload the extension, close extension pages or interrupt tasks. Save unfinished edits first.",
        { exact: true },
      ),
    ).toBeVisible()
    await expect(
      page.getByRole("button", {
        name: chinese ? "前往 Chrome 设置" : "Chrome settings",
        exact: true,
      }),
    ).toBeVisible()
    await captureVisualViews({
      page,
      ready: accessDialog,
      id: chinese
        ? "permissions-access-confirm-zh-CN"
        : "permissions-access-confirm",
      extensionDir,
    })
  })
}

// Deterministic browser-API fixture for the granted permission row.
test("granted private access has no setup action", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  await seedUserPreferences(await getServiceWorker(context), {
    preferencesVersion: DEFAULT_PREFERENCES.preferencesVersion,
    openChangelogOnUpdate: false,
  })
  await page.addInitScript(() => {
    ;(globalThis as any).chrome.extension.isAllowedIncognitoAccess = (
      callback?: (allowed: boolean) => void,
    ) => {
      callback?.(true)
      return Promise.resolve(true)
    }
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=permissions#basic`,
  )
  await waitForExtensionRoot(page)
  const row = page.locator("#permissions-incognito")
  await expect(row.getByText("已授予", { exact: true })).toBeVisible()
  await expect(row.getByRole("button")).toHaveCount(0)
  await captureVisualViews({
    page,
    ready: page.locator("#permissions").last(),
    id: "permissions-access-granted-zh-CN",
    extensionDir,
  })
})
