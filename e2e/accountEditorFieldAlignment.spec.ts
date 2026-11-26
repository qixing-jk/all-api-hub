import type { Locator } from "@playwright/test"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS as accountIds,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

const fieldLabel = '[data-slot="label"]'
const methodId = AUTO_CHECKIN_METHOD_IDS.BizDecipherFreeCheckIn

async function bounds(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error(`Layout element is not visible: ${locator}`)
  return box
}

async function expectAlignedFields(controls: Locator[], section: string) {
  const layout = await Promise.all(
    controls.map((control) =>
      control.evaluate((element, labelSelector) => {
        const label = element
          .closest('[data-slot="field"]')!
          .querySelector(labelSelector)!
        return {
          control: element.getBoundingClientRect().top,
          label: label.getBoundingClientRect().top,
        }
      }, fieldLabel),
    ),
  )
  for (const element of ["label", "control"] as const) {
    const positions = layout.map((position) => position[element])
    expect
      .soft(
        Math.max(...positions) - Math.min(...positions),
        `${section} ${element} alignment`,
      )
      .toBeLessThanOrEqual(1)
  }
}

test.beforeEach(async ({ context, page, extensionId }, { tags }) => {
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    refreshOnOpen: false,
    autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
  })
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "alignment-account",
      site_name: "Layout example",
      site_type: SITE_TYPES.UNKNOWN,
    }),
    createStoredAccount({
      id: "pending-layout-account",
      site_name: "Check-in pending",
      site_type: SITE_TYPES.SUB2API,
      checkIn: { automaticExecutionEnabled: true },
    }),
    createStoredAccount({
      id: "bizdecipher-layout-account",
      site_name: "BizDecipher",
      site_type: SITE_TYPES.SUB2API,
      checkIn: {
        automaticExecutionEnabled: true,
        selection: { mode: "automatic", methodId },
        methodKnowledge: {
          methods: {
            [methodId]: {
              detection: {
                outcome: "matched",
                evidence: { source: "probe", observedAt: Date.now() },
              },
            },
          },
        },
      },
    }),
  ])
  await forceExtensionLanguage(page, tags.includes("@zh-CN") ? "zh-CN" : "en")
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
})

test(
  "puts the pending-state guidance beside the method in Chinese",
  {
    tag: "@zh-CN",
  },
  async ({ page, extensionDir }) => {
    await page
      .getByTestId(getAccountManagementListItemTestId("pending-layout-account"))
      .getByTestId(accountIds.rowEditButton)
      .click()
    const checkIn = page
      .getByRole("dialog")
      .getByTestId(accountIds.accountFormSectionCheckIn)
    const method = checkIn.getByRole("combobox", {
      name: "签到方式",
      exact: true,
    })
    await expect(method).toHaveAccessibleDescription(/尚未确认可用方式/)
    await expect(
      checkIn.getByText("暂无内置签到方式", { exact: true }),
    ).toHaveCount(0)
    await expect(
      checkIn.getByText("存在候选签到方式", { exact: false }),
    ).toHaveCount(0)
    await expect(
      checkIn.getByRole("button", { name: "检测方式", exact: true }),
    ).toBeVisible()
    const report = checkIn.getByRole("button", {
      name: "反馈签到问题",
      exact: true,
    })
    await expect(report).toBeVisible()
    for (const width of [1440, 360]) {
      await page.setViewportSize({ width, height: 1000 })
      expect
        .soft((await bounds(report)).y)
        .toBeLessThan((await bounds(method)).y)
      await captureVisualViews({
        page,
        ready: method,
        captureTarget: checkIn,
        id: `check-in-pending-zh-${width}`,
        extensionDir,
      })
    }
  },
)

test("aligns account fields and centers the support request beside the unsupported status on desktop", async ({
  page,
  extensionDir,
}) => {
  await page
    .getByTestId(getAccountManagementListItemTestId("alignment-account"))
    .getByTestId(accountIds.rowEditButton)
    .click()
  const dialog = page.getByRole("dialog")
  const site = dialog.getByTestId(accountIds.accountFormSectionSiteInfo)
  const siteName = site.getByTestId(accountIds.siteNameInput)
  const balance = dialog.getByTestId(accountIds.accountFormSectionBalance)
  const rate = balance.getByTestId(accountIds.exchangeRateInput)
  const auth = dialog.getByTestId(accountIds.accountFormSectionAuth)
  const authMethod = auth.getByTestId(accountIds.authTypeTrigger)
  const tags = dialog.getByTestId(accountIds.accountFormSectionTagsNotes)
  const tagPicker = tags.getByRole("button", { name: "Add or select tags" })
  const checkIn = dialog.getByTestId(accountIds.accountFormSectionCheckIn)
  const statusTitle = checkIn.getByText(
    "No confirmed built-in check-in method",
    { exact: true },
  )
  const statusDescription = checkIn.getByText(
    "You can still use an external check-in URL below.",
    { exact: true },
  )
  const feedback = checkIn.getByRole("button", {
    name: "Request check-in support",
  })
  const externalUrl = checkIn.getByPlaceholder("https://cdk.example.com/")
  await expect(siteName).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  await expectAlignedFields(
    [
      siteName,
      site.getByTestId(accountIds.siteTypeTrigger),
      site.getByTestId(accountIds.usernameInput),
      site.getByTestId(accountIds.userIdInput),
    ],
    "Site Information",
  )
  await expectAlignedFields(
    [rate, balance.getByPlaceholder("Leave blank to auto-fetch")],
    "Balance & Stats",
  )
  await expectAlignedFields(
    [authMethod, auth.getByTestId(accountIds.accessTokenInput)],
    "Account Authentication",
  )
  await expectAlignedFields(
    [tagPicker, tags.getByPlaceholder("Optional, enter notes")],
    "Tags & Notes",
  )
  for (const [id, ready, captureTarget] of [
    ["site-info", siteName, site],
    ["balance", rate, balance],
    ["authentication", authMethod, auth],
    ["tags-notes", tagPicker, tags],
  ] as const) {
    await captureVisualViews({ page, ready, captureTarget, id, extensionDir })
  }
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 1000 })
    await statusTitle.scrollIntoViewIfNeeded()
    const [titleBox, descriptionBox, feedbackBox, externalBox] =
      await Promise.all([
        bounds(statusTitle),
        bounds(statusDescription),
        bounds(feedback),
        bounds(externalUrl),
      ])
    const descriptionBottom = descriptionBox.y + descriptionBox.height
    if (width === 360) {
      expect.soft(feedbackBox.y).toBeGreaterThanOrEqual(descriptionBottom)
      expect.soft(feedbackBox.x).toBeCloseTo(titleBox.x, 0)
      expect.soft(feedbackBox.width).toBeLessThan(externalBox.width)
    } else {
      const textCenter = (titleBox.y + descriptionBottom) / 2
      const feedbackCenter = feedbackBox.y + feedbackBox.height / 2
      expect.soft(Math.abs(textCenter - feedbackCenter)).toBeLessThanOrEqual(1)
      expect
        .soft(feedbackBox.x)
        .toBeGreaterThanOrEqual(descriptionBox.x + descriptionBox.width)
      expect
        .soft(feedbackBox.x + feedbackBox.width)
        .toBeCloseTo(externalBox.x + externalBox.width, 0)
    }
    expect.soft(feedbackBox.y + feedbackBox.height).toBeLessThan(externalBox.y)
    await captureVisualViews({
      page,
      ready: statusTitle,
      captureTarget: checkIn,
      id: width === 1440 ? "check-in-status" : "check-in-status-360",
      extensionDir,
    })
  }
})

test("groups detection with the method and offers feedback in the section heading", async ({
  page,
  extensionDir,
}) => {
  await page
    .getByTestId(
      getAccountManagementListItemTestId("bizdecipher-layout-account"),
    )
    .getByTestId(accountIds.rowEditButton)
    .click()
  const checkIn = page
    .getByRole("dialog")
    .getByTestId(accountIds.accountFormSectionCheckIn)
  const statusDescription = checkIn.getByText(
    "Refreshing the account only checks today's check-in status. It does not perform check-in.",
    { exact: true },
  )
  const detect = checkIn.getByRole("button", {
    name: "Detect method",
    exact: true,
  })
  const report = checkIn.getByRole("button", {
    name: "Report a check-in problem",
    exact: true,
  })
  const sectionHeading = checkIn.getByRole("heading", {
    name: "Check-in Settings",
    exact: true,
  })
  const method = checkIn.getByRole("combobox", { name: "Check-in method" })
  const hint = checkIn.getByText(
    "When auto check-in is on, unsupported methods trigger re-detection.",
    { exact: true },
  )
  const label = checkIn.getByText("Check-in method", { exact: true })
  const scope = checkIn.getByText(
    "Only claims the daily free gift. Draws that cost points or balance are available on the site.",
    { exact: true },
  )
  await expect(method).toContainText("BizDecipher daily free gift")
  await expect(
    checkIn.getByText("No confirmed built-in check-in method", { exact: true }),
  ).toHaveCount(0)
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 1000 })
    await method.scrollIntoViewIfNeeded()
    const statusBox = await bounds(statusDescription)
    const labelBox = await bounds(label)
    const hintBox = await bounds(hint)
    const methodBox = await bounds(method)
    const detectBox = await bounds(detect)
    const scopeBox = await bounds(scope)
    const reportBox = await bounds(report)
    const headingBox = await bounds(sectionHeading)
    expect.soft(reportBox.y + reportBox.height).toBeLessThanOrEqual(statusBox.y)
    if (width === 1440) {
      const headingCenter = headingBox.y + headingBox.height / 2
      const reportCenter = reportBox.y + reportBox.height / 2
      expect.soft(Math.abs(headingCenter - reportCenter)).toBeLessThanOrEqual(1)
      expect
        .soft(reportBox.x)
        .toBeGreaterThanOrEqual(headingBox.x + headingBox.width)
    }
    expect.soft(statusBox.y + statusBox.height).toBeLessThan(labelBox.y)
    expect.soft(Math.abs(labelBox.x - hintBox.x)).toBeLessThanOrEqual(1)
    expect.soft(hintBox.y - labelBox.y - labelBox.height).toBeCloseTo(4, 0)
    expect.soft(methodBox.y - hintBox.y - hintBox.height).toBeCloseTo(8, 0)
    if (width === 360) {
      expect.soft(detectBox.x).toBeCloseTo(methodBox.x, 0)
      expect.soft(detectBox.width).toBeCloseTo(methodBox.width, 0)
      expect
        .soft(detectBox.y - methodBox.y - methodBox.height)
        .toBeCloseTo(8, 0)
    } else {
      expect.soft(detectBox.x - methodBox.x - methodBox.width).toBeCloseTo(8, 0)
      expect.soft(detectBox.y).toBeCloseTo(methodBox.y, 0)
      expect.soft(detectBox.height).toBeCloseTo(methodBox.height, 0)
    }
    expect.soft(scopeBox.y - detectBox.y - detectBox.height).toBeCloseTo(8, 0)
    await captureVisualViews({
      page,
      ready: method,
      captureTarget: checkIn,
      id: `check-in-method-${width}`,
      extensionDir,
    })
  }
  await report.click()
  await expect(
    page.getByRole("dialog", { name: "Check-in feedback" }),
  ).toBeVisible()
})
