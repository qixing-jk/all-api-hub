import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { getAccountManagementListItemTestId } from "~/features/AccountManagement/testIds"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/configuration/compatibilityConfig"
import {
  mergeCompatibilityCheckInStatus,
  replaceCheckInMethodStatus,
} from "~/services/checkin/autoCheckin/state"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

test("check-in states distinguish pending, failure and manual verification with automation disabled", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    language: "zh-CN",
    refreshOnOpen: false,
    autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
  })
  const config = () =>
    createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: true,
      automaticExecutionEnabled: false,
    })
  const known = (checked: boolean, observedAt = Date.now()) =>
    mergeCompatibilityCheckInStatus({
      config: config(),
      methodId: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
      isCheckedInToday: checked,
      observedAt,
    })
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "checked",
      site_name: "今日已签到",
      checkIn: known(true),
    }),
    createStoredAccount({
      id: "not-checked",
      site_name: "今日未签到",
      checkIn: known(false),
    }),
    createStoredAccount({
      id: "outdated",
      site_name: "昨日结果待更新",
      checkIn: known(true, Date.now() - 172800000),
    }),
    createStoredAccount({
      id: "pending",
      site_name: "尚未查询",
      checkIn: config(),
    }),
    createStoredAccount({
      id: "failed",
      site_name: "查询失败保留上次结果",
      checkIn: replaceCheckInMethodStatus({
        config: known(true, Date.now() - 172800000),
        methodId: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
        status: {
          outcome: "unknown",
          reason: "network",
          attemptedAt: Date.now(),
        },
      }),
    }),
    createStoredAccount({
      id: "manual",
      site_name: "不支持状态查询",
      site_type: SITE_TYPES.ANYROUTER,
      checkIn: createCompatibilityCheckInConfig({
        siteType: SITE_TYPES.ANYROUTER,
        supported: true,
        automaticExecutionEnabled: false,
      }),
    }),
  ])
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  const row = (id: string) =>
    page.getByTestId(getAccountManagementListItemTestId(id))
  await expect(
    row("checked").getByRole("button", {
      name: "今日已签到，点我查看",
      exact: true,
    }),
  ).toBeVisible()
  for (const [id, label] of [
    ["outdated", /签到状态待更新/],
    ["pending", /尚未查询签到状态/],
    ["manual", /^此签到方式不支持状态查询/],
  ] as const) {
    const button = row(id).getByRole("button", { name: label })
    await expect(button).toBeVisible()
    await expect(button.locator("svg")).toHaveClass(/text-neutral-indicator/)
  }
  const failed = row("failed").getByRole("button", {
    name: /签到状态更新失败.*上次确认已签到/,
  })
  await expect(failed).toBeVisible()
  await expect(failed.locator("svg")).toHaveClass(/text-warning-indicator/)
  await captureVisualViews({
    page,
    ready: failed,
    extensionDir,
    id: "check-in-status",
    views: [
      { id: "desktop-light", width: 1280, height: 900, theme: "light" },
      { id: "mobile-dark", width: 390, height: 900, theme: "dark" },
    ],
  })
  // A page left open across days must update its rows and filter inputs together.
  await page.clock.setFixedTime(Date.now() + 172800000)
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await expect(
    row("checked").getByRole("button", { name: /签到状态待更新/ }),
  ).toBeVisible()
  await expect(
    row("failed").getByRole("button", {
      name: /签到状态更新失败.*上次确认已签到/,
    }),
  ).toBeVisible()
})

test("check-in entry explains configuration and automation gates while keeping daily results primary", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    language: "zh-CN",
    refreshOnOpen: false,
    autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
  })
  const config = (supported = true) =>
    createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported,
      automaticExecutionEnabled: true,
    })
  const invalid = config()
  invalid.methodKnowledge.methods[
    AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn
  ]!.detection = {
    outcome: "unsupported",
    evidence: { source: "probe", observedAt: Date.now() },
  }
  const disabledSite = replaceCheckInMethodStatus({
    config: config(),
    methodId: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
    status: {
      outcome: "known",
      availability: "disabled",
      evidence: { source: "probe", observedAt: Date.now() },
    },
  })
  const checked = mergeCompatibilityCheckInStatus({
    config: config(),
    methodId: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
    isCheckedInToday: true,
    observedAt: Date.now(),
  })
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "needs-config",
      site_name: "自动签到待配置",
      checkIn: config(false),
    }),
    createStoredAccount({
      id: "invalid-method",
      site_name: "签到方式需重新检测",
      checkIn: invalid,
    }),
    createStoredAccount({
      id: "site-disabled",
      site_name: "站点已关闭签到",
      checkIn: disabledSite,
    }),
    createStoredAccount({
      id: "global-paused",
      site_name: "今日已签到：全局暂停",
      checkIn: checked,
    }),
    createStoredAccount({
      id: "account-disabled",
      site_name: "今日已签到：账号禁用",
      disabled: true,
      checkIn: checked,
    }),
  ])
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  const row = (id: string) =>
    page.getByTestId(getAccountManagementListItemTestId(id))
  const configure = row("needs-config").getByRole("button", {
    name: /自动签到待配置.*点击编辑账号/,
  })
  await expect(configure).toBeVisible()
  await expect(configure).toHaveAttribute(
    "aria-description",
    /全局.*关闭|全局.*暂停/,
  )
  await expect(configure.locator("svg")).toHaveClass(/text-neutral-indicator/)
  await expect(
    row("invalid-method")
      .getByRole("button", { name: /重新检测/ })
      .first(),
  ).toBeVisible()
  await expect(
    row("site-disabled").getByRole("button", { name: /站点未开启签到/ }),
  ).toBeVisible()
  const current = row("global-paused").getByRole("button", {
    name: "今日已签到，点我查看",
    exact: true,
  })
  await expect(current).toHaveAttribute(
    "aria-description",
    /全局.*关闭|全局.*暂停/,
  )
  const disabledStatus = row("account-disabled").getByRole("button", {
    name: "今日已签到，点我查看",
    exact: true,
  })
  await expect(disabledStatus).toBeDisabled()
  await expect(disabledStatus).toHaveAttribute("aria-description", /账号已禁用/)
  // Capture rows before opening configuration.
  await captureVisualViews({
    page,
    ready: configure,
    extensionDir,
    id: "unified-check-in",
    views: [
      { id: "desktop-light", width: 1280, height: 900, theme: "light" },
      { id: "mobile-dark", width: 390, height: 900, theme: "dark" },
    ],
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  await configure.hover()
  await expect(
    page
      .getByRole("tooltip")
      .filter({ hasText: /自动签到待配置.*全局开关已关闭/ }),
  ).toBeVisible()
  await captureVisualViews({
    page,
    ready: configure,
    extensionDir,
    id: "unified-check-in-detail",
    views: [{ id: "desktop-dark", width: 1280, height: 900, theme: "dark" }],
  })
  await configure.click()
  await expect(page.getByRole("dialog")).toBeVisible()
})
