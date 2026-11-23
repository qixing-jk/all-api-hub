import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import { getAccountManagementListItemTestId } from "~/features/AccountManagement/testIds"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition } from "~/services/amounts/balance"
import { newApiFinancialAmount } from "~/services/apiService/newApiFamily/quotaAsset"
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
import {
  loginToCompatibleApiRealSite,
  resolveCompatibleApiRealSiteConfig,
} from "~~/e2e/utils/realSite/compatibleApi"
import {
  loginToRealSub2ApiSite,
  resolveSub2ApiRealSiteConfig,
} from "~~/e2e/utils/realSite/sub2api"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

const targets = [
  { prefix: "NEW_API", type: SITE_TYPES.NEW_API, route: "/console" },
  { prefix: "DONE_HUB", type: SITE_TYPES.DONE_HUB, route: "/panel" },
  { prefix: "VELOERA", type: SITE_TYPES.VELOERA, route: "/app/dashboard" },
  { prefix: "SUB2API", type: SITE_TYPES.SUB2API, route: "/dashboard" },
] as const

// Read the existing CI deployments; only log in and read finance. No resource creation.
export function registerBalanceDefaultDisplayTests(
  prefix: (typeof targets)[number]["prefix"],
) {
  const target = targets.find((candidate) => candidate.prefix === prefix)!
  test.describe("native balance comparison", () => {
    test.use({ screenshot: "off", trace: "off", video: "off" })
    test.skip(
      () => Boolean(process.env.AAH_E2E_USER_DATA_DIR),
      "The balance comparison seeds accounts and preferences in a disposable profile.",
    )
    test(`matches ${target.type} CI console default balance`, async ({
      page,
      context,
      extensionId,
      extensionDir,
    }) => {
      // Opt-in Sub2API capture includes six detail states and both themes.
      test.setTimeout(
        target.prefix === "SUB2API" && process.env.AAH_VISUAL_CAPTURE_DIR
          ? 240_000
          : 120_000,
      )
      await page.emulateMedia({ reducedMotion: "reduce" })
      const resolution =
        target.prefix === "SUB2API"
          ? resolveSub2ApiRealSiteConfig()
          : resolveCompatibleApiRealSiteConfig({ envPrefix: target.prefix })
      test.skip(
        !resolution.config,
        `Missing CI configuration: ${resolution.missingEnvKeys.join(", ")}`,
      )
      const config = resolution.config!
      const native = await context.newPage()
      let cleanupOwnedSession: (() => Promise<void>) | undefined
      try {
        if ("login2faApiUrl" in config) {
          const login = await loginToCompatibleApiRealSite(native, config, {
            label: target.type,
            envPrefix: target.prefix,
            authBundle: target.prefix === "NEW_API",
          })
          cleanupOwnedSession = login.cleanupOwnedSession
        } else {
          await loginToRealSub2ApiSite(native, config)
        }

        const sub2api = target.prefix === "SUB2API"
        const endpoint = sub2api ? "/api/v1/auth/me" : "/api/user/self"
        const responseUrl = new URL(endpoint, config.baseUrl)
        const [balanceResponse] = await Promise.all([
          native.waitForResponse(
            (response) => {
              const url = new URL(response.url())
              return (
                url.origin === responseUrl.origin &&
                url.pathname === responseUrl.pathname &&
                response.status() === 200 &&
                response.request().method() === "GET"
              )
            },
            { timeout: 30_000 },
          ),
          native.goto(new URL(target.route, config.baseUrl).href, {
            waitUntil: "domcontentloaded",
          }),
        ])
        const body = await balanceResponse.json()
        const data = body.data ?? body
        const observation = {
          endpoint,
          status: balanceResponse.status(),
          raw: sub2api ? data.balance : data.quota,
        }
        expect(observation.raw).toBeDefined()
        const amount =
          target.prefix === "SUB2API"
            ? {
                value: String(observation.raw),
                asset: { kind: "currency" as const, code: "USD" },
              }
            : newApiFinancialAmount(
                observation.raw,
                config.baseUrl,
                target.type,
              )
        const expected = `$${Number(amount.value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        // Native formatters may omit thousands separators; compare the same number.
        const nativeAmount = `$${Number(amount.value).toFixed(2)}`
        const nativeValue =
          target.prefix === "DONE_HUB"
            ? native
                .getByText(`可用额度: ${nativeAmount}`, { exact: true })
                .first()
            : native.getByText(nativeAmount, { exact: true }).first()
        await expect(nativeValue).toBeVisible({ timeout: 20_000 })
        const evidenceDir = process.env.AAH_BALANCE_NATIVE_EVIDENCE_DIR
        if (evidenceDir) {
          const root = path.resolve(evidenceDir)
          await mkdir(root, { recursive: true })
          const attempt = await mkdtemp(path.join(root, `${target.type}-`))
          await nativeValue.locator("..").screenshot({
            path: path.join(attempt, "balance.png"),
            animations: "disabled",
          })
          await writeFile(
            path.join(attempt, "balance.json"),
            JSON.stringify(
              {
                type: target.type,
                url: new URL(target.route, config.baseUrl).href,
                ...observation,
                nativeAmount,
                canonicalUsd: amount.value,
              },
              null,
              2,
            ),
          )
        }

        await forceExtensionLanguage(page, "en")
        await stubLlmMetadataIndex(context)
        const at = Date.now()
        const scope = accountBalanceScope({
          baseUrl: `https://ci-balance-${target.type.toLowerCase()}.invalid`,
          accountId: target.type,
        })
        const source = {
          adapter: target.type,
          operation:
            target.prefix === "SUB2API"
              ? `${observation.endpoint}:balance`
              : observation.endpoint,
          contractVersion:
            target.prefix === "SUB2API" ? "usd/v1" : "matched-ci/v1",
          kind: "reported" as const,
        }
        const account = createStoredAccount({
          id: target.type,
          site_type: target.type,
          site_name: `CI balance: ${target.type}`,
          site_url: scope.authority,
          exchange_rate: 7,
          account_info: {
            balance: accountBalanceSnapshot(
              scope,
              [
                balancePosition({
                  id: target.prefix === "SUB2API" ? "balance" : "available",
                  ...(target.prefix === "SUB2API"
                    ? { collectionKey: "wallet", nature: "prepaid" as const }
                    : {}),
                  asset: amount.asset,
                  value: amount.value,
                  scope,
                  source,
                  observedAt: at,
                }),
              ],
              at,
              "complete",
            ),
          },
        })
        const worker = await getServiceWorker(context)
        await seedStoredAccounts(worker, [account])
        await seedUserPreferences(worker, {
          currencyType: "USD",
          showTodayCashflow: false,
          autoRefresh: false,
        })
        await page.goto(
          `chrome-extension://${extensionId}/options.html#account`,
        )
        await waitForExtensionRoot(page)
        const row = page.getByTestId(
          getAccountManagementListItemTestId(target.type),
        )
        await expect(row).toContainText(expected)
        await captureVisualViews({
          page,
          ready: row,
          captureTarget: row,
          id: `ci-${target.type.toLowerCase()}`,
          extensionDir,
          views: [
            { id: "light", width: 1440, height: 1000, theme: "light" },
            { id: "dark", width: 390, height: 1000, theme: "dark" },
          ],
        })
        if (target.prefix === "SUB2API") {
          for (const [entry, width] of [
            [POPUP_PAGE_PATH, 320],
            [SIDEPANEL_PAGE_PATH, 390],
            ["options.html#account", 1440],
          ] as const) {
            for (const currencyType of ["USD", "CNY"] as const) {
              await seedUserPreferences(worker, {
                currencyType,
                themeMode: "light",
                showTodayCashflow: false,
                autoRefresh: false,
              })
              await page.setViewportSize({ width, height: 900 })
              const destination = `chrome-extension://${extensionId}/${entry}`
              // Same Options hash navigation retains the mounted preferences.
              if (page.url() === destination) await page.reload()
              else await page.goto(destination)
              await waitForExtensionRoot(page)
              const accountRow = page.getByTestId(
                getAccountManagementListItemTestId(target.type),
              )
              await expect(accountRow).toContainText(
                currencyType === "USD"
                  ? expected
                  : `¥${(Number(amount.value) * 7).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              )
              await accountRow
                .getByRole("button", { name: "Balance details", exact: true })
                .click()
              const details = page.getByRole("dialog", {
                name: "Balance details",
                exact: true,
              })
              const exactUsd = `USD ${Number(observation.raw).toLocaleString("en-US", { maximumFractionDigits: 20 })}`
              await expect(
                details.getByText(exactUsd, { exact: true }),
              ).toHaveCount(1)
              await expect(
                details.getByText(exactUsd, { exact: true }),
              ).toBeVisible()
              await expect(details).not.toContainText(/\b(?:quota|Token)\b/i)
              await expect(details).toContainText("Prepaid credit")
              await expect(details).not.toContainText(/unverified|\/api\//i)
              await expect(
                details.getByText("Technical details (debug)", { exact: true }),
              ).toHaveCount(0)
              await captureVisualViews({
                page,
                ready: details,
                captureTarget: details,
                id: `ci-sub2api-details-${width}-${currencyType}`,
                extensionDir,
                views: [
                  { id: "light", width, height: 900, theme: "light" },
                  { id: "dark", width, height: 900, theme: "dark" },
                ],
              })
              await details
                .getByRole("button", { name: "Close", exact: true })
                .click()
              await page.mouse.move(0, 0)
            }
          }
          await page.evaluate(() =>
            localStorage.setItem("aah_dev_features_unlocked", "true"),
          )
          await page.reload()
          await waitForExtensionRoot(page)
          await page
            .getByTestId(getAccountManagementListItemTestId(target.type))
            .getByRole("button", { name: "Balance details", exact: true })
            .click()
          const details = page.getByRole("dialog", {
            name: "Balance details",
            exact: true,
          })
          const rawSource = details.getByText(
            /sub2api\/\/api\/v1\/auth\/me:balance@usd\/v1/,
          )
          await expect(rawSource).not.toBeVisible()
          await details
            .getByText("Technical details (debug)", { exact: true })
            .click()
          await expect(rawSource).toBeVisible()
          await captureVisualViews({
            page,
            ready: rawSource,
            captureTarget: details,
            id: "ci-sub2api-technical-details",
            extensionDir,
          })
        }
      } finally {
        try {
          await cleanupOwnedSession?.()
        } finally {
          await native.close()
        }
      }
    })
  })
}
