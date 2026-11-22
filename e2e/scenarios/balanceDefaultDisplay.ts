import { mkdir, writeFile } from "node:fs/promises"
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
import { resolveCompatibleApiRealSiteConfig } from "~~/e2e/utils/realSite/compatibleApi"
import {
  createLocatorFactory,
  maybeCheckAgreement,
  maybeRevealUsernamePasswordLogin,
  requireVisibleLocator,
} from "~~/e2e/utils/realSite/shared"
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
  prefix?: (typeof targets)[number]["prefix"],
) {
  for (const target of targets.filter(
    (target) => !prefix || target.prefix === prefix,
  )) {
    test(`matches ${target.type} CI console default balance`, async ({
      page,
      context,
      extensionId,
      extensionDir,
    }, testInfo) => {
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
      let authHeaders: Record<string, string> = {}
      native.on("request", (request) => {
        if (
          request
            .url()
            .startsWith(new URL("/api/user/self", config.baseUrl).href)
        ) {
          const headers = request.headers()
          authHeaders = {
            ...authHeaders,
            ...Object.fromEntries(
              Object.entries(headers).filter(([key]) =>
                ["authorization", "new-api-user", "veloera-user"].includes(key),
              ),
            ),
          }
        }
      })
      try {
        if (target.prefix === "SUB2API") {
          await loginToRealSub2ApiSite(native, config)
        } else {
          await native.goto(config.loginUrl, { waitUntil: "domcontentloaded" })
          const locators = createLocatorFactory(`AAH_E2E_${target.prefix}`)
          await maybeRevealUsernamePasswordLogin(
            native,
            () => locators.getUsernameCandidates(config),
            () => locators.getPasswordCandidates(config),
          )
          await (
            await requireVisibleLocator(
              native,
              locators.getUsernameCandidates(config),
              15_000,
            )
          ).fill(config.username)
          await (
            await requireVisibleLocator(
              native,
              locators.getPasswordCandidates(config),
              15_000,
            )
          ).fill(config.password)
          await maybeCheckAgreement(native, config.agreeSelector)
          const loginResponse = native.waitForResponse(
            (response) =>
              /\/api\/user\/(?:auth\/)?login(?:\?|$)/.test(response.url()) &&
              response.request().method() === "POST",
            { timeout: 30_000 },
          )
          await (
            await requireVisibleLocator(
              native,
              locators.getSubmitCandidates(config),
              15_000,
            )
          ).click()
          const loginBody = await (await loginResponse).json()
          const token = loginBody.data?.access_token
          if (typeof token === "string")
            authHeaders.authorization = `Bearer ${token}`
          await native.waitForURL((url) => !url.pathname.includes("login"), {
            timeout: 30_000,
          })
          await expect(native.locator("input[type=password]")).toHaveCount(0)
        }
        await native.goto(new URL(target.route, config.baseUrl).href, {
          waitUntil: "commit",
        })
        const observation = await native.evaluate(
          async ({ sub2api, capturedHeaders }) => {
            const headers: Record<string, string> = { ...capturedHeaders }
            if (sub2api) {
              const token = localStorage.getItem("auth_token")
              if (token) headers.Authorization = `Bearer ${token}`
            } else {
              const user = JSON.parse(localStorage.getItem("user") ?? "{}")
              if (user.id) headers["New-Api-User"] = String(user.id)
              const token = localStorage.getItem("access_token")
              if (token) headers.Authorization = `Bearer ${token}`
            }
            const endpoint = sub2api ? "/api/v1/auth/me" : "/api/user/self"
            const response = await fetch(endpoint, {
              credentials: "include",
              headers,
            })
            const body = await response.json()
            const data = body.data ?? body
            return {
              endpoint,
              status: response.status,
              raw: sub2api ? data.balance : data.quota,
            }
          },
          {
            sub2api: target.prefix === "SUB2API",
            capturedHeaders: authHeaders,
          },
        )
        expect(observation.status).toBe(200)
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
        const nativeRegion = nativeValue.locator("..")
        const nativeBox = await nativeRegion.boundingBox()
        const evidence = path.resolve(
          process.env.AAH_BALANCE_NATIVE_EVIDENCE_DIR ??
            testInfo.outputPath("native"),
        )
        await mkdir(evidence, { recursive: true })
        if (nativeBox)
          await native.screenshot({
            path: path.join(evidence, `${target.type}.png`),
            clip: nativeBox,
            animations: "disabled",
          })
        await writeFile(
          path.join(evidence, `${target.type}.json`),
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
        await native.close()
      }
    })
  }
}
