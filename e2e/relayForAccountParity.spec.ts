import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { getAccountManagementListItemTestId } from "~/features/AccountManagement/testIds"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

test("RelayFor shows scoped allowances, access conditions, accepted routing and announcements", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  let selected = "standard"
  const writes: unknown[] = []
  let overviewReads = 0
  await context.route("https://relayfor.xyz/api/**", async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    let json: unknown = {}
    if (pathname === "/api/user/overview") {
      overviewReads++
      json = {
        user: { id: 1, username: "fixture", quota: 500000 },
        timed_quota: 1000000,
        group_quotas: [{ quota_group: "premium", quota: 2000000 }],
        total_quota: 250000,
        today: { requests: 2, tokens: 20, quota: 1000 },
        active_subscriptions: [
          {
            plan_name: "Monthly",
            status: 1,
            starts_at: "2020-01-01",
            expires_at: "2099-01-01",
            quota_remaining: 1500000,
            quota_group: "premium-only",
            next_reset_at: "2098-12-01",
            model_rules: { "gpt-4o": {} },
          },
          {
            plan_name: "Unlimited",
            status: 1,
            starts_at: "2020-01-01",
            expires_at: "2099-01-01",
            unlimited_quota: true,
          },
        ],
      }
    } else if (pathname === "/api/user/timed-quotas")
      json = [
        {
          status: 1,
          name: "Prepaid grant",
          quota_remaining: 1000000,
          expires_at: "2099-06-01",
        },
      ]
    else if (pathname === "/api/user/checkin-campaigns") json = []
    else if (pathname === "/api/user/models")
      json = {
        items: [
          {
            model: "gpt-4o",
            accessible: false,
            access_reason: "Subscription required",
            data_training_consent_required: true,
            prompt_audit_enabled: true,
            prompt_audit_consent_required: true,
            prompt_audit_price: 0.03,
            effective_compaction_price: 0.05,
            remote_compaction_enabled: true,
            selected_group: selected,
            model_groups: [
              { name: "standard", available: true, effective_multiplier: 1 },
              { name: "premium", available: true, effective_multiplier: 2 },
              { name: "blocked", available: false },
            ],
            effective_prices: {
              input: selected === "premium" ? 4 : 2,
              output: 8,
            },
            supported_endpoints: ["/v1/responses"],
          },
        ],
      }
    else if (pathname === "/api/user/model-group") {
      const body = request.postDataJSON()
      writes.push(body)
      selected = body.group
    } else if (pathname === "/api/site/announcement")
      json = { content: "RelayFor parity announcement fixture" }
    else if (pathname === "/api/user/self")
      json = { id: 1, username: "fixture", quota: 500000, role: 1 }
    await route.fulfill({ json })
  })
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount({
      id: "relayfor-parity",
      site_type: SITE_TYPES.RELAYFOR,
      site_name: "RelayFor",
      site_url: "https://relayfor.xyz",
      account_info: {
        id: "1",
        username: "fixture",
        access_token: "fixture-token",
      },
    }),
    createStoredAccount({
      id: "balance-reference",
      site_type: SITE_TYPES.NEW_API,
      site_name: "Standard balance",
      disabled: false,
    }),
  ])
  const url = (menu: string) =>
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?accountId=relayfor-parity#${menu}`
  await page.goto(url(MENU_ITEM_IDS.ACCOUNT))
  await waitForExtensionRoot(page)
  const row = page.getByTestId(
    getAccountManagementListItemTestId("relayfor-parity"),
  )
  await row.getByTitle("Click to refresh balance", { exact: true }).click()
  await expect.poll(() => overviewReads).toBeGreaterThan(0)
  await expect(row).toContainText("$6.00")
  const balance = row.getByTitle("Click to refresh balance", { exact: true })
  const font = (element: HTMLElement) => ({
    size: getComputedStyle(element).fontSize,
    weight: getComputedStyle(element).fontWeight,
    padding: getComputedStyle(element).padding,
  })
  // Compare the actual rendered monetary controls instead of matching CSS class names.
  const standardBalance = page
    .getByTestId(getAccountManagementListItemTestId("balance-reference"))
    .locator("button")
    .filter({ hasText: "$" })
    .first()
  await expect(standardBalance).toBeVisible()
  expect(await balance.evaluate(font)).toEqual(
    await standardBalance.evaluate(font),
  )
  await expect
    .poll(async () => (await balance.innerText()).replace(/\s/g, ""))
    .toBe("$6.00")
  await page.mouse.move(0, 0)
  await expect
    .poll(async () => {
      const amountBounds = (await balance.boundingBox())!
      const referenceBounds = (await standardBalance.boundingBox())!
      return Math.abs(
        amountBounds.x +
          amountBounds.width -
          referenceBounds.x -
          referenceBounds.width,
      )
    })
    .toBeLessThanOrEqual(1)
  const closedHeight = (await row.boundingBox())!.height
  await row.screenshot({ path: testInfo.outputPath("allowances.png") })
  const allowanceTrigger = row.getByRole("button", {
    name: "Allowance details",
    exact: true,
  })
  await allowanceTrigger.hover()
  const allowances = page.getByRole("dialog", { name: "Allowance details" })
  await expect(allowances).toBeVisible()
  await expect(allowances).toContainText("Quota group: premium-only")
  await expect(allowances).toContainText("Unlocked models: gpt-4o")
  await expect(allowanceTrigger).not.toBeFocused()
  await allowances.hover()
  await expect(allowances).toBeVisible()
  await page.mouse.move(0, 0)
  await expect(allowances).not.toBeVisible()
  await allowanceTrigger.focus()
  await expect(allowances).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(allowances).not.toBeVisible()
  await allowanceTrigger.click()
  await page.mouse.move(0, 0)
  await expect(allowances).toContainText("Monthly")
  await expect(allowances).toContainText("premium")
  await expect(allowances).toContainText("Unlimited")
  await expect(allowances).toContainText("2099")
  expect((await row.boundingBox())!.height).toBe(closedHeight)
  await allowances.screenshot({
    path: testInfo.outputPath("allowance-details.png"),
  })
  await page.setViewportSize({ width: 380, height: 800 })
  const bounds = await allowances.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(380)
  await page.screenshot({
    path: testInfo.outputPath("allowance-details-narrow.png"),
  })
  await allowanceTrigger.click()
  await expect(allowances).not.toBeVisible()
  await allowanceTrigger.click()
  await expect(allowances).toBeVisible()
  // The panel can cover the page heading. The header's outer padding is outside
  // the panel and its controls; locator actionability also checks the hit target.
  await page.getByRole("banner").click({ position: { x: 2, y: 2 } })
  await expect(allowances).not.toBeVisible()
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.reload()
  await expect(row).toContainText("$6.00")
  await page.goto(url(MENU_ITEM_IDS.MODELS))
  const models = page.getByTestId(MODEL_LIST_TEST_IDS.modelDisplay)
  await expect(models).toContainText("Subscription required")
  await expect(models).toContainText("Training consent required")
  await expect(models).toContainText("Rejected-risk audit charge")
  await expect(models).toContainText("$0.03")
  await expect(models).toContainText("$0.05")
  await expect(
    models.getByRole("link", { name: "Official settings" }),
  ).toHaveAttribute("href", "https://relayfor.xyz/console/#models")
  await page.mouse.move(0, 0)
  await expect(
    page.getByText("Model data loaded successfully", { exact: true }),
  ).not.toBeVisible()
  const action = models.getByRole("button", {
    name: "Change official routing group",
  })
  await expect(models.getByRole("combobox")).toHaveCount(0)
  await action.click()
  const editor = page.getByRole("dialog", {
    name: "Change official routing group",
  })
  const group = editor.getByRole("combobox", { name: "Official routing group" })
  await expect(group).toContainText("standard")
  await group.click()
  await expect(page.getByRole("option", { name: /^blocked/ })).toBeDisabled()
  await page.getByRole("option", { name: /^premium/ }).click()
  expect(writes).toEqual([])
  await editor.screenshot({
    path: testInfo.outputPath("routing-action.png"),
    animations: "disabled",
  })
  await editor.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(editor).not.toBeVisible()
  expect(writes).toEqual([])
  await action.click()
  await expect(group).toContainText("standard")
  await group.click()
  await page.getByRole("option", { name: /^premium/ }).click()
  await editor.getByRole("button", { name: "Save to official site" }).click()
  await expect
    .poll(() => writes)
    .toEqual([{ model: "gpt-4o", group: "premium" }])
  await expect(editor).not.toBeVisible()
  await expect(models).toContainText("Official routing group: premium")
  await page.mouse.move(0, 0)
  await expect(
    page.getByText("Model data loaded successfully", { exact: true }),
  ).not.toBeVisible()
  await models.screenshot({ path: testInfo.outputPath("model-conditions.png") })
  await page.setViewportSize({ width: 380, height: 800 })
  await action.click()
  await expect(editor).toBeVisible()
  const editorBounds = await editor.boundingBox()
  expect(editorBounds!.x).toBeGreaterThanOrEqual(0)
  expect(editorBounds!.x + editorBounds!.width).toBeLessThanOrEqual(380)
  await group.click()
  await expect(page.getByRole("listbox")).toBeVisible()
  await expect(page.getByRole("listbox")).toHaveCSS("opacity", "1")
  const listBounds = await page.getByRole("listbox").boundingBox()
  expect(listBounds!.x).toBeGreaterThanOrEqual(0)
  expect(listBounds!.x + listBounds!.width).toBeLessThanOrEqual(380)
  await page.screenshot({
    path: testInfo.outputPath("routing-select-narrow.png"),
  })
  await page.keyboard.press("Escape")
  await expect(page.getByRole("listbox")).not.toBeVisible()
  await editor.getByRole("button", { name: "Cancel", exact: true }).click()
  expect(writes).toEqual([{ model: "gpt-4o", group: "premium" }])
  await models.screenshot({
    path: testInfo.outputPath("model-conditions-narrow.png"),
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.goto(url(MENU_ITEM_IDS.SITE_ANNOUNCEMENTS))
  await page
    .getByRole("button", { name: "Check now", exact: true })
    .first()
    .click()
  await expect(
    page.getByText("RelayFor parity announcement fixture").first(),
  ).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath("announcement.png") })
})
