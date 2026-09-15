import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { setVisualDarkMode } from "~~/e2e/utils/visualTheme"

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context, {
    models: ["gpt-4", "gpt-3.5"],
    groups: {
      default: { desc: "默认分组", ratio: 1 },
      vip: { desc: "VIP", ratio: 1.5 },
    },
  })
})

for (const width of [1280, 320]) {
  test(`unsaved confirmation preserves the editor and closes deliberately at ${width}px`, async ({
    context,
    extensionId,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await seedStoredAccounts(await getServiceWorker(context), [
      createStoredAccount(),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#keys?accountId=e2e-account-1`,
    )
    await waitForExtensionRoot(page)
    await expectPermissionOnboardingHidden(page)
    const add = page.getByRole("button", { name: "添加 API 密钥" })
    await add.click()
    const editor = page.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeEditor)
    const name = editor.getByRole("textbox", { name: "密钥名称" })
    await name.fill("Keep this draft")
    await name.press("Escape")
    const confirmation = page.getByRole("dialog", {
      name: "放弃更改？",
      exact: true,
    })
    await expect(confirmation).toBeVisible()
    await expect(
      confirmation.getByText("关闭后，本次修改不会保存。"),
    ).toBeVisible()
    const box = await confirmation.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    await page.screenshot({
      path: testInfo.outputPath("unsaved-confirmation.png"),
      animations: "disabled",
    })
    await page.keyboard.press("Escape")
    await expect(confirmation).toHaveCount(0)
    await expect(name).toHaveValue("Keep this draft")
    await expect(name).toBeFocused()
    await name.press("Escape")
    await confirmation.getByRole("button", { name: "继续编辑" }).click()
    await expect(confirmation).toHaveCount(0)
    await expect(name).toHaveValue("Keep this draft")
    await expect(name).toBeFocused()
    await name.press("Escape")
    await confirmation
      .getByRole("button", { name: "放弃更改", exact: true })
      .click()
    await expect(editor).toHaveCount(0)
    await expect(confirmation).toHaveCount(0)
    await expect(add).toBeFocused()
  })
}

test("native group selector stays visible and clickable above the key editor", async ({
  context,
  extensionId,
  page,
}, testInfo) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [createStoredAccount()])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#keys?accountId=e2e-account-1`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("button", { name: "添加 API 密钥" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "添加 API 密钥" }).click()

  const editor = page.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeEditor)
  const nameInput = editor.getByRole("textbox", { name: "密钥名称" })
  await expect(nameInput).toBeVisible()
  await nameInput.fill("e2e layered token")

  const groupTrigger = editor.getByRole("combobox", {
    name: "分组",
    exact: true,
  })
  await expect(groupTrigger).toBeEnabled()
  for (const dark of [false, true]) {
    await setVisualDarkMode(page, dark)
    await groupTrigger.click()
    const groupOption = page.getByRole("option", {
      name: dark ? /default.*默认分组/ : /vip.*VIP/,
    })
    await expect(groupOption).toBeVisible()
    await groupOption.hover()
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`native-group-selector-${dark}.png`),
    })
    await groupOption.click()
    await expect(groupTrigger).toContainText(dark ? "default" : "vip")
    await expect(groupTrigger).toBeFocused()
  }
})
