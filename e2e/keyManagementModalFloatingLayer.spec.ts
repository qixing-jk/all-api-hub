import type { BrowserContext, Page, Worker } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import {
  createDefaultAccountStorageConfig,
  normalizeAccountStorageConfigForWrite,
  normalizeSiteAccount,
} from "~/services/accounts/accountDefaults"
import {
  I18NEXT_LANGUAGE_STORAGE_KEY,
  STORAGE_KEYS,
} from "~/services/core/storageKeys"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type AccountStorageConfig,
  type SiteAccount,
} from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const OPTIONAL_PERMISSIONS_STATE_KEY = "optional_permissions_state"

/**
 * Resolve the MV3 service worker, waiting briefly if the extension just started.
 */
async function getServiceWorker(context: BrowserContext): Promise<Worker> {
  return (
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15_000 }))
  )
}

/**
 * Persist a Plasmo-backed local-storage value from inside the service worker.
 */
async function setPlasmoStorageValue(
  serviceWorker: Worker,
  key: string,
  value: unknown,
) {
  const serialized = JSON.stringify(value)
  await serviceWorker.evaluate(
    async ({ storageKey, storageValue }) => {
      const chromeApi = (globalThis as any).chrome
      await new Promise<void>((resolve, reject) => {
        chromeApi.storage.local.set(
          {
            [storageKey]: storageValue,
          },
          () => {
            const error = chromeApi.runtime?.lastError
            if (error) {
              reject(new Error(error.message))
              return
            }
            resolve()
          },
        )
      })
    },
    { storageKey: key, storageValue: serialized },
  )
}

/**
 * Close every page in the context except the one the test actively drives.
 */
async function closeOtherPages(context: BrowserContext, keepPage: Page) {
  const pages = context.pages()
  await Promise.all(
    pages
      .filter((existingPage) => existingPage !== keepPage)
      .map((existingPage) => existingPage.close().catch(() => {})),
  )
}

/**
 * Build the minimal persisted account config needed to load Key Management.
 */
function createKeyManagementStorageConfig(): AccountStorageConfig {
  const now = Date.now()
  const account: SiteAccount = normalizeSiteAccount({
    id: "e2e-account-1",
    site_name: "E2E Example",
    site_url: "https://example.com",
    health: { status: SiteHealthStatus.Healthy },
    site_type: "new-api",
    exchange_rate: 7,
    account_info: {
      id: 1,
      access_token: "e2e-token",
      username: "e2e-user",
      quota: 1000,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
    last_sync_time: now,
    updated_at: now,
    created_at: now,
    notes: "",
    tagIds: [],
    disabled: false,
    excludeFromTotalBalance: false,
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
  })

  return normalizeAccountStorageConfigForWrite({
    ...createDefaultAccountStorageConfig(now),
    accounts: [account],
  })
}

test.beforeEach(async ({ context, page }) => {
  page.on("pageerror", (error) => {
    throw error
  })

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      throw new Error(msg.text())
    }
  })

  await page.addInitScript(
    ([languageStorageKey]) => {
      window.localStorage.setItem(languageStorageKey, "zh-CN")
    },
    [I18NEXT_LANGUAGE_STORAGE_KEY],
  )

  await context.route(
    "https://llm-metadata.pages.dev/api/index.json",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ models: [] }),
      }),
  )

  await context.route("https://example.com/api/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (method === "GET" && url.pathname === "/api/token/") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: [],
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/user/models") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: ["gpt-4", "gpt-3.5"],
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/user/self/groups") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: {
            default: { desc: "默认分组", ratio: 1 },
            vip: { desc: "VIP", ratio: 1.5 },
          },
        }),
      })
      return
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: `Unhandled E2E route: ${method} ${url.pathname}`,
      }),
    })
  })
})

test("modal-hosted group selector stays visible and clickable above the add-token dialog", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await setPlasmoStorageValue(serviceWorker, OPTIONAL_PERMISSIONS_STATE_KEY, {
    lastSeen: [
      "clipboardRead",
      "cookies",
      "declarativeNetRequestWithHostAccess",
      "webRequest",
      "webRequestBlocking",
    ],
  })
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
    createKeyManagementStorageConfig(),
  )
  await closeOtherPages(context, page)

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#keys?accountId=e2e-account-1`,
  )
  await waitForExtensionRoot(page)

  const maybeLaterButton = page.getByRole("button", { name: "稍后再说" })
  if (await maybeLaterButton.isVisible().catch(() => false)) {
    await maybeLaterButton.click()
  }

  await expect(
    page.getByRole("button", { name: "添加 API 密钥" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "添加 API 密钥" }).click()

  const nameInput = page.locator("#tokenName")
  await expect(nameInput).toBeVisible()
  await nameInput.fill("e2e layered token")

  const groupTrigger = page.getByRole("combobox").last()
  await expect(groupTrigger).toBeVisible()
  await groupTrigger.click()

  const groupOption = page.getByRole("option", {
    name: /vip - VIP \(倍率： 1\.5\)/,
  })
  await expect(groupOption).toBeVisible()
  await groupOption.click()

  await expect(groupTrigger).toContainText("vip - VIP")
})
