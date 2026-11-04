/**
 * Tool for generating high-fidelity UI documentation screenshots.
 *
 * Low-level capture runner. `pnpm docs:screenshots` prepares the builds and
 * retains before/after evidence before invoking this runner.
 * Uses Playwright Chromium with the compiled Chrome MV3 extension (.output/chrome-mv3).
 * Injects authentic, localized mock data covering all core extension features.
 *
 * Usage:
 *   pnpm run docs:screenshots
 *   node scripts/generate-doc-screenshots.mjs --lang=zh
 *   node scripts/generate-doc-screenshots.mjs --lang=en
 *   node scripts/generate-doc-screenshots.mjs --lang=ja
 *   node scripts/generate-doc-screenshots.mjs --pages=account,models,keys
 *
 * Captures normally use an 1185x840 content viewport. Account Management and
 * Balance History use 1185x1020; key management and price comparison use
 * 1185x1080 so their representative states fit in the frame.
 *
 * The Web AI API Check modal is not an options page: it is rendered by the
 * content script into a shadow root on the host page. Those images come from
 * `e2e/docScreenshotsWebAiApiCheck.spec.ts`, which needs the E2E build
 * (`.output/chrome-mv3-test`). Build it first with `pnpm build:e2e`; pass
 * `--pages=` without `web-ai-api-check` to skip that phase.
 */

import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"

import {
  DOC_SCREENSHOT_LANGUAGE_ALIASES,
  DOC_SCREENSHOT_PAGES,
  DOC_SCREENSHOT_LOCALES as LOCALES,
} from "./doc-screenshot-config.mjs"
import {
  createTranslator,
  getMockAccounts,
  getMockApiCredentialProfiles,
  getMockAutoCheckinStatus,
  getMockBalanceHistory,
  getMockBookmarks,
  getMockModelPricingCache,
  getMockModelSyncLastExecution,
  getMockTags,
  getMockUsageHistory,
} from "./doc-screenshot-data.mjs"
import {
  scrollDocPageToAnchor,
  waitForDocPageReady,
  waitForDocVisuals,
} from "./doc-screenshot-readiness.mjs"
import { setupRoutes } from "./doc-screenshot-routes.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const extensionDir = path.resolve(root, ".output/chrome-mv3")
let screenshotOutputRoot = path.resolve(root, "docs/docs/static/image")

async function setServiceWorkerStorage(serviceWorker, key, value) {
  const serialized = JSON.stringify(value)
  await serviceWorker.evaluate(
    ({ storageKey, storageValue }) =>
      new Promise((resolve, reject) => {
        globalThis.chrome.storage.local.set(
          { [storageKey]: storageValue },
          () => {
            if (globalThis.chrome.runtime.lastError)
              reject(globalThis.chrome.runtime.lastError)
            else resolve()
          },
        )
      }),
    { storageKey: key, storageValue: serialized },
  )
}

async function renderBatch(localeKey = "zh", requestedPages = null) {
  const locale = LOCALES[localeKey]
  if (!locale) {
    throw new Error(`Unsupported locale: ${localeKey}`)
  }
  if (requestedPages?.size === 1 && requestedPages.has("web-ai-api-check")) {
    await captureContentScriptScreenshots(
      localeKey,
      path.join(screenshotOutputRoot, locale.output),
    )
    return
  }
  const t = createTranslator(localeKey)

  console.log(
    `\n=================== Rendering ${locale.ui} screenshots ===================`,
  )
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), `wxt-ui-${localeKey}-`),
  )

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      `--lang=${locale.chrome}`,
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  })

  try {
    await setupRoutes(context, t)

    let serviceWorker = context.serviceWorkers()[0]
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker", {
        timeout: 15000,
      })
    }
    const extensionId = new URL(serviceWorker.url()).host
    console.log("Connected to extension ID:", extensionId)

    // A populated demo represents a profile that has completed onboarding.
    await setServiceWorkerStorage(serviceWorker, "featureGuidance_state_v1", {
      schemaVersion: 1,
      productTour: {
        expanded: {
          handledVersion: 1,
          outcome: "completed",
          handledAt: Date.now(),
        },
      },
      gatewayGuidance: {
        onboardingStartedAt: Date.now(),
        onboardingCompletedAt: Date.now(),
        dismissedAtBySurface: {
          account: Date.now(),
          apiCredentialProfiles: Date.now(),
        },
      },
    })

    // Seed data
    console.log("Seeding storage data...")
    const accounts = getMockAccounts()
    const bookmarks = getMockBookmarks(t)
    const tags = getMockTags(t)
    const profiles = getMockApiCredentialProfiles(t)
    const autoCheckin = getMockAutoCheckinStatus(t)
    const usageHistory = getMockUsageHistory()
    const balanceHistory = getMockBalanceHistory()
    const modelSyncExecution = getMockModelSyncLastExecution(t)

    await setServiceWorkerStorage(serviceWorker, "site_accounts", {
      version: 1,
      accounts,
      bookmarks,
      orderedAccountIds: accounts.map((account) => account.id),
      pinnedAccountIds: [],
    })
    await setServiceWorkerStorage(serviceWorker, "global_tag_store", tags)
    await setServiceWorkerStorage(
      serviceWorker,
      "modelCatalog_cache_v1",
      getMockModelPricingCache(),
    )
    await setServiceWorkerStorage(serviceWorker, "api_credential_profiles", {
      version: 8,
      links: [],
      linkTombstones: [],
      profiles,
      lastUpdated: Date.now(),
    })
    await setServiceWorkerStorage(
      serviceWorker,
      "autoCheckin_status",
      autoCheckin,
    )
    await setServiceWorkerStorage(
      serviceWorker,
      "usageHistory_store",
      usageHistory,
    )
    await setServiceWorkerStorage(
      serviceWorker,
      "dailyBalanceHistory_store",
      balanceHistory,
    )
    await setServiceWorkerStorage(
      serviceWorker,
      "managedSiteModelSync_lastExecution",
      modelSyncExecution,
    )
    await setServiceWorkerStorage(serviceWorker, "user_preferences", {
      sortField: null,
      themeMode: "light",
      language: locale.ui,
      managedSiteType: "new-api",
      newApi: {
        baseUrl: "https://managed.example.invalid",
        adminToken: "fixture-admin-token",
        userId: "1",
        username: "admin",
        password: "",
        totpSecret: "",
      },
      veloera: {
        baseUrl: "https://migration-target.example.invalid",
        adminToken: "fixture-target-admin-token",
        userId: "1",
      },
      showTodayCashflow: true,
      autoCheckin: {
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
      },
      balanceHistory: {
        enabled: true,
        endOfDayCapture: { enabled: true, time: "23:55" },
        estimatedTodayIncome: { enabled: true },
        retentionDays: 90,
      },
      usageHistory: {
        enabled: true,
        retentionDays: 30,
        scheduleMode: "afterRefresh",
        syncIntervalMinutes: 360,
      },
    })

    const outputBase = path.resolve(screenshotOutputRoot, locale.output)

    await fs.mkdir(outputBase, { recursive: true })

    // Standard width 1440 gives a 1185px content column (1440 - 240 sidebar - 15 scrollbar)
    const STANDARD_WIDTH = 1440
    const STANDARD_HEIGHT = 900
    const SIDEBAR_WIDTH = 240
    const HEADER_HEIGHT = 60
    // Standard frame for feature pages; the expanded account catalog is taller.
    const FRAME_WIDTH = STANDARD_WIDTH - SIDEBAR_WIDTH - 15
    const FRAME_HEIGHT = STANDARD_HEIGHT - HEADER_HEIGHT

    const capturePage = async (
      key,
      hash,
      filename,
      { beforeScreenshot, scrollToSelector, frameHeight, clipHeight } = {},
    ) => {
      if (requestedPages && !requestedPages.has(key)) return

      console.log(`Rendering [${key}] #${hash} -> ${filename}...`)
      // Open fresh tab for each page to prevent Framer Motion exit animation race conditions
      const p = await context.newPage()
      const captureHeight =
        frameHeight ??
        (key === "account" ? 1020 : key === "keys" ? 1080 : FRAME_HEIGHT)
      await p.setViewportSize({
        width: STANDARD_WIDTH,
        height: captureHeight + HEADER_HEIGHT,
      })
      await p.emulateMedia({ reducedMotion: "reduce" })

      // Force language in localStorage
      await p.addInitScript((uiLocale) => {
        window.localStorage.setItem("all-api-hub-i18nextLng", uiLocale)
        window.localStorage.setItem("all-api-hub-language", uiLocale)
        window.localStorage.setItem("i18nextLng", uiLocale)
      }, locale.ui)

      const targetUrl = `chrome-extension://${extensionId}/options.html#${hash}`
      await p.goto(targetUrl, { waitUntil: "domcontentloaded" })

      // Wait for content card
      const card = p.locator('[data-testid="options-content-card"]')
      await card.waitFor({ state: "attached", timeout: 15000 })

      await waitForDocPageReady(p)

      if (beforeScreenshot) {
        await beforeScreenshot(p)
      }
      await p.evaluate(() => document.activeElement?.blur?.())
      await p.mouse.move(0, 0)

      const visibleText = await p.locator("body").innerText()
      if (
        /PackyCode|发生未知错误|Unknown error|autoCheckin:provider/.test(
          visibleText,
        )
      ) {
        throw new Error(`Inconsistent documentation content on ${key}`)
      }
      const savePath = path.join(outputBase, filename)

      await waitForDocPageReady(p)
      if (scrollToSelector) await scrollDocPageToAnchor(p, scrollToSelector)
      await waitForDocVisuals(p)

      // Exclude the sidebar and header; include every account in the catalog.
      await p.screenshot({
        path: savePath,
        animations: "disabled",
        clip: {
          x: SIDEBAR_WIDTH,
          y: HEADER_HEIGHT,
          width: FRAME_WIDTH,
          height: clipHeight ?? captureHeight,
        },
      })

      console.log(`Saved (no sidebar): ${savePath}`)
      await p.close()
    }

    // 1. Overview Dashboard (Hero)
    await capturePage("overview", "overview", DOC_SCREENSHOT_PAGES.overview[0])

    // 2. Account Management
    await capturePage("account", "account", DOC_SCREENSHOT_PAGES.account[0], {
      beforeScreenshot: async (p) => {
        await p.waitForSelector("[data-testid*='account-row'], table, .grid", {
          timeout: 8000,
        })
      },
    })

    // 3. Model List
    await capturePage(
      "models",
      "models?accountId=acc-my-newapi",
      DOC_SCREENSHOT_PAGES.models[0],
      {
        frameHeight: 1080,
        scrollToSelector: '[id="model-price-comparison-title"]',
        beforeScreenshot: async (p) => {
          const copy = JSON.parse(
            await fs.readFile(
              path.join(root, "src/locales", locale.ui, "modelList.json"),
              "utf8",
            ),
          )
          await p
            .getByTestId("model-list-header-price-comparison-button")
            .click()
          await p
            .getByRole("textbox", { name: copy.searchModels, exact: true })
            .fill("deepseek-chat")
          const endpoints = p
            .getByText(copy.endpointTypes, { exact: true })
            .locator("..")
            .getByRole("switch")
          if ((await endpoints.getAttribute("aria-checked")) === "true")
            await endpoints.click()
          const compared = p
            .getByRole("list", {
              name: copy.priceComparison.results.comparable,
              exact: true,
            })
            .first()
          await compared.waitFor({ state: "visible" })
          await p.waitForFunction(() => {
            const groups = document.querySelectorAll(
              '[id^="model-price-comparison-group-"]',
            )
            return Array.from(groups).some(
              (group) =>
                group.closest("section")?.querySelectorAll("ul > li").length >=
                9,
            )
          })
          await p.waitForFunction(
            () => !document.querySelector("[data-options-page-pending]"),
          )
          await p.waitForFunction(
            (loading) =>
              !Array.from(
                document.querySelectorAll('[data-testid="model-list-page"] *'),
              ).some(
                (node) =>
                  node.children.length === 0 && node.textContent === loading,
              ),
            copy.accountSummary.loading,
          )
          await p
            .getByText(copy.status.dataLoaded, { exact: true })
            .waitFor({ state: "hidden" })
          if ((await compared.locator(":scope > li").count()) !== 9)
            throw new Error("Expected nine complete cross-site quotes")
          if (
            (await p
              .getByText(copy.accountSummary.partialLoadFailed, { exact: true })
              .count()) > 0 ||
            (await p
              .getByText(copy.accountSummary.loadFailed, { exact: true })
              .count()) > 0
          ) {
            throw new Error(
              "Every documentation model source must load successfully",
            )
          }
        },
      },
    )

    // 4. API Key List
    await capturePage(
      "keys",
      "keys?accountId=acc-my-newapi",
      DOC_SCREENSHOT_PAGES.keys[0],
      {
        clipHeight: 1045,
        beforeScreenshot: async (p) => {
          // Wait until pending state clears
          await p.waitForFunction(
            () => !document.querySelector("[data-options-page-pending]"),
            undefined,
            { timeout: 10000 },
          )
          const copy = JSON.parse(
            await fs.readFile(
              path.join(root, "src/locales", locale.ui, "keyManagement.json"),
              "utf8",
            ),
          )
          await p
            .getByText(copy.managedSiteStatus.badges.added, { exact: true })
            .first()
            .waitFor({ state: "visible" })
          await p
            .getByText(copy.managedSiteStatus.badges.notAdded, { exact: true })
            .first()
            .waitFor({ state: "visible" })
          await p.waitForFunction(
            (checking) =>
              !Array.from(
                document.querySelectorAll(
                  '[data-testid="managed-site-status-details"]',
                ),
              ).some((node) => node.textContent?.includes(checking)),
            copy.managedSiteStatus.badges.checking,
            { timeout: 30000 },
          )
          if (
            (await p
              .getByText(copy.managedSiteStatus.badges.added, { exact: true })
              .count()) !== 1
          ) {
            throw new Error(
              "Expected a confirmed imported key in documentation",
            )
          }
          await p
            .getByTestId("key-management-export-menu-button")
            .first()
            .click()
          const menu = p.getByRole("menu")
          await menu.waitFor({ state: "visible" })
          if ((await menu.getByRole("menuitem").count()) !== 7) {
            throw new Error(
              "Expected all seven documentation export destinations",
            )
          }
        },
      },
    )

    // 5. API Credential Profiles
    await capturePage(
      "profiles",
      "apiCredentialProfiles",
      DOC_SCREENSHOT_PAGES.profiles[0],
      {
        beforeScreenshot: async (p) => {
          await p.getByText("api.kimi.com/coding", { exact: true }).click()
          const toggle = p
            .getByTestId("api-credential-telemetry-toggle")
            .first()
          if ((await toggle.getAttribute("aria-expanded")) === "false")
            await toggle.click()
          await p
            .getByTestId("api-credential-telemetry-quota")
            .first()
            .waitFor({ state: "visible" })
        },
      },
    )

    // 6. Auto Check-in
    await capturePage(
      "checkin",
      "autoCheckin",
      DOC_SCREENSHOT_PAGES.checkin[0],
      {
        beforeScreenshot: async (p) => {
          await p.waitForSelector("table, [role='table'], tr", {
            timeout: 10000,
          })
        },
      },
    )

    // 7. Usage Analytics (Tokens / Consumption)
    await capturePage(
      "usage",
      "usageAnalytics",
      DOC_SCREENSHOT_PAGES.usage[0],
      {
        scrollToSelector: '[data-testid="usage-analytics-charts-section"]',
        beforeScreenshot: async (p) => {
          await p.waitForSelector("canvas, .echarts-for-react", {
            timeout: 10000,
          })
        },
      },
    )

    // 8. Latency Analytics (anchored to the latency cards, not a fixed offset)
    await capturePage(
      "latency",
      "usageAnalytics",
      DOC_SCREENSHOT_PAGES.latency[0],
      {
        scrollToSelector: '[data-testid="usage-analytics-latency-section"]',
        beforeScreenshot: async (p) => {
          await p.waitForSelector(
            '[data-testid="usage-analytics-latency-section"]',
            {
              timeout: 10000,
            },
          )
          await p.waitForSelector("canvas, .echarts-for-react", {
            timeout: 10000,
          })
        },
      },
    )

    // 9. Balance History
    await capturePage(
      "balance",
      "balanceHistory",
      DOC_SCREENSHOT_PAGES.balance[0],
      {
        frameHeight: 1020,
        scrollToSelector: '[data-testid="balance-history-overview"]',
        beforeScreenshot: async (p) => {
          const copy = JSON.parse(
            await fs.readFile(
              path.join(root, "src/locales", locale.ui, "balanceHistory.json"),
              "utf8",
            ),
          )
          await p
            .getByRole("button", {
              name: copy.filters.quickRanges["7d"],
              exact: true,
            })
            .click()
          for (const name of [
            "OpenRouter",
            "Vercel AI Gateway",
            "AIHubMix",
            "New API",
          ]) {
            await p.getByRole("button", { name, exact: true }).click()
          }
          await p
            .getByRole("button", {
              name: `${copy.breakdown.title}: ${copy.metrics.balance}`,
              exact: true,
            })
            .click()
          await p
            .getByRole("menuitemradio", {
              name: copy.metrics.outcome,
              exact: true,
            })
            .click()
          await p
            .getByTestId("balance-history-overview")
            .waitFor({ state: "visible" })
          await p.waitForFunction(
            () =>
              document.querySelectorAll(
                "[_echarts_instance_] canvas, [_echarts_instance_] svg",
              ).length >= 2,
          )
        },
      },
    )

    // 10. Bookmark Management
    await capturePage(
      "bookmark",
      "bookmark",
      DOC_SCREENSHOT_PAGES.bookmark[0],
      {
        beforeScreenshot: async (p) => {
          await p.waitForSelector(
            "[data-testid*='bookmarks-list-item'], [data-testid='bookmarks-list-view']",
            undefined,
            { timeout: 10000 },
          )
        },
      },
    )

    // 11. Managed Site Channels
    await capturePage(
      "channels",
      "managedSiteChannels",
      DOC_SCREENSHOT_PAGES.channels[0],
      {
        beforeScreenshot: async (p) => {
          await p
            .getByTestId("managed-site-channels-migration-mode-button")
            .waitFor({ state: "visible" })
          await p.waitForSelector("table, [role='table'], tr", {
            timeout: 8000,
          })
          const settings = JSON.parse(
            await fs.readFile(
              path.join(root, "src/locales", locale.ui, "settings.json"),
              "utf8",
            ),
          )
          await p
            .getByRole("combobox", {
              name: settings.managedSite.siteTypeLabel,
              exact: true,
            })
            .click()
          await p.getByRole("listbox").waitFor({ state: "visible" })
        },
      },
    )

    // 12. Managed Site Model Sync
    await capturePage(
      "sync",
      "managedSiteModelSync",
      DOC_SCREENSHOT_PAGES.sync[0],
      {
        frameHeight: 1200,
        beforeScreenshot: async (p) => {
          await p.waitForSelector("table, [role='table'], tr", {
            timeout: 8000,
          })
        },
      },
    )
  } finally {
    await context.close()
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {})
  }

  // The Web AI API Check modal lives in a content-script shadow root, so it
  // cannot be reached from the options page. Drive it through the E2E harness
  // and collect the images it writes into the same locale directory.
  if (!requestedPages || requestedPages.has("web-ai-api-check")) {
    await captureContentScriptScreenshots(
      localeKey,
      path.resolve(screenshotOutputRoot, locale.output),
    )
  }
}

/**
 * Render the in-page Web AI API Check modal by running its doc-capture spec.
 *
 * The spec needs the E2E build (`.output/chrome-mv3-test`) and Playwright's
 * extension fixture; both are driven through `playwright test` rather than a
 * hand-rolled launch so the content-script injection path stays identical to
 * the one the E2E suite verifies.
 */
async function captureContentScriptScreenshots(localeKey, outputBase) {
  const shotDir = await fs.mkdtemp(
    path.join(os.tmpdir(), `wxt-doc-shot-${localeKey}-`),
  )

  console.log(
    `\nRendering [web-ai-api-check] (${localeKey}) via E2E harness...`,
  )

  try {
    await runCommand(
      "npx",
      [
        "playwright",
        "test",
        "e2e/docScreenshotsWebAiApiCheck.spec.ts",
        "--reporter=line",
      ],
      {
        env: {
          ...process.env,
          AAH_DOC_SHOT_DIR: shotDir,
          AAH_DOC_SHOT_LOCALE: localeKey,
          AAH_SKIP_E2E_BUILD: "1",
        },
      },
    )

    const produced = (await fs.readdir(shotDir)).filter((name) =>
      name.endsWith(".png"),
    )
    if (produced.length === 0) {
      throw new Error("Web AI API Check capture produced no images")
    }

    await fs.mkdir(outputBase, { recursive: true })
    for (const name of produced) {
      await fs.copyFile(path.join(shotDir, name), path.join(outputBase, name))
      console.log(`  wrote ${name}`)
    }
  } finally {
    await fs.rm(shotDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Run a child process and reject with its stderr tail when it exits non-zero.
 */
function runCommand(command, args, { env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    })

    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
      process.stderr.write(chunk)
    })

    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout)
        return
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} exited with ${code}\n${stderr.slice(-2000)}`,
        ),
      )
    })
  })
}

async function main() {
  const args = process.argv.slice(2)
  let langArg = "all"
  let pagesArg = null

  for (const arg of args) {
    if (arg.startsWith("--output=")) {
      screenshotOutputRoot = path.resolve(root, arg.slice("--output=".length))
    } else if (arg.startsWith("--lang=")) {
      langArg = arg.split("=")[1].toLowerCase()
    } else if (arg.startsWith("--pages=")) {
      pagesArg = new Set(
        arg
          .split("=")[1]
          .split(",")
          .map((s) => s.trim().toLowerCase()),
      )
    }
  }

  if (
    pagesArg &&
    [...pagesArg].some((page) => !Object.hasOwn(DOC_SCREENSHOT_PAGES, page))
  ) {
    throw new Error(
      "Unknown page; expected one of " +
        Object.keys(DOC_SCREENSHOT_PAGES).join(", "),
    )
  }

  const selected =
    langArg === "all"
      ? Object.keys(LOCALES)
      : [
          DOC_SCREENSHOT_LANGUAGE_ALIASES[langArg] ??
            (Object.hasOwn(LOCALES, langArg) ? langArg : undefined),
        ]

  for (const localeKey of selected) {
    if (!localeKey) {
      throw new Error(
        `Unsupported --lang=${langArg}; expected one of all, zh, en, ja`,
      )
    }
    await renderBatch(localeKey, pagesArg)
  }

  console.log("\n✅ All screenshots generated successfully.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
