import type { Locator } from "@playwright/test"

import { ACCOUNT_MANAGEMENT_TEST_IDS as accounts } from "~/features/AccountManagement/testIds"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "~/features/KeyManagement/testIds"
import { AuthTypeEnum } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

for (const width of [1280, 800, 320]) {
  test(`default-key form stays usable while groups load at ${width}px`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 600 })
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
      tempWindowFallback: { enabled: false },
    })
    await seedStoredAccounts(worker, [
      createStoredAccount({
        site_type: "cubence",
        site_name: "Cubence feedback fixture",
        site_url: "https://cubence.com",
        authType: AuthTypeEnum.Cookie,
        cookieAuth: { sessionCookie: "token=fixture-only" },
        account_info: { id: "7", access_token: "" },
      }),
    ])

    let holdEditor = false
    let waitingForGroups = false
    let releaseEditor!: () => void
    const editorGate = new Promise<void>((resolve) => {
      releaseEditor = resolve
    })
    const writes: string[] = []
    const reads: string[] = []
    await context.route("https://cubence.com/**", async (route) => {
      const request = route.request()
      if (request.method() !== "GET") {
        writes.push(request.method())
        await route.fulfill({ status: 405, body: "Read-only test" })
        return
      }
      const pathname = new URL(request.url()).pathname
      if (holdEditor) reads.push(pathname)
      if (pathname === "/api/v1/auth/me") {
        await route.fulfill({
          json: {
            user: {
              id: 7,
              username: "fixture",
              active: true,
              normal_balance: 10_000_000,
              daily_cost: 0,
              today_usage: { cost: 0 },
            },
          },
        })
      } else if (pathname === "/api/v1/share-groups/available") {
        if (holdEditor) {
          waitingForGroups = true
          await editorGate
        }
        await route.fulfill({
          json: {
            data: [
              {
                id: 1,
                name: "Available test group",
                is_active: true,
                multiplier: 1,
                supported_protocols: ["openai.responses"],
              },
            ],
          },
        })
      } else if (pathname === "/api/v1/user/apikeys") {
        await route.fulfill({ json: { success: true, data: [] } })
      } else {
        await route.fulfill({ status: 404, body: "Unexpected fixture request" })
      }
    })

    await page.goto(`chrome-extension://${extensionId}/options.html#account`)
    await waitForExtensionRoot(page)
    // Desktop account actions become interactive when their row is hovered.
    await page.locator('[data-site-type="cubence"]').hover()
    await page.getByTestId(accounts.rowCopyKeyButton).click()
    const dialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: "Key List", exact: true }),
    })
    const create = dialog.getByRole("button", {
      name: "Create default key",
      exact: true,
    })
    await expect(create).toBeVisible()
    const layout = (target: Locator) =>
      target.evaluate((element) => {
        const box = element.getBoundingClientRect()
        const overflowing = Array.from(
          element.querySelectorAll<HTMLElement>("div"),
        ).filter(
          (node) =>
            /auto|scroll/.test(getComputedStyle(node).overflowY) &&
            node.scrollHeight > node.clientHeight + 1,
        )
        return {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          scrollbars: overflowing.length,
        }
      })
    const before = await layout(dialog)
    await page.screenshot({
      path: testInfo.outputPath("before-create.png"),
      animations: "disabled",
    })
    holdEditor = true
    const editor = page.getByTestId(keys.nativeEditor)
    const group = editor.locator("#resource-editor-group")
    const name = editor.locator("#resource-editor-name")
    let loadingLayout: Awaited<ReturnType<typeof layout>>
    let initialName: string
    try {
      await create.click()
      await expect.poll(() => waitingForGroups).toBe(true)
      await expect(name).toBeEditable()
      await expect(group).toBeDisabled()
      await expect(
        editor.getByTestId(keys.nativeEditorSubmitButton),
      ).toBeDisabled()
      initialName = await name.inputValue()
      await name.fill("Draft written while groups load")
      loadingLayout = await layout(editor)
      const during = await layout(dialog)
      await testInfo.attach("layout", {
        body: JSON.stringify({ before, during }),
        contentType: "application/json",
      })
      await page.screenshot({
        path: testInfo.outputPath("opening-editor.png"),
        animations: "disabled",
      })
      await expect(dialog.getByRole("alert")).toHaveCount(0)
      expect(during.scrollbars).toBe(before.scrollbars)
      expect(Math.abs(during.height - before.height)).toBeLessThanOrEqual(1)
      expect(Math.abs(during.y - before.y)).toBeLessThanOrEqual(1)
      const body = editor.locator('[data-slot="modal-body"]')
      expect(
        await body.evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true)
    } finally {
      holdEditor = false
      releaseEditor()
    }
    await expect(group).toBeEnabled()
    await expect(name).toHaveValue("Draft written while groups load")
    const loadedLayout = await layout(editor)
    expect(loadedLayout.scrollbars).toBe(loadingLayout!.scrollbars)
    expect(
      Math.abs(loadedLayout.height - loadingLayout!.height),
    ).toBeLessThanOrEqual(1)
    expect(reads).toEqual(["/api/v1/auth/me", "/api/v1/share-groups/available"])
    await group.click()
    await expect(
      page.getByRole("option", { name: "Available test group" }),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await name.fill(initialName!)
    await page.screenshot({
      path: testInfo.outputPath("editor-ready.png"),
      animations: "disabled",
    })
    await page.keyboard.press("Escape")
    await expect(editor).toHaveCount(0)
    await expect(create).toBeEnabled()
    await expect
      .poll(() =>
        dialog.evaluate((node) => node.contains(document.activeElement)),
      )
      .toBe(true)
    await expect(dialog.getByRole("alert")).toHaveCount(0)
    expect(writes).toEqual([])
  })
}
