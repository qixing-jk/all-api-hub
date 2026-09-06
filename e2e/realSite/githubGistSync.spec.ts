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

  test("creates, updates, verifies, and restores an encrypted Secret Gist", async ({
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

      await page.locator(`#${WEBDAV_TARGET_IDS.testConnection}`).click()
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "Secret Gist connection succeeded" }),
      ).toBeVisible({ timeout: 30_000 })

      const response = await getGist(token!, gistId!)
      expect(response.ok).toBe(true)
      const gist = (await response.json()) as {
        id?: string
        public?: boolean
        history?: Array<{ version?: string }>
        files?: Record<string, { content?: string }>
      }
      expect(gist.id).toBe(gistId)
      expect(gist.public).toBe(false)
      const encryptedContent =
        gist.files?.[GITHUB_GIST_BACKUP_FILE_NAME]?.content ?? ""
      expect(encryptedContent).toContain("all-api-hub-webdav-backup-encrypted")
      expect(encryptedContent).not.toContain("gist-e2e-token")
      expect(encryptedContent).not.toContain(GIST_PASSWORD)
      expect(encryptedContent).not.toContain(token!)

      const updatedAccount = createStoredAccount({
        id: "github-gist-real-site-account-2",
        site_name: "GitHub Gist real-site E2E second account",
        site_url: "https://github-gist-real-site-second.example.invalid",
        account_info: {
          id: "gist-e2e-account-2",
          username: "gist-e2e-user-2",
          access_token: "gist-e2e-token-2",
        },
      })
      await seedStoredAccounts(serviceWorker, [account, updatedAccount])
      await openImportExportPage(page, extensionId)
      await page
        .getByTestId(IMPORT_EXPORT_TEST_IDS.webdavUploadBackupButton)
        .click()
      await confirmDirectionalAction(page)
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "Uploaded to GitHub Secret Gist" }),
      ).toBeVisible({ timeout: 30_000 })

      await expect
        .poll(
          async () => {
            const updatedResponse = await getGist(token!, gistId!)
            if (!updatedResponse.ok) return 0
            const updatedGist = (await updatedResponse.json()) as {
              history?: Array<{ version?: string }>
            }
            return updatedGist.history?.length ?? 0
          },
          { timeout: 30_000, intervals: [1_000, 2_000, 5_000] },
        )
        .toBeGreaterThanOrEqual(2)

      const updatedResponse = await getGist(token!, gistId!)
      expect(updatedResponse.ok).toBe(true)
      const updatedGist = (await updatedResponse.json()) as {
        public?: boolean
        history?: Array<{ version?: string }>
        files?: Record<string, { content?: string }>
      }
      expect(updatedGist.public).toBe(false)
      expect(updatedGist.history?.[0]?.version).not.toBe(
        gist.history?.[0]?.version,
      )
      const updatedEncryptedContent =
        updatedGist.files?.[GITHUB_GIST_BACKUP_FILE_NAME]?.content ?? ""
      expect(updatedEncryptedContent).toContain(
        "all-api-hub-webdav-backup-encrypted",
      )
      expect(updatedEncryptedContent).not.toContain("gist-e2e-token-2")
      expect(updatedEncryptedContent).not.toContain(GIST_PASSWORD)
      expect(updatedEncryptedContent).not.toContain(token!)

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
      expect(storedAccounts).toContain("github-gist-real-site-account-2")
    } finally {
      if (gistId) await deleteGist(token!, gistId)
    }
  })
})
