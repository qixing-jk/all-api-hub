import http from "node:http"
import type { AddressInfo } from "node:net"
import type { BrowserContext, Worker } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { SiteAccount } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  E2E_BUILD_VARIANT_ENV,
  E2E_BUILD_VARIANTS,
} from "~~/e2e/utils/e2eBuildVariants"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const BOOKMARK_IMPORT_TITLE = "Bookmark Import Candidate"
const BOOKMARK_IMPORT_SITE_NAME = "Bookmark Import New API"
const BOOKMARK_IMPORT_USERNAME = "bookmark-import-user"
const BOOKMARK_IMPORT_TOKEN = "bookmark-import-token"
const ADD_DIALOG_BOOKMARK_IMPORT_ORIGIN =
  "https://add-dialog-import.example.invalid"

type BrowserBookmarkNode = {
  id: string
}

type BookmarkImportServer = {
  close: () => Promise<void>
  origin: string
}

async function closeHttpServer(server: http.Server) {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

async function createBrowserBookmark(serviceWorker: Worker, url: string) {
  return await serviceWorker.evaluate(
    async ({ title, url }) => {
      const chromeApi = (globalThis as any).chrome

      return await new Promise<BrowserBookmarkNode>((resolve, reject) => {
        chromeApi.bookmarks.create(
          { title, url },
          (node: BrowserBookmarkNode) => {
            const error = chromeApi.runtime?.lastError
            if (error) {
              reject(new Error(error.message))
              return
            }

            resolve({ id: node.id })
          },
        )
      })
    },
    { title: BOOKMARK_IMPORT_TITLE, url },
  )
}

async function removeBrowserBookmark(
  serviceWorker: Worker,
  bookmarkId: string,
) {
  await serviceWorker.evaluate(async (id) => {
    const chromeApi = (globalThis as any).chrome

    await new Promise<void>((resolve) => {
      chromeApi.bookmarks.removeTree(id, () => {
        resolve()
      })
    })
  }, bookmarkId)
}

async function readStoredAccounts(
  serviceWorker: Worker,
): Promise<SiteAccount[]> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
  )

  if (typeof raw !== "string") return []

  try {
    const parsed = JSON.parse(raw) as { accounts?: SiteAccount[] }
    return Array.isArray(parsed.accounts) ? parsed.accounts : []
  } catch {
    return []
  }
}

async function startBookmarkImportServer(): Promise<BookmarkImportServer> {
  const server = http.createServer((request, response) => {
    const origin = `http://${request.headers.host ?? "127.0.0.1"}`
    const url = new URL(request.url ?? "/", origin)
    const method = request.method ?? "GET"

    const sendJson = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" })
      response.end(JSON.stringify(body))
    }

    if (method === "GET" && url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html" })
      response.end(
        `<!doctype html><html><head><title>${BOOKMARK_IMPORT_SITE_NAME}</title></head><body>${BOOKMARK_IMPORT_SITE_NAME}</body></html>`,
      )
      return
    }

    if (method === "GET" && url.pathname === "/dashboard") {
      response.writeHead(200, { "content-type": "text/html" })
      response.end(
        `<!doctype html><html><head><title>${BOOKMARK_IMPORT_SITE_NAME}</title></head><body>${BOOKMARK_IMPORT_SITE_NAME}</body></html>`,
      )
      return
    }

    if (method === "GET" && url.pathname === "/favicon.ico") {
      response.writeHead(204)
      response.end()
      return
    }

    if (method === "GET" && url.pathname === "/api/status") {
      sendJson(200, {
        success: true,
        message: "ok",
        data: {
          system_name: BOOKMARK_IMPORT_SITE_NAME,
          price: 7,
          checkin_enabled: false,
        },
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/user/self") {
      sendJson(200, {
        success: true,
        message: "ok",
        data: {
          id: 787,
          username: BOOKMARK_IMPORT_USERNAME,
          access_token: BOOKMARK_IMPORT_TOKEN,
          quota: 1000,
        },
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/log/self") {
      sendJson(200, {
        success: true,
        message: "ok",
        data: {
          page: Number(url.searchParams.get("p") ?? "1"),
          page_size: Number(url.searchParams.get("page_size") ?? "100"),
          total: 0,
          items: [],
        },
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/log/self/stat") {
      sendJson(200, {
        success: true,
        message: "ok",
        data: {
          quota: 0,
          rpm: 0,
          tpm: 0,
        },
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/token/") {
      sendJson(200, {
        success: true,
        message: "ok",
        data: [],
      })
      return
    }

    sendJson(404, {
      success: false,
      message: `Unhandled bookmark import E2E route: ${method} ${url.pathname}`,
    })
  })

  const origin = await new Promise<string>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })

  return {
    origin,
    close: async () => {
      await closeHttpServer(server)
    },
  }
}

async function startFailedBookmarkImportServer(): Promise<BookmarkImportServer> {
  const server = http.createServer((request, response) => {
    const origin = `http://${request.headers.host ?? "127.0.0.1"}`
    const url = new URL(request.url ?? "/", origin)

    if (url.pathname === "/" || url.pathname === "/dashboard") {
      response.writeHead(200, { "content-type": "text/html" })
      response.end(
        "<!doctype html><html><head><title>Unsupported Import Target</title></head><body>Unsupported Import Target</body></html>",
      )
      return
    }

    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ success: false, message: "not found" }))
  })

  const origin = await new Promise<string>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })

  return {
    origin,
    close: async () => {
      await closeHttpServer(server)
    },
  }
}

async function seedBookmarkImportSiteSession(
  context: BrowserContext,
  origin: string,
) {
  const sitePage = await context.newPage()

  try {
    await sitePage.goto(`${origin}/dashboard`)
    await sitePage.evaluate(
      ({ token, username }) => {
        localStorage.setItem(
          "user",
          JSON.stringify({
            id: 787,
            username,
            access_token: token,
          }),
        )
      },
      {
        token: BOOKMARK_IMPORT_TOKEN,
        username: BOOKMARK_IMPORT_USERNAME,
      },
    )
  } finally {
    await sitePage.close()
  }
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("opens bookmark import from the add account dialog", async ({
  context,
  extensionId,
  page,
}) => {
  skipUnlessBookmarksRequiredVariant()

  const serviceWorker = await getServiceWorker(context)
  const bookmark = await createBrowserBookmark(
    serviceWorker,
    `${ADD_DIALOG_BOOKMARK_IMPORT_ORIGIN}/dashboard`,
  )

  try {
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`,
    )
    await waitForExtensionRoot(page)
    await expectPermissionOnboardingHidden(page)

    await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()

    const accountDialog = page.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog,
    )
    await expect(accountDialog).toBeVisible()
    await accountDialog
      .getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportFromAddDialogButton,
      )
      .click()
    await expect(accountDialog).toHaveCount(0)

    const importDialog = page.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportDialog,
    )
    await expect(importDialog).toBeVisible()
    await importDialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton)
      .click()

    await expect(
      importDialog.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeTree,
      ),
    ).toBeVisible()
    await importDialog.getByRole("button", { name: "Select all" }).click()
    await importDialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScanSelectedButton)
      .click()

    await expect(
      importDialog.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportCandidateRow,
      ),
    ).toContainText(ADD_DIALOG_BOOKMARK_IMPORT_ORIGIN)
  } finally {
    await removeBrowserBookmark(serviceWorker, bookmark.id)
  }
})

test("imports an account from a native browser bookmark", async ({
  context,
  extensionId,
  page,
}) => {
  skipUnlessBookmarksRequiredVariant()

  const serviceWorker = await getServiceWorker(context)
  const localSite = await startBookmarkImportServer()
  const bookmark = await createBrowserBookmark(
    serviceWorker,
    `${localSite.origin}/dashboard`,
  )
  await seedBookmarkImportSiteSession(context, localSite.origin)

  try {
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`,
    )
    await waitForExtensionRoot(page)
    await expectPermissionOnboardingHidden(page)

    await page
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportButton)
      .click()

    const dialog = page.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportDialog,
    )
    await expect(dialog).toBeVisible()
    await dialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton)
      .click()

    await expect(
      dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeTree),
    ).toBeVisible()
    await dialog.getByRole("button", { name: "Select all" }).click()
    await dialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScanSelectedButton)
      .click()

    await expect(
      dialog.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportCandidateRow,
      ),
    ).toContainText(localSite.origin)

    await dialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportImportButton)
      .click()

    await expect(
      dialog.getByText("Imported 1, failed 0, skipped 0."),
    ).toBeVisible()

    await expect
      .poll(async () => {
        const account = (await readStoredAccounts(serviceWorker)).find(
          (candidate) =>
            candidate.site_url === localSite.origin &&
            candidate.account_info.username === BOOKMARK_IMPORT_USERNAME,
        )

        return account
          ? {
              accessToken: account.account_info.access_token,
              siteUrl: account.site_url,
              username: account.account_info.username,
            }
          : null
      })
      .toEqual({
        accessToken: BOOKMARK_IMPORT_TOKEN,
        siteUrl: localSite.origin,
        username: BOOKMARK_IMPORT_USERNAME,
      })

    const importedAccount = (await readStoredAccounts(serviceWorker)).find(
      (candidate) => candidate.site_url === localSite.origin,
    )
    expect(importedAccount?.id).toBeTruthy()

    await dialog.getByRole("button", { name: "Close" }).click()
    await expect(dialog).toBeHidden()

    await expect(
      page.getByTestId(getAccountManagementListItemTestId(importedAccount!.id)),
    ).toContainText(BOOKMARK_IMPORT_USERNAME)
  } finally {
    await removeBrowserBookmark(serviceWorker, bookmark.id)
    await localSite.close()
  }
})

test("opens add account recovery for a failed bookmark import", async ({
  context,
  extensionId,
  page,
}) => {
  skipUnlessBookmarksRequiredVariant()

  const serviceWorker = await getServiceWorker(context)
  const localSite = await startFailedBookmarkImportServer()
  const bookmark = await createBrowserBookmark(
    serviceWorker,
    `${localSite.origin}/dashboard`,
  )

  try {
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`,
    )
    await waitForExtensionRoot(page)
    await expectPermissionOnboardingHidden(page)

    await page
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportButton)
      .click()

    const importDialog = page.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportDialog,
    )
    await expect(importDialog).toBeVisible()
    await importDialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton)
      .click()

    await expect(
      importDialog.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeTree,
      ),
    ).toBeVisible()
    await importDialog.getByRole("button", { name: "Select all" }).click()
    await importDialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScanSelectedButton)
      .click()

    await expect(
      importDialog.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportCandidateRow,
      ),
    ).toContainText(localSite.origin)
    await importDialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportImportButton)
      .click()

    await expect(
      importDialog.getByText("Imported 0, failed 1, skipped 0."),
    ).toBeVisible()
    await importDialog
      .getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportOpenFailedAddAccountButton,
      )
      .click()

    const accountDialog = page.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog,
    )
    await expect(accountDialog).toBeVisible()
    await expect(
      accountDialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput),
    ).toHaveValue(localSite.origin)
  } finally {
    await removeBrowserBookmark(serviceWorker, bookmark.id)
    await localSite.close()
  }
})

function skipUnlessBookmarksRequiredVariant() {
  test.skip(
    process.env[E2E_BUILD_VARIANT_ENV] !== E2E_BUILD_VARIANTS.BookmarksRequired,
    [
      "Native browser bookmark import requires the E2E-only bookmarks-required manifest variant.",
      `Run with ${E2E_BUILD_VARIANT_ENV}=${E2E_BUILD_VARIANTS.BookmarksRequired}.`,
    ].join(" "),
  )
}
