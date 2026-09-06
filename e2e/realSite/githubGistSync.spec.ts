import type { Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { WEBDAV_TARGET_IDS } from "~/features/ImportExport/searchTargets"
import { IMPORT_EXPORT_TEST_IDS } from "~/features/ImportExport/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { GITHUB_GIST_BACKUP_FILE_NAME } from "~/services/webdav/githubGistService"
import { CLOUD_SYNC_PROVIDERS } from "~/types/cloudSync"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { readEnv } from "~~/e2e/utils/realSite/shared"

const GITHUB_API_ORIGIN = "https://api.github.com"
const GIST_PASSWORD = "all-api-hub-real-site-e2e-password"

function readGithubGistToken() {
  return readEnv("AAH_E2E_GITHUB_GIST_TOKEN")
}

async function getGist(token: string, gistId: string) {
  return fetch(`${GITHUB_API_ORIGIN}/gists/${encodeURIComponent(gistId)}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  })
}

async function deleteGist(token: string, gistId: string) {
  await fetch(`${GITHUB_API_ORIGIN}/gists/${encodeURIComponent(gistId)}`, {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  }).catch(() => {
    // Cleanup must not hide the UI assertion that failed first.
  })
}

async function openImportExportPage(page: Page, extensionId: string) {
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.IMPORT_EXPORT}`,
  )
  await waitForExtensionRoot(page)
}

async function confirmDirectionalAction(page: Page) {
  await page
    .getByTestId(IMPORT_EXPORT_TEST_IDS.webdavManualConfirmButton)
    .click()
}

test.describe("real-site E2E: GitHub Secret Gist sync", () => {
  test.beforeEach(async ({ context, page }) => {
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
  })

  test("creates an encrypted Secret Gist, verifies it, and restores it", async ({
    context,
    extensionId,
    page,
  }) => {
    const token = readGithubGistToken()
    test.skip(
      !token,
      "Missing AAH_E2E_GITHUB_GIST_TOKEN; skipping GitHub Secret Gist E2E",
    )

    const serviceWorker = await getServiceWorker(context)
    const account = createStoredAccount({
      id: "github-gist-real-site-account",
      site_name: "GitHub Gist real-site E2E account",
      site_url: "https://github-gist-real-site.example.invalid",
      account_info: {
        id: "gist-e2e-account",
        username: "gist-e2e-user",
        access_token: "gist-e2e-token",
      },
    })
    await seedStoredAccounts(serviceWorker, [account])
    await seedUserPreferences(serviceWorker, {
      webdav: {
        provider: CLOUD_SYNC_PROVIDERS.GITHUB_GIST,
        backupEncryptionEnabled: true,
        backupEncryptionPassword: GIST_PASSWORD,
        githubGist: {
          token: token!,
          gistId: "",
          gistUrl: "",
        },
        syncData: {
          accounts: true,
          bookmarks: true,
          apiCredentialProfiles: true,
          preferences: true,
        },
        autoSync: false,
        syncInterval: 3600,
        syncStrategy: "merge",
      },
    })

    let gistId: string | undefined
    try {
      await openImportExportPage(page, extensionId)

      await expect(page.locator(`#${WEBDAV_TARGET_IDS.gistToken}`)).toHaveValue(
        /\S+/,
      )
      await expect(
        page.locator(`#${WEBDAV_TARGET_IDS.encryptionPassword}`),
      ).toHaveValue(GIST_PASSWORD)
      await page.locator(`#${WEBDAV_TARGET_IDS.createGist}`).click()
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "Uploaded to GitHub Secret Gist" }),
      ).toBeVisible({ timeout: 30_000 })

      const gistLink = page.locator("#github-gist-url")
      await expect(gistLink).toBeVisible()
      const gistHref = await gistLink.getAttribute("href")
      gistId = gistHref?.split("/").filter(Boolean).at(-1)
      expect(gistId).toBeTruthy()

      const response = await getGist(token!, gistId!)
      expect(response.ok).toBe(true)
      const gist = (await response.json()) as {
        id?: string
        public?: boolean
        files?: Record<string, { content?: string }>
      }
      expect(gist.id).toBe(gistId)
      expect(gist.public).toBe(false)
      const encryptedContent =
        gist.files?.[GITHUB_GIST_BACKUP_FILE_NAME]?.content ?? ""
      expect(encryptedContent).toContain("all-api-hub-webdav-backup-encrypted")
      expect(encryptedContent).not.toContain("gist-e2e-token")

      await seedStoredAccounts(serviceWorker, [])
      await openImportExportPage(page, extensionId)
      await page
        .getByTestId(IMPORT_EXPORT_TEST_IDS.webdavDownloadImportButton)
        .click()
      await confirmDirectionalAction(page)
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "Data imported successfully" }),
      ).toBeVisible({ timeout: 30_000 })

      const storedAccounts = await getPlasmoStorageRawValue<string>(
        serviceWorker,
        STORAGE_KEYS.ACCOUNTS,
      )
      expect(storedAccounts).toContain("github-gist-real-site-account")
    } finally {
      if (gistId) await deleteGist(token!, gistId)
    }
  })
})
