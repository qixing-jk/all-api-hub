import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition } from "~/services/amounts/balance"
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

// Native observations and representative default contracts, all rendered as controlled fixtures.
const samples = [
  { id: "laozhang", type: SITE_TYPES.LAOZHANG, value: "0.1" },
  { id: "apiyi", type: SITE_TYPES.APIYI, value: "0.05" },
  { id: "relayfor", type: SITE_TYPES.RELAYFOR, value: "1.88", extra: "3.76" },
  { id: "cubence", type: SITE_TYPES.CUBENCE, value: "0", extra: "0" },
  { id: "kimi", type: SITE_TYPES.KIMI, value: "0" },
  { id: "kimi-global", type: SITE_TYPES.KIMI_GLOBAL, value: "0" },
  { id: "novita", type: SITE_TYPES.NOVITA, value: "0" },
  { id: "dahl", type: SITE_TYPES.DAHL, value: "0" },
  {
    id: "anyrouter",
    type: SITE_TYPES.ANYROUTER,
    value: "5170.3695",
    expected: "$5,170.37",
  },
  { id: "modelflare", type: SITE_TYPES.MODELFLARE, value: "0.25" },
  {
    id: "emrank",
    type: SITE_TYPES.EMRANK,
    value: "52998325",
    expected: "53 M Token",
  },
  {
    id: "xiaoen",
    type: SITE_TYPES.XIAOEN,
    value: "38633",
    expected: "38.6K Credits",
  },
  {
    id: "grsai",
    type: SITE_TYPES.GRSAI,
    value: "5000",
    expected: "5,000 Credits",
  },
  { id: "daya", type: SITE_TYPES.DAYA, value: "5" },
  { id: "krill", type: SITE_TYPES.KRILL, value: "0" },
  { id: "rightcode", type: SITE_TYPES.RIGHT_CODE, value: "0" },
  { id: "aihubmix", type: SITE_TYPES.AIHUBMIX, value: "0" },
  { id: "aimlapi", type: SITE_TYPES.AIMLAPI, value: "0" },
  { id: "requesty", type: SITE_TYPES.REQUESTY, value: "0" },
  {
    id: "openrouter",
    type: SITE_TYPES.OPENROUTER,
    value: "-0.2",
    expected: "-$0.20",
  },
  { id: "vercel-ai-gateway", type: SITE_TYPES.VERCEL_AI_GATEWAY, value: "0" },
  { id: "nanogpt", type: SITE_TYPES.NANOGPT, value: "0" },
  {
    id: "new-api",
    type: SITE_TYPES.NEW_API,
    value: "3671.208938",
    expected: "$3,671.21",
  },
  {
    id: "sub2api",
    type: SITE_TYPES.SUB2API,
    value: "3.9763",
    expected: "$3.98",
  },
] as const

test("compares native site amounts in matched account rows and balance details", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  test.setTimeout(180_000)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await getServiceWorker(context)
  const at = 1700000000000
  const accounts = samples.map((sample) => {
    const scope = accountBalanceScope({
      baseUrl: `https://compare-${sample.id}.invalid`,
      accountId: sample.id,
    })
    const source = {
      adapter: sample.type,
      operation: "matched-native-sample",
      contractVersion: "1",
      kind: "reported",
    } as const
    const asset =
      sample.id === "kimi"
        ? ({ kind: "currency", code: "CNY" } as const)
        : ["dahl", "emrank", "grsai", "xiaoen"].includes(sample.id)
          ? ({
              kind: "quota",
              id: `${sample.id}:tokens`,
              label: ["grsai", "xiaoen"].includes(sample.id)
                ? "Credits"
                : "Token",
              displayScale: ["grsai", "xiaoen"].includes(sample.id)
                ? 1
                : 1000000,
              displayLabel: ["grsai", "xiaoen"].includes(sample.id)
                ? "Credits"
                : "M Token",
            } as const)
          : ({ kind: "currency", code: "USD" } as const)
    const p = (
      id: string,
      value: string,
      labelKey?:
        | "normalBalance"
        | "charityBalance"
        | "permanentBalance"
        | "timedBalance",
    ) =>
      balancePosition({
        id,
        value,
        labelKey,
        scope,
        source,
        asset,
        observedAt: at,
      })
    const positions =
      sample.id === "relayfor"
        ? [
            p("permanent", sample.value, "permanentBalance"),
            p("timed", sample.extra, "timedBalance"),
          ]
        : sample.id === "cubence"
          ? [
              p("normal", sample.value, "normalBalance"),
              p("charity", sample.extra, "charityBalance"),
            ]
          : sample.id === "nanogpt"
            ? [
                p("usd", sample.value),
                balancePosition({
                  id: "xno",
                  value: "0",
                  scope,
                  source,
                  asset: { kind: "crypto", id: "XNO" },
                  observedAt: at,
                }),
              ]
            : sample.id === "xiaoen"
              ? [
                  p("total", sample.value),
                  {
                    ...p("permanent", "36000", "permanentBalance"),
                    parentId: "total",
                    relation: "component" as const,
                  },
                  {
                    ...p("daily", "2633"),
                    labelKey: "dailyBalance" as const,
                    parentId: "total",
                    relation: "component" as const,
                  },
                ]
              : [p("available", sample.value)]
    return createStoredAccount({
      id: sample.id,
      site_name: `Comparison: ${sample.id}`,
      site_url: scope.authority,
      site_type: sample.type,
      last_sync_time: at,
      account_info: {
        balance: accountBalanceSnapshot(scope, positions, at, "complete"),
      },
    })
  })
  await seedStoredAccounts(worker, accounts)
  await seedUserPreferences(worker, {
    themeMode: "light",
    currencyType: "USD",
    currencyDisplay: "original",
    showTodayCashflow: false,
    autoRefresh: false,
  })
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  const show = async (id: string) => {
    await page
      .getByRole("textbox", {
        name: "Enter site information or account information to search",
      })
      .fill(`Comparison: ${id}`)
    const row = page.getByTestId(getAccountManagementListItemTestId(id))
    await expect(row).toBeVisible()
    return row
  }
  for (const sample of samples) {
    const row = await show(sample.id)
    await expect(row).toContainText(
      "expected" in sample
        ? sample.expected
        : sample.id === "dahl"
          ? "0 M Token"
          : sample.id === "kimi"
            ? "¥0.00"
            : `$${Number(sample.value).toFixed(2)}`,
    )
    await captureVisualViews({
      page,
      ready: row,
      captureTarget: row,
      id: `compare-${sample.id}`,
      extensionDir,
      views: [
        { id: "light", width: 1440, height: 1000, theme: "light" },
        { id: "dark", width: 390, height: 1000, theme: "dark" },
      ],
    })
    if (
      [
        "relayfor",
        "cubence",
        "novita",
        "new-api",
        "sub2api",
        "xiaoen",
        "grsai",
        "emrank",
        "nanogpt",
      ].includes(sample.id)
    ) {
      await row
        .getByRole("button", { name: "Balance details", exact: true })
        .click()
      const details = page.getByRole("dialog", {
        name: "Balance details",
        exact: true,
      })
      await expect(details).toBeVisible()
      if (sample.id === "relayfor" || sample.id === "cubence") {
        const positions =
          sample.id === "relayfor"
            ? [
                ["Permanent credit", `USD ${sample.value}`],
                ["Timed credit", `USD ${sample.extra}`],
              ]
            : [
                ["Normal balance", `USD ${sample.value}`],
                ["Charity balance", `USD ${sample.extra}`],
              ]
        for (const [label, amount] of positions) {
          await expect(
            details
              .getByText(label!, { exact: true })
              .locator("..")
              .getByText(amount!, { exact: true }),
          ).toBeVisible()
        }
      }
      if (sample.id === "new-api")
        await expect(details).toContainText("3,671.208938")
      if (sample.id === "sub2api") await expect(details).toContainText("3.9763")
      if (sample.id === "xiaoen") {
        await expect(
          details.getByText("38,633 Credits", { exact: true }),
        ).toBeVisible()
      }
      await captureVisualViews({
        page,
        ready: details,
        captureTarget: details,
        id: `compare-${sample.id}-details`,
        extensionDir,
        views: [{ id: "light", width: 1440, height: 1000, theme: "light" }],
      })
      await page.keyboard.press("Escape")
    }
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const sample of samples) {
      const row = await show(sample.id)
      await row.hover()
      const actions = row
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowCopyUrlButton)
        .locator("..")
      const balance = row.getByRole("button").filter({
        has: page.getByRole("group"),
      })
      await expect(balance).toBeVisible()
      const actionBox = (await actions.boundingBox())!
      const balanceBox = (await balance.boundingBox())!
      if (width === 1440) {
        expect(
          actionBox.x + actionBox.width,
          `${sample.id} actions stay to the left of the balance on desktop`,
        ).toBeLessThanOrEqual(balanceBox.x + 1)
      } else {
        expect(
          actionBox.y,
          `${sample.id} actions remain clear of the balance at ${width}px`,
        ).toBeGreaterThanOrEqual(balanceBox.y + balanceBox.height - 1)
      }
    }
  }
})
