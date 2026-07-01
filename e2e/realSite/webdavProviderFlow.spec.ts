import type { Page, Worker } from "@playwright/test"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { WEBDAV_TARGET_IDS } from "~/features/ImportExport/searchTargets"
import { IMPORT_EXPORT_TEST_IDS } from "~/features/ImportExport/testIds"
import {
  createDefaultAccountStorageConfig,
  normalizeAccountStorageConfigForWrite,
} from "~/services/accounts/accountDefaults"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { AccountStorageConfig } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageRawValue,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { readEnv } from "~~/e2e/utils/realSite/shared"

type WebdavProviderConfig = {
  providerName: string
  accountPrefix: string
  url: string
  username: string
  password: string
}

type ResolvedWebdavProviderConfig = {
  config?: WebdavProviderConfig
  missingEnvKeys: string[]
}

type WebdavProviderEnvCandidate = {
  providerName: string
  accountPrefix: string
  urlEnvKey: string
  usernameEnvKey: string
  passwordEnvKey: string
}

type WebdavProviderCredentials = {
  url: string
  username: string
  password: string
}

const DEFAULT_WEBDAV_PROVIDER_PREFIX = "NUTSTORE_WEBDAV"

function resolveWebdavProviderConfig(): ResolvedWebdavProviderConfig {
  const providerPrefix = readEnv("AAH_E2E_WEBDAV_PROVIDER_PREFIX")
  const providerName = readEnv("AAH_E2E_WEBDAV_PROVIDER_NAME") ?? "Nutstore"
  const accountPrefix =
    readEnv("AAH_E2E_WEBDAV_ACCOUNT_PREFIX") ??
    providerName.toLowerCase().replace(/[^a-z0-9]+/gu, "-")
  const genericCandidate: WebdavProviderEnvCandidate = {
    providerName,
    accountPrefix,
    urlEnvKey: "AAH_E2E_WEBDAV_URL",
    usernameEnvKey: "AAH_E2E_WEBDAV_USERNAME",
    passwordEnvKey: "AAH_E2E_WEBDAV_PASSWORD",
  }
  const prefixedCandidate: WebdavProviderEnvCandidate = {
    providerName,
    accountPrefix,
    urlEnvKey: `AAH_E2E_${providerPrefix ?? DEFAULT_WEBDAV_PROVIDER_PREFIX}_URL`,
    usernameEnvKey: `AAH_E2E_${providerPrefix ?? DEFAULT_WEBDAV_PROVIDER_PREFIX}_USERNAME`,
    passwordEnvKey: `AAH_E2E_${providerPrefix ?? DEFAULT_WEBDAV_PROVIDER_PREFIX}_PASSWORD`,
  }
  const candidates: WebdavProviderEnvCandidate[] = providerPrefix
    ? [prefixedCandidate]
    : [genericCandidate, prefixedCandidate]

  for (const candidate of candidates) {
    const config = readWebdavProviderCredentials(candidate)
    if (config) {
      return {
        config: {
          ...config,
          providerName: candidate.providerName,
          accountPrefix: candidate.accountPrefix,
        },
        missingEnvKeys: [],
      }
    }
  }

  const fallbackCandidate = candidates[candidates.length - 1]

  return {
    config: undefined,
    missingEnvKeys: resolveMissingWebdavProviderEnvKeys(fallbackCandidate),
  }
}

function readWebdavProviderCredentials(
  candidate: WebdavProviderEnvCandidate,
): WebdavProviderCredentials | undefined {
  const config = {
    url: readEnv(candidate.urlEnvKey),
    username: readEnv(candidate.usernameEnvKey),
    password: readEnv(candidate.passwordEnvKey),
  }

  if (config.url && config.username && config.password) {
    return config as WebdavProviderCredentials
  }

  return undefined
}

function resolveMissingWebdavProviderEnvKeys(
  candidate: WebdavProviderEnvCandidate,
) {
  return [
    readEnv(candidate.urlEnvKey) ? null : candidate.urlEnvKey,
    readEnv(candidate.usernameEnvKey) ? null : candidate.usernameEnvKey,
    readEnv(candidate.passwordEnvKey) ? null : candidate.passwordEnvKey,
  ].filter((key): key is string => Boolean(key))
}

async function cleanupWebdavProviderFile(config: WebdavProviderConfig) {
  await fetch(config.url, {
    method: "DELETE",
    headers: {
      Authorization: buildBasicAuthHeader(config),
    },
  }).catch(() => {
    // Cleanup should not mask the actual E2E upload assertion.
  })
}

function buildBasicAuthHeader(
  config: Pick<WebdavProviderConfig, "username" | "password">,
) {
  return `Basic ${Buffer.from(`${config.username}:${config.password}`).toString(
    "base64",
  )}`
}

async function readWebdavProviderJson(config: WebdavProviderConfig) {
  const response = await fetch(config.url, {
    method: "GET",
    headers: {
      Authorization: buildBasicAuthHeader(config),
      Accept: "application/json",
    },
  })

  if (response.status < 200 || response.status >= 300) {
    return null
  }

  return (await response.json()) as {
    accounts?: {
      accounts?: Array<{ id?: string; site_name?: string }>
    }
  }
}

async function readStoredAccountConfig(
  serviceWorker: Worker,
): Promise<AccountStorageConfig> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
  )

  if (typeof raw !== "string") {
    return createDefaultAccountStorageConfig()
  }

  try {
    return JSON.parse(raw) as AccountStorageConfig
  } catch {
    return createDefaultAccountStorageConfig()
  }
}

async function seedBackupAccount(
  serviceWorker: Worker,
  account: {
    id: string
    name: string
  },
) {
  const now = Date.parse("2026-06-04T14:00:00.000Z")
  const storedAccount = createStoredAccount({
    id: account.id,
    site_name: account.name,
    site_url: `https://${account.id}.example.com`,
    account_info: {
      id: account.id,
      username: `${account.id}-user`,
      access_token: `${account.id}-token`,
    },
  })

  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
    normalizeAccountStorageConfigForWrite(
      {
        ...createDefaultAccountStorageConfig(now),
        accounts: [storedAccount],
        pinnedAccountIds: [storedAccount.id],
        orderedAccountIds: [storedAccount.id],
      } as AccountStorageConfig,
      now,
    ),
  )
}

async function fillWebdavSettings(page: Page, config: WebdavProviderConfig) {
  await page.locator(`#${WEBDAV_TARGET_IDS.url}`).fill(config.url)
  await page.locator(`#${WEBDAV_TARGET_IDS.username}`).fill(config.username)
  await page.locator(`#${WEBDAV_TARGET_IDS.password}`).fill(config.password)
}

async function waitForToast(page: Page, text: string) {
  await expect(page.getByRole("status").filter({ hasText: text })).toBeVisible({
    timeout: 30_000,
  })
}

async function saveWebdavConfig(page: Page) {
  await page.locator(`#${WEBDAV_TARGET_IDS.saveConfig}`).click()
  await waitForToast(page, "WebDAV Sync Update successful")
}

async function testWebdavConnection(page: Page) {
  await page.locator(`#${WEBDAV_TARGET_IDS.testConnection}`).click()
  await waitForToast(page, "Connection test successful")
}

async function uploadBackupToWebdav(page: Page) {
  const uploadButton = page.getByTestId(
    IMPORT_EXPORT_TEST_IDS.webdavUploadBackupButton,
  )

  await uploadButton.click()
  await waitForToast(page, "Uploaded to WebDAV")
}

async function importBackupFromWebdav(page: Page) {
  await page
    .getByTestId(IMPORT_EXPORT_TEST_IDS.webdavDownloadImportButton)
    .click()
  await waitForToast(page, "Data imported successfully")
}

test.describe("real-site E2E: WebDAV provider flow", () => {
  test.beforeEach(async ({ context, page }) => {
    installExtensionPageGuards(page, {
      ignoreConsoleErrorPatterns: [
        /Failed to load resource: .*status of (404|405|409)/u,
      ],
    })
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
  })

  test("saves, verifies, overwrites, and restores a backup through a real WebDAV provider", async ({
    context,
    extensionId,
    page,
  }) => {
    const realSite = resolveWebdavProviderConfig()
    test.skip(
      !realSite.config,
      `Missing real-site WebDAV provider E2E env: ${realSite.missingEnvKeys.join(
        ", ",
      )}`,
    )
    const config = realSite.config!

    await cleanupWebdavProviderFile(config)

    try {
      const serviceWorker =
        context.serviceWorkers()[0] ||
        (await context.waitForEvent("serviceworker"))

      await seedUserPreferences(serviceWorker, {
        webdav: {
          url: config.url,
          username: config.username,
          password: config.password,
        },
      })

      await page.goto(
        `chrome-extension://${extensionId}/options.html#${MENU_ITEM_IDS.IMPORT_EXPORT}`,
      )
      await waitForExtensionRoot(page)
      await fillWebdavSettings(page, config)
      await saveWebdavConfig(page)
      await testWebdavConnection(page)

      await seedBackupAccount(serviceWorker, {
        id: `${config.accountPrefix}-webdav-first`,
        name: `${config.providerName} WebDAV First`,
      })
      await uploadBackupToWebdav(page)
      await expect
        .poll(async () => {
          const backup = await readWebdavProviderJson(config)
          return backup?.accounts?.accounts?.map((account) => account.id) ?? []
        })
        .toEqual([`${config.accountPrefix}-webdav-first`])

      await seedBackupAccount(serviceWorker, {
        id: `${config.accountPrefix}-webdav-second`,
        name: `${config.providerName} WebDAV Second`,
      })
      await uploadBackupToWebdav(page)

      await expect
        .poll(async () => {
          const backup = await readWebdavProviderJson(config)
          return backup?.accounts?.accounts ?? []
        })
        .toEqual([
          expect.objectContaining({
            id: `${config.accountPrefix}-webdav-second`,
            site_name: `${config.providerName} WebDAV Second`,
          }),
        ])

      await seedBackupAccount(serviceWorker, {
        id: `${config.accountPrefix}-webdav-local-only`,
        name: `${config.providerName} WebDAV Local Only`,
      })
      await importBackupFromWebdav(page)

      await expect
        .poll(async () => {
          const accountConfig = await readStoredAccountConfig(serviceWorker)
          return accountConfig.accounts.map((account) => ({
            id: account.id,
            siteName: account.site_name,
          }))
        })
        .toEqual([
          {
            id: `${config.accountPrefix}-webdav-second`,
            siteName: `${config.providerName} WebDAV Second`,
          },
        ])
    } finally {
      await cleanupWebdavProviderFile(config)
    }
  })
})
