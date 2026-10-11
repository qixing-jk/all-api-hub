/* global chrome */
import fs from "node:fs"
import path from "node:path"

import { withTemporaryAccount } from "../../cdp/sandbox.mjs"
import { openExtensionPage } from "../../cdp/ui-driver.mjs"

/**
 * Live clawhud (詞元公益站, https://api.clawhud.com) check-in flow against the
 * current worktree's mounted extension. Drives the user-visible workflow:
 * seeded account → Edit dialog check-in re-detection (read-only probe of every
 * Sub2API candidate against the live deployment) → unique clawhud match →
 * save → Auto Check-in "Run now" → live status readback result. The temporary
 * account is removed afterwards; the site account itself is untouched.
 *
 * A same-day fresh grant cannot be re-exercised: check-in is once per day, and
 * any earlier check-in (manual or by an earlier run) leaves the live status
 * "already checked", which is itself the authoritative readback asserted here.
 */
const ACCOUNT_ROUTE = "options.html#account"
const AUTO_CHECKIN_ROUTE = "options.html#autoCheckin"
const ROW_TEST_ID_PREFIX = "account-management-account-list-item-"
const ROW_EDIT_BUTTON = "account-management-row-edit-button"
const DIALOG_TEST_ID = "account-management-account-dialog"
const CHECK_IN_SECTION_TEST_ID =
  "account-management-account-form-section-check-in"
const RE_DETECT_BUTTON =
  /Re-detect check-in method|重新检测签到方式|重新偵測簽到方式/
const SAVE_BUTTON = "account-management-confirm-add-button"
const RUN_NOW_BUTTON = "auto-checkin-run-now-button"
const METHOD_ID = "clawhud:daily-checkin"
const EXPECTED_RESULT_STATUSES = new Set(["skipped", "already_checked"])

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function poll(fn, { timeout = 90_000, interval = 1_000, label }) {
  const startedAt = Date.now()
  for (;;) {
    const value = await fn().catch(() => null)
    if (value) return value
    if (Date.now() - startedAt > timeout) {
      throw new Error(`Timed out waiting for ${label}`)
    }
    await sleep(interval)
  }
}

function readSeededAccount(serviceWorker, accountId) {
  return serviceWorker.evaluate(
    (accountId) =>
      chrome.storage.local.get("site_accounts").then((result) => {
        const raw = result.site_accounts
        const envelope = typeof raw === "string" ? JSON.parse(raw) : raw
        const account = (envelope?.accounts || []).find(
          (item) => item.id === accountId,
        )
        const method = account?.checkIn?.methodKnowledge?.methods
        return account
          ? {
              selection: account.checkIn?.selection ?? null,
              methodIds: method ? Object.keys(method) : [],
              detection: method?.["clawhud:daily-checkin"]?.detection ?? null,
            }
          : null
      }),
    accountId,
  )
}

function readRunStatus(serviceWorker, accountId) {
  return serviceWorker.evaluate(
    (accountId) =>
      chrome.storage.local.get("autoCheckin_status").then((result) => {
        const raw = result.autoCheckin_status
        const status = typeof raw === "string" ? JSON.parse(raw) : raw
        const perAccount = status?.perAccount?.[accountId]
        if (!perAccount) return null
        return {
          status: perAccount.status,
          reasonCode: perAccount.reasonCode ?? null,
          methodId: perAccount.methodId ?? null,
          message: perAccount.rawMessage ?? perAccount.messageKey ?? null,
          reward: perAccount.reward ?? null,
        }
      }),
    accountId,
  )
}

export async function runClawhudUiTest({
  context,
  extensionId,
  serviceWorker,
  token,
  screenshotsDir,
}) {
  if (!token) throw new Error("missing clawhud access token")
  fs.mkdirSync(screenshotsDir, { recursive: true })

  return await withTemporaryAccount(
    serviceWorker,
    {
      site_name: "詞元公益站",
      site_url: "https://api.clawhud.com",
      site_type: "sub2api",
      authType: "access_token",
      exchange_rate: 7.2,
      checkIn: {
        automaticExecutionEnabled: true,
        methodKnowledge: { methods: {} },
        selection: { mode: "automatic" },
      },
      account_info: {
        id: "200",
        access_token: token,
        username: "clawhud-live-user",
      },
    },
    async (fixture) => {
      const accountPage = await openExtensionPage({
        context,
        extensionId,
        route: ACCOUNT_ROUTE,
      })
      try {
        // 1. Open the seeded account in the Edit dialog. The shared dev profile
        //    holds many operator accounts and the list is virtualized, so
        //    filter by the site name before hovering the edit trigger.
        const searchInput = accountPage
          .locator('input[placeholder*="搜索"], input[placeholder*="Search"]')
          .first()
        if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await searchInput.fill("詞元公益站")
          await accountPage.waitForTimeout(800)
        }
        const row = accountPage.getByTestId(
          `${ROW_TEST_ID_PREFIX}${fixture.id}`,
        )
        await row.waitFor({ state: "visible", timeout: 20000 })
        await row.hover()
        await row.getByTestId(ROW_EDIT_BUTTON).click()
        const dialog = accountPage.getByTestId(DIALOG_TEST_ID)
        await dialog.waitFor({ state: "visible", timeout: 10000 })

        // 2. Drive the dialog's read-only re-detection; the live deployment
        //    must match the unique clawhud candidate. The dialog keeps the
        //    result in its draft until save, so observe the section itself.
        const checkInSection = dialog.getByTestId(CHECK_IN_SECTION_TEST_ID)
        await checkInSection
          .getByRole("button")
          .filter({ hasText: RE_DETECT_BUTTON })
          .first()
          .click()
        // The candidate list always renders this site's method name, so wait
        // for the busy indicator to clear instead of scanning for the label.
        await poll(
          async () => {
            const texts = await checkInSection
              .getByRole("button")
              .allInnerTexts()
              .catch(() => [])
            const busy = texts.some((label) =>
              /Detecting check-in method|检测签到方式中|正在检测签到方式/.test(
                label,
              ),
            )
            return busy ? null : true
          },
          { timeout: 120_000, label: "clawhud method detection to finish" },
        )
        const detected = await readSeededAccount(serviceWorker, fixture.id)
        console.log(
          `  [live] 检测命中并在对话框中选中詞元公益站方式 (storage draft: ${detected?.selection?.methodId ?? "not persisted yet"})`,
        )
        await accountPage.screenshot({
          path: path.join(screenshotsDir, "clawhud-live-redetected.png"),
          fullPage: true,
        })

        // 3. Persist the detected selection through the dialog's save path.
        await dialog.getByTestId(SAVE_BUTTON).click()
        const persisted = await poll(
          async () => {
            const account = await readSeededAccount(serviceWorker, fixture.id)
            return account?.selection?.methodId === METHOD_ID ? account : null
          },
          { label: "clawhud selection persistence" },
        )
        console.log(
          `  [live] 检测结果已随账号保存: mode=${persisted.selection?.mode} methods=${persisted.methodIds.join(", ")}`,
        )
        const detectedKnowledge = persisted.detection
        if (detectedKnowledge?.outcome !== "matched") {
          throw new Error(
            `expected matched detection after save, got ${detectedKnowledge?.outcome}`,
          )
        }

        // 4. Execute the promised workflow through the Auto Check-in page.
        const checkinPage = await openExtensionPage({
          context,
          extensionId,
          route: AUTO_CHECKIN_ROUTE,
        })
        try {
          await checkinPage.getByTestId(RUN_NOW_BUTTON).waitFor({
            state: "visible",
            timeout: 15000,
          })
          await checkinPage.getByTestId(RUN_NOW_BUTTON).click()
          const result = await poll(
            async () => {
              const value = await readRunStatus(serviceWorker, fixture.id)
              if (!value || !EXPECTED_RESULT_STATUSES.has(value.status)) {
                return null
              }
              // Skip records do not carry a methodId; success does.
              return value.methodId && value.methodId !== METHOD_ID
                ? null
                : value
            },
            { label: "clawhud live run result" },
          )
          console.log(
            `  [live] 执行结果: status=${result.status} method=${result.methodId ?? "-"} reason=${result.reasonCode ?? "-"} reward=${result.reward ? result.reward.quota : "-"}`,
          )
          if (
            result.reasonCode &&
            result.reasonCode !== "already_checked" &&
            result.reasonCode !== "already_checked_today"
          ) {
            // A live failure with a different reason is evidence, not a pass.
            throw new Error(
              `unexpected skip reason: ${result.reasonCode} (${result.message})`,
            )
          }
          await checkinPage.screenshot({
            path: path.join(screenshotsDir, "clawhud-live-result.png"),
            fullPage: true,
          })
          return { ok: true, result }
        } finally {
          await checkinPage.close().catch(() => {})
        }
      } finally {
        await accountPage.close().catch(() => {})
      }
    },
  )
}
