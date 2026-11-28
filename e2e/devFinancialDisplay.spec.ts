import { readFile } from "node:fs/promises"
import path from "node:path"
import { PNG } from "pngjs"

import {
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { ACCOUNT_SITE_TYPE_VALUES, SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { buildDevSiteFinancialScenarios } from "~/features/DevPanel/fixtureSiteBalances"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { nativeBalanceExpectations } from "~~/e2e/scenarios/nativeBalanceExpectations"
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

for (const [siteType, label] of [
  [SITE_TYPES.NEW_API, "New API"],
  [SITE_TYPES.SUB2API, "Sub2API"],
] as const) {
  test(`ordinary ${label} balance details show only site facts across extension surfaces`, async ({
    page,
    context,
    extensionId,
    extensionDir,
  }) => {
    test.setTimeout(process.env.AAH_VISUAL_CAPTURE_DIR ? 120_000 : 60_000)
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await page.emulateMedia({ reducedMotion: "reduce" })
    const now = 1794916800000
    await page.clock.install({ time: now })
    const scenario = buildDevSiteFinancialScenarios(now).find(
      (s) => s.siteType === siteType,
    )!
    const worker = await getServiceWorker(context)
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: "ordinary-balance",
        last_sync_time: now,
        site_name: `Ordinary ${label}`,
        site_type: scenario.siteType,
        site_url: scenario.baseUrl,
        account_info: {
          balance: scenario.balance,
          todayStatsAvailability: {
            consumption: { status: "unavailable", reason: "not_collected" },
            income: { status: "unavailable", reason: "not_collected" },
            requests: { status: "unavailable", reason: "not_collected" },
            tokens: { status: "unavailable", reason: "not_collected" },
          },
        },
      }),
    ])
    await seedUserPreferences(worker, {
      themeMode: "light",
      showTodayCashflow: false,
      autoRefresh: false,
    })
    for (const [entry, width] of [
      [POPUP_PAGE_PATH, 320],
      [SIDEPANEL_PAGE_PATH, 390],
      ["options.html#account", 1440],
    ] as const) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`chrome-extension://${extensionId}/${entry}`)
      await waitForExtensionRoot(page)
      const row = page.getByTestId(
        getAccountManagementListItemTestId("ordinary-balance"),
      )
      await row
        .getByRole("button", { name: "Balance details", exact: true })
        .click()
      const details = page.getByRole("dialog", {
        name: "Balance details",
        exact: true,
      })
      await expect(details).toContainText("USD")
      await expect(
        details.getByText("Technical details (debug)", { exact: true }),
      ).toHaveCount(0)
      if (siteType === SITE_TYPES.SUB2API) {
        await expect(
          details.getByText("USD 12.34", { exact: true }),
        ).toBeVisible()
        await expect(details).toContainText("Prepaid credit")
        await expect(details).not.toContainText(/\b(?:quota|Token)\b/i)
      }
      await captureVisualViews({
        page,
        ready: details,
        captureTarget: details,
        id: `ordinary-${siteType}-${width}`,
        extensionDir,
        views: [
          { id: "light", width, height: 900, theme: "light" },
          { id: "dark", width, height: 900, theme: "dark" },
        ],
      })
      if (
        process.env.AAH_VISUAL_CAPTURE_DIR &&
        process.env.AAH_VISUAL_CAPTURE_CONTEXT === "1"
      ) {
        const configuredViews = process.env.AAH_VISUAL_CAPTURE_VIEWS
          ? JSON.parse(process.env.AAH_VISUAL_CAPTURE_VIEWS)
          : null
        const capturedViews = configuredViews ?? [
          { id: "light", width, height: 900 },
          { id: "dark", width, height: 900 },
        ]
        for (const view of capturedViews) {
          const contextFile = path.join(
            process.env.AAH_VISUAL_CAPTURE_DIR!,
            `ordinary-${siteType}-${width}-${view.id}.context`,
          )
          const metadata = JSON.parse(
            await readFile(`${contextFile}.json`, "utf8"),
          )
          expect(metadata.capture).toBe("viewport")
          const contextImage = PNG.sync.read(
            await readFile(`${contextFile}.png`),
          )
          expect(contextImage.width).toBe(view.width)
          expect(contextImage.height).toBe(view.height)
        }
      }
      await expect
        .soft(details)
        .not.toContainText(/unverified|@standard-usd|\/api\//i, {
          timeout: 1000,
        })
      await expect
        .soft(details.locator("time").first())
        .toHaveAttribute("datetime", new Date(now).toISOString())
      expect
        .soft(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
        )
        .toBe(false)
      await page.keyboard.press("Escape")
    }
  })
}

test("keeps narrow balances beside account identity with compact row actions", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  const samples = buildDevSiteFinancialScenarios(Date.now())
  await seedStoredAccounts(
    worker,
    [SITE_TYPES.NANOGPT, SITE_TYPES.CUBENCE].map((siteType, index) => {
      const sample = samples.find((item) => item.siteType === siteType)!
      return createStoredAccount({
        id: `compact-row-${index}`,
        site_name: index ? "Cubence" : "NanoGPT",
        site_type: siteType,
        site_url: sample.baseUrl,
        exchange_rate: 7.2,
        account_info: {
          balance: sample.balance,
          allowances: sample.allowances,
        },
      })
    }),
  )
  await seedUserPreferences(worker, {
    currencyType: "CNY",
    showTodayCashflow: false,
    autoRefresh: false,
  })
  for (const [entry, width, theme] of [
    [POPUP_PAGE_PATH, 320, "light"],
    [SIDEPANEL_PAGE_PATH, 320, "dark"],
    [POPUP_PAGE_PATH, 380, "light"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`chrome-extension://${extensionId}/${entry}`)
    await waitForExtensionRoot(page)
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      theme === "dark",
    )
    for (const [index, amount] of [
      [0, "¥307.80"],
      [1, "¥90.00"],
    ] as const) {
      const row = page.getByTestId(
        getAccountManagementListItemTestId(`compact-row-${index}`),
      )
      const name = (await row
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowOpenButton)
        .boundingBox())!
      const value = (await row
        .getByText(amount, { exact: true })
        .boundingBox())!
      expect(
        value.x,
        "Balance remains beside the account identity",
      ).toBeGreaterThan(name.x + name.width)
      expect(
        Math.abs(value.y + value.height / 2 - name.y - name.height / 2),
        "Primary balance aligns with the account name",
      ).toBeLessThanOrEqual(4)
      expect(
        (await row.boundingBox())!.height,
        "Two native positions remain a compact list row",
      ).toBeLessThanOrEqual(108)
      const copy = (await row
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowCopyUrlButton)
        .boundingBox())!
      const edit = (await row
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton)
        .boundingBox())!
      expect(
        Math.abs(copy.y - edit.y),
        "Quick actions share a compact line",
      ).toBeLessThanOrEqual(1)
      expect(
        copy.x,
        "Row actions form a trailing group rather than a detached left toolbar",
      ).toBeGreaterThan(name.x + name.width)
      const user = (await row
        .getByText("e2e-user", { exact: true })
        .boundingBox())!
      expect(
        Math.abs(copy.y + copy.height / 2 - user.y - user.height / 2),
        "Actions align with the account metadata row",
      ).toBeLessThanOrEqual(4)
      await captureVisualViews({
        page,
        ready: row,
        captureTarget: row,
        id: `compact-paired-${index}-${entry.replace(".html", "")}-${width}-${theme}`,
        extensionDir,
      })
    }
  }
})

test("keeps daily cashflow below the compact account identity and actions", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  const now = Date.now()
  const samples = buildDevSiteFinancialScenarios(now)
  await seedStoredAccounts(
    worker,
    [SITE_TYPES.NANOGPT, SITE_TYPES.CUBENCE].map((type, index) => {
      const sample = samples.find((item) => item.siteType === type)!
      const scope = structuredClone(sample.balance.positions[0]!.scope)
      scope.keys =
        scope.models =
        scope.projects =
        scope.groups =
          { kind: "all" }
      const fact = (value: string) => ({
        scope,
        asset: { kind: "currency", code: "USD" } as const,
        amount: {
          status: "known",
          value,
          observedAt: now,
          source: {
            kind: "reported",
            adapter: "fixture",
            operation: "daily",
            contractVersion: "1",
          },
        } as const,
        window: {
          start: new Date(now).setHours(0, 0, 0, 0),
          end: now,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        coverage: "complete" as const,
      })
      return createStoredAccount({
        id: `cashflow-layout-${index}`,
        site_name: index ? "Cubence" : "NanoGPT",
        site_type: type,
        site_url: sample.baseUrl,
        account_info: {
          balance: sample.balance,
          allowances: sample.allowances,
          settledConsumption: [{ ...fact("0.75"), settlement: "settled" }],
          reportedIncome: [{ ...fact("2.5"), classification: "unclassified" }],
        },
      })
    }),
  )
  await page.setViewportSize({ width: 320, height: 900 })
  const gaps: number[] = []
  for (const showTodayCashflow of [false, true]) {
    await seedUserPreferences(worker, {
      currencyType: "USD",
      showTodayCashflow,
      autoRefresh: false,
      balanceHistory: { estimatedTodayIncome: { enabled: true } },
    })
    await page.goto(`chrome-extension://${extensionId}/${SIDEPANEL_PAGE_PATH}`)
    await waitForExtensionRoot(page)
    for (const index of [0, 1]) {
      const row = page.getByTestId(
        getAccountManagementListItemTestId(`cashflow-layout-${index}`),
      )
      const name = (await row
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowOpenButton)
        .boundingBox())!
      const user = (await row
        .getByTitle("e2e-user", { exact: true })
        .boundingBox())!
      if (!showTodayCashflow) gaps[index] = user.y - name.y
      else {
        expect(
          user.y - name.y,
          "Daily statistics do not separate account identity",
        ).toBeLessThanOrEqual(gaps[index]! + 2)
        const copy = (await row
          .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowCopyUrlButton)
          .boundingBox())!
        const expense = row.getByRole("button").filter({ hasText: /-\$0\.75/ })
        await expect(expense).toBeVisible()
        expect(
          (await expense.boundingBox())!.y,
          "Daily cashflow follows the metadata and action line",
        ).toBeGreaterThanOrEqual(copy.y + copy.height)
        await expect(
          row.getByRole("button").filter({ hasText: /\+\$2\.50/ }),
        ).toBeVisible()
        await expect(
          row.getByText("Estimated net inflow", { exact: true }),
        ).toBeVisible()
        await captureVisualViews({
          page,
          ready: row,
          captureTarget: row,
          id: `daily-cashflow-layout-${index}`,
          extensionDir,
        })
      }
    }
  }
})

// Keep independently seeded workflows within the ordinary per-test deadline.
for (const phase of [
  "overview",
  "asset details",
  "filtered subtotals",
] as const) {
  for (const [entry, width, captureId] of phase === "filtered subtotals"
    ? ([
        [POPUP_PAGE_PATH, 320, "popup-filtered-summary"],
        [SIDEPANEL_PAGE_PATH, 390, "sidepanel-filtered-summary"],
        ["options.html#account", 320, "filtered-summary"],
        ["options.html#account", 390, "filtered-summary"],
        ["options.html#account", 1440, "filtered-summary"],
      ] as const)
    : ([
        [POPUP_PAGE_PATH, 320, "popup-summary"],
        [SIDEPANEL_PAGE_PATH, 390, "sidepanel-summary"],
        ["options.html#account", 1440, "options-summary"],
      ] as const)) {
    test(`mixed native balances preserve ${phase} in ${entry} at ${width}px`, async ({
      page,
      context,
      extensionId,
      extensionDir,
    }) => {
      test.setTimeout(process.env.AAH_VISUAL_CAPTURE_DIR ? 120_000 : 60_000)
      await forceExtensionLanguage(page, "en")
      await stubLlmMetadataIndex(context)
      await page.emulateMedia({ reducedMotion: "reduce" })
      const worker = await getServiceWorker(context)
      const examples = buildDevSiteFinancialScenarios(Date.now())
      const cubenceIndex = examples.findIndex(
        (example) => example.siteType === SITE_TYPES.CUBENCE,
      )
      await seedStoredAccounts(
        worker,
        examples.map((example, index) =>
          createStoredAccount({
            id: `overview-${index}`,
            site_name: `Dev Balance: ${example.label}`,
            site_type: example.siteType,
            site_url: example.baseUrl,
            exchange_rate: 7.2,
            account_info: {
              balance: example.balance,
              allowances: example.allowances,
            },
          }),
        ),
      )
      await seedUserPreferences(worker, {
        themeMode: "light",
        currencyType: "CNY",
        showTodayCashflow: false,
        autoRefresh: false,
      })
      if (phase === "overview") {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`chrome-extension://${extensionId}/${entry}`)
        await waitForExtensionRoot(page)
        if (width === 320 && !entry.startsWith("options")) {
          const row = page.getByTestId(
            getAccountManagementListItemTestId(`overview-${cubenceIndex}`),
          )
          await expect(
            row.getByText("Normal balance", { exact: true }),
          ).toBeVisible()
          for (const name of ["Normal balance", "Charity balance"]) {
            const lines = await row
              .getByText(name, { exact: true })
              .evaluate((element) => {
                const range = document.createRange()
                range.selectNodeContents(element)
                return new Set(
                  [...range.getClientRects()].map((rect) => rect.top),
                ).size
              })
            expect(
              lines,
              `${name} remains readable beside its amount at 320px`,
            ).toBe(1)
          }
          for (const type of [
            SITE_TYPES.FREEMODEL,
            SITE_TYPES.GRSAI,
            SITE_TYPES.UNKNOWN,
          ]) {
            const index = examples.findIndex(
              (example) => example.siteType === type,
            )
            const search = page.getByRole("textbox", {
              name: "Enter site information or account information to search",
            })
            await search.fill(`Dev Balance: ${examples[index]!.label}`)
            const account = page.getByTestId(
              getAccountManagementListItemTestId(`overview-${index}`),
            )
            const expectedAmounts =
              type === SITE_TYPES.FREEMODEL
                ? ["¥124.85"]
                : nativeBalanceExpectations[type]!
            const values = account.getByText(
              new RegExp(
                `^(?:${expectedAmounts.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`,
              ),
            )
            await expect(values.first()).toBeVisible()
            for (const value of await values.all()) {
              expect(
                await value.evaluate(
                  (element) => element.scrollWidth <= element.clientWidth,
                ),
                `${type} keeps the native amount readable at 320px`,
              ).toBe(true)
              const lines = await value.evaluate((element) => {
                const range = document.createRange()
                range.selectNodeContents(element)
                return new Set(
                  [...range.getClientRects()].map((rect) => rect.top),
                ).size
              })
              expect(
                lines,
                `${type} keeps its common native amount and unit on one line`,
              ).toBe(1)
            }
            await search.clear()
          }
        }
        if (entry.startsWith("options")) {
          await page
            .getByRole("textbox", {
              name: "Enter site information or account information to search",
            })
            .fill("Dev Balance:")
          const filteredSummary = page.getByRole("region", {
            name: `${ACCOUNT_SITE_TYPE_VALUES.length} accounts`,
            exact: true,
          })
          await expect(filteredSummary).toBeVisible()
          expect(
            (await filteredSummary.boundingBox())!.height,
            "Filtered totals remain a compact strip above the list",
          ).toBeLessThan(36)
          await expect(
            filteredSummary.getByRole("combobox", { name: "Balance subtotal" }),
          ).toHaveCount(0)
          await filteredSummary
            .getByRole("button", { name: "Details", exact: true })
            .click()
        }
        const summary = entry.startsWith("options")
          ? page.getByRole("dialog", {
              name: "Filtered subtotals",
              exact: true,
            })
          : page.getByRole("region", { name: "Financial totals", exact: true })
        await expect(summary).toContainText("¥2,925.94")
        await captureVisualViews({
          page,
          ready: summary,
          captureTarget: summary,
          id: `mixed-overview-${width}`,
          extensionDir,
          views: [
            { id: "light", width, height: 900, theme: "light" },
            { id: "dark", width, height: 900, theme: "dark" },
          ],
        })
      }
      if (phase === "asset details") {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`chrome-extension://${extensionId}/${entry}`)
        await waitForExtensionRoot(page)
        if (entry.startsWith("options")) {
          await page
            .getByRole("textbox", {
              name: "Enter site information or account information to search",
            })
            .fill("Dev Balance:")
          await page
            .getByRole("button", { name: "Details", exact: true })
            .click()
        }
        const summary = entry.startsWith("options")
          ? page.getByRole("dialog", {
              name: "Filtered subtotals",
              exact: true,
            })
          : page.getByRole("region", { name: "Financial totals", exact: true })
        expect((await summary.boundingBox())!.height).toBeLessThan(180)
        if (!entry.startsWith("options"))
          await summary
            .getByRole("button", { name: "Financial totals", exact: true })
            .click()
        const assetSummary = entry.startsWith("options")
          ? summary
          : page.getByRole("dialog", { name: "Financial totals", exact: true })
        const assets = assetSummary.getByRole(
          "button",
          entry.startsWith("options")
            ? { name: "Balance details", exact: true }
            : { name: /^Assets/ },
        )
        await assets.click()
        const details = entry.startsWith("options")
          ? page.getByRole("dialog", { name: "Balance details", exact: true })
          : assetSummary.getByRole("group", {
              name: "Balance details",
              exact: true,
            })
        await expect(details).toContainText("dahl")
        await expect(details).toContainText("emrank")
        await expect(
          details.getByText("2.5 M Token", { exact: true }),
        ).toHaveCount(2)
        await expect(details).toContainText("XNO")
        await captureVisualViews({
          page,
          ready: details,
          captureTarget: details,
          id: `mixed-overview-details-${width}`,
          extensionDir,
        })
        await page.keyboard.press("Escape")
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
        ).toBe(false)
      }
      if (phase === "filtered subtotals") {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`chrome-extension://${extensionId}/${entry}`)
        await waitForExtensionRoot(page)
        const search = page.getByRole("textbox", {
          name: "Enter site information or account information to search",
        })
        await search.fill("Dev Balance:")
        const summary = page.getByRole("region", {
          name: `${ACCOUNT_SITE_TYPE_VALUES.length} accounts`,
          exact: true,
        })
        await expect(summary).toBeVisible()
        expect(
          await summary.evaluate(
            (element) => element.scrollWidth <= element.clientWidth + 1,
          ),
          "Filtered summary stays within the account panel",
        ).toBe(true)
        await expect(summary.getByRole("combobox")).toHaveCount(0)
        await expect(summary).toContainText("¥2,925.94")
        await captureVisualViews({
          page,
          ready: summary,
          captureTarget: summary,
          id: `${captureId}-closed-${width}`,
          extensionDir,
          views: [{ id: "light", width, height: 900, theme: "light" }],
        })
        await summary
          .getByRole("button", { name: "Details", exact: true })
          .click()
        const totals = page.getByRole("dialog", {
          name: "Filtered subtotals",
          exact: true,
        })
        const amount = totals.getByText("¥2,925.94", { exact: true })
        await expect(amount).toBeVisible()
        expect(
          await amount.evaluate(
            (element) => element.scrollWidth <= element.clientWidth + 1,
          ),
          "The filtered subtotal amount remains readable at narrow widths",
        ).toBe(true)
        await captureVisualViews({
          page,
          ready: totals,
          captureTarget: totals,
          id: `${captureId}-${width}`,
          extensionDir,
          views: [
            { id: "light", width, height: 900, theme: "light" },
            { id: "dark", width, height: 900, theme: "dark" },
          ],
        })
        await search.fill("Dev Balance: novita")
        const singleSummary = page.getByRole("region", {
          name: "1 account",
          exact: true,
        })
        await singleSummary
          .getByRole("button", { name: "Details", exact: true })
          .click()
        await expect(totals.getByRole("combobox")).toHaveCount(0)
        await expect(totals.getByText("¥88.56", { exact: true })).toBeVisible()
        await expect(totals).toContainText("Included 1 of 1 accounts")
        if (entry.startsWith("options") && width !== 390) {
          await captureVisualViews({
            page,
            ready: totals,
            captureTarget: totals,
            id: `filtered-single-${width}`,
            extensionDir,
            views: [
              { id: "light", width, height: 900, theme: "light" },
              { id: "dark", width, height: 900, theme: "dark" },
            ],
          })
        }
        await expect(totals.getByText("¥88.56", { exact: true })).toBeVisible()
        await totals
          .getByRole("button", { name: "Balance details", exact: true })
          .click()
        await expect(
          page.getByRole("dialog", { name: "Balance details", exact: true }),
        ).toContainText("USD 12.3")
        await page.keyboard.press("Escape")
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
        ).toBe(false)
      }
    })
  }
}
