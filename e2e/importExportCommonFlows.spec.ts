import fs from "node:fs/promises"
import type { BrowserContext, Page } from "@playwright/test"

import {
  OPTIONS_PAGE_PATH,
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { getPopupViewTestId, POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { WEBDAV_AUTO_SYNC_TARGET_IDS } from "~/features/ImportExport/searchTargets"
import { IMPORT_EXPORT_TEST_IDS } from "~/features/ImportExport/testIds"
import { SITE_BOOKMARKS_TEST_IDS } from "~/features/SiteBookmarks/testIds"
import {
  createDefaultAccountStorageConfig,
  normalizeAccountStorageConfigForWrite,
} from "~/services/accounts/accountDefaults"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { AccountStorageConfig, SiteAccount } from "~/types"
import {
  API_CREDENTIAL_PROFILES_CONFIG_VERSION,
  type ApiCredentialProfilesConfig,
} from "~/types/apiCredentialProfiles"
import type { ChannelConfigMap } from "~/types/channelConfig"
import { WEBDAV_SYNC_STRATEGIES } from "~/types/webdav"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  createStoredApiCredentialProfile,
  createStoredBookmark,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedApiCredentialProfiles,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
  waitForExtensionPage,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageRawValue,
  getServiceWorker,
  getStoredUserPreferences,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const CHANNEL_CONFIGS_STORAGE_KEY = "channel_configs"

async function chooseFullReplaceImport(page: Page) {
  for (const testId of [
    IMPORT_EXPORT_TEST_IDS.importAccountsReplaceOption,
    IMPORT_EXPORT_TEST_IDS.importApiCredentialProfilesReplaceOption,
    IMPORT_EXPORT_TEST_IDS.importPreferencesReplaceOption,
    IMPORT_EXPORT_TEST_IDS.importChannelConfigsReplaceOption,
  ]) {
    const option = page.getByTestId(testId)
    if ((await option.count()) > 0) {
      await option.click()
    }
  }
}

async function readStoredAccountConfig(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
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

async function readStoredApiCredentialProfiles(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<ApiCredentialProfilesConfig> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.API_CREDENTIAL_PROFILES,
  )

  if (typeof raw !== "string") {
    return {
      version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
      profiles: [],
      lastUpdated: 0,
    }
  }

  try {
    return JSON.parse(raw) as ApiCredentialProfilesConfig
  } catch {
    return {
      version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
      profiles: [],
      lastUpdated: 0,
    }
  }
}

async function readStoredChannelConfigs(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<ChannelConfigMap> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    CHANNEL_CONFIGS_STORAGE_KEY,
  )

  if (typeof raw !== "string") {
    return {}
  }

  try {
    return JSON.parse(raw) as ChannelConfigMap
  } catch {
    return {}
  }
}

function buildAccountBackup(accounts: SiteAccount[]) {
  const now = Date.parse("2026-03-30T12:00:00.000Z")

  return {
    version: "2.0",
    type: "accounts",
    timestamp: now,
    accounts: normalizeAccountStorageConfigForWrite(
      {
        ...createDefaultAccountStorageConfig(now),
        accounts,
        pinnedAccountIds: accounts.slice(0, 1).map((account) => account.id),
        orderedAccountIds: accounts.map((account) => account.id),
      },
      now,
    ),
  }
}

async function installWebdavBackupRoute(
  context: BrowserContext,
  webdavFileUrl: string,
) {
  const uploadedPayloads: unknown[] = []
  const stagedBackups = new Map<string, string>()
  const tempDeleteUrls: string[] = []
  let remoteBackup = ""
  const webdavBackupFile = new URL(webdavFileUrl)
  const webdavBackupDirectoryPath = webdavBackupFile.pathname.replace(
    /\/[^/]*$/,
    "",
  )
  const webdavBackupFileName = webdavBackupFile.pathname.split("/").pop() ?? ""

  await context.route(`${webdavBackupFile.origin}/**`, async (route) => {
    const method = route.request().method()
    const url = new URL(route.request().url())
    const isBackupFile = url.href === webdavFileUrl
    const requestDirectoryPath = url.pathname.replace(/\/[^/]*$/, "")
    const requestFileName = url.pathname.split("/").pop() ?? ""
    const isTempBackupFile =
      requestDirectoryPath === webdavBackupDirectoryPath &&
      (requestFileName.startsWith(`${webdavBackupFileName}.tmp.`) ||
        requestFileName.startsWith(`.${webdavBackupFileName}.tmp.`))

    if (method === "GET" && (isBackupFile || isTempBackupFile)) {
      const body = isTempBackupFile ? stagedBackups.get(url.href) : remoteBackup
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: body || "{}",
      })
      return
    }

    if (method === "PUT" && (isBackupFile || isTempBackupFile)) {
      const body = route.request().postData() ?? ""
      if (isTempBackupFile) {
        stagedBackups.set(url.href, body)
      } else {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "direct final backup PUT rejected" }),
        })
        return
      }
      await route.fulfill({
        status: 204,
        contentType: "application/json",
        body: "{}",
      })
      return
    }

    if (method === "PROPFIND") {
      await route.fulfill({
        status: 207,
        contentType: "application/xml",
        body: `<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:" />`,
      })
      return
    }

    if (method === "MOVE" && isTempBackupFile) {
      const destination = route.request().headers()["destination"]
      const body = stagedBackups.get(url.href)
      if (destination !== webdavFileUrl || body === undefined) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "missing staged backup" }),
        })
        return
      }

      remoteBackup = body
      stagedBackups.delete(url.href)
      uploadedPayloads.push(JSON.parse(remoteBackup))
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: "{}",
      })
      return
    }

    if (method === "DELETE" && isTempBackupFile) {
      tempDeleteUrls.push(url.href)
      stagedBackups.delete(url.href)
      await route.fulfill({
        status: 204,
        contentType: "text/plain",
        body: "",
      })
      return
    }

    await route.fulfill({
      status: method === "MKCOL" ? 201 : 204,
      contentType: "text/plain",
      body: "",
    })
  })

  return {
    uploadedPayloads,
    tempDeleteUrls,
    setRemoteBackup(body: string) {
      remoteBackup = body
    },
  }
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("exports a full backup containing accounts, user preferences, and API credential profiles", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "export-account-1",
      site_name: "Export Account",
      site_url: "https://export.example.com",
      account_info: {
        id: "101",
        username: "export-user",
        access_token: "export-token",
      },
    }),
  ])
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "export-profile-1",
      name: "Export Profile",
      baseUrl: "https://export-profile.example.com",
      apiKey: "sk-export-profile",
    }),
  ])
  await seedUserPreferences(serviceWorker, {
    currencyType: "CNY",
    actionClickBehavior: "sidepanel",
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.IMPORT_EXPORT}`,
  )
  await waitForExtensionRoot(page)

  const downloadPromise = page.waitForEvent("download")
  await page.getByTestId(IMPORT_EXPORT_TEST_IDS.exportFullBackupButton).click()

  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(
    /^all-api-hub-backup-\d{4}-\d{2}-\d{2}\.json$/,
  )

  const downloadPath = await download.path()
  if (!downloadPath) {
    throw new Error("Exported backup did not produce a readable download")
  }

  const backup = JSON.parse(await fs.readFile(downloadPath, "utf8")) as {
    version?: string
    accounts?: { accounts?: Array<{ id?: string; site_name?: string }> }
    preferences?: {
      currencyType?: string
      actionClickBehavior?: string
    }
    apiCredentialProfiles?: {
      profiles?: Array<{
        id?: string
        name?: string
        baseUrl?: string
        apiKey?: string
      }>
    }
  }

  expect(backup.version).toBe("2.0")
  expect(backup.accounts?.accounts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "export-account-1",
        site_name: "Export Account",
      }),
    ]),
  )
  expect(backup.preferences).toMatchObject({
    currencyType: "CNY",
    actionClickBehavior: "sidepanel",
  })
  expect(backup.apiCredentialProfiles?.profiles).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "export-profile-1",
        name: "Export Profile",
        baseUrl: "https://export-profile.example.com",
        apiKey: "sk-export-profile",
      }),
    ]),
  )
})

test("round-trips a full backup through export download and file import", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const now = Date.parse("2026-03-30T15:00:00.000Z")
  const roundTripAccount = createStoredAccount({
    id: "round-trip-account",
    site_name: "Round Trip Account",
    site_url: "https://round-trip.example.com",
    account_info: {
      id: "701",
      username: "round-trip-user",
      access_token: "round-trip-token",
    },
  })
  const roundTripBookmark = createStoredBookmark({
    id: "round-trip-bookmark",
    name: "Round Trip Bookmark",
    url: "https://round-trip.example.com/docs",
    notes: "Exported and restored from the downloaded backup",
  })
  const roundTripProfile = createStoredApiCredentialProfile({
    id: "round-trip-profile",
    name: "Round Trip Profile",
    baseUrl: "https://round-trip-api.example.com",
    apiKey: "sk-round-trip-profile",
    createdAt: now,
    updatedAt: now,
  })
  const roundTripChannelConfigs: ChannelConfigMap = {
    42: {
      channelId: 42,
      modelFilterSettings: {
        rules: [
          {
            id: "round-trip-filter",
            name: "Round Trip Filter",
            action: "include",
            enabled: true,
            kind: "pattern",
            pattern: "gpt-4o",
            isRegex: false,
            createdAt: now,
            updatedAt: now,
          },
        ],
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    },
  }

  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
    normalizeAccountStorageConfigForWrite(
      {
        ...createDefaultAccountStorageConfig(now),
        accounts: [roundTripAccount],
        bookmarks: [roundTripBookmark],
        pinnedAccountIds: [roundTripAccount.id],
        orderedAccountIds: [roundTripAccount.id],
        pinnedBookmarkIds: [roundTripBookmark.id],
        orderedBookmarkIds: [roundTripBookmark.id],
      } as AccountStorageConfig,
      now,
    ),
  )
  await seedUserPreferences(serviceWorker, {
    currencyType: "CNY",
    actionClickBehavior: "sidepanel",
    themeMode: "dark",
  })
  await setPlasmoStorageValue(
    serviceWorker,
    CHANNEL_CONFIGS_STORAGE_KEY,
    roundTripChannelConfigs,
  )
  await seedApiCredentialProfiles(serviceWorker, [roundTripProfile])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.IMPORT_EXPORT}`,
  )
  await waitForExtensionRoot(page)

  const downloadPromise = page.waitForEvent("download")
  await page.getByTestId(IMPORT_EXPORT_TEST_IDS.exportFullBackupButton).click()

  const download = await downloadPromise
  const downloadPath = await download.path()
  if (!downloadPath) {
    throw new Error("Round-trip backup did not produce a readable download")
  }

  const exportedBackupBuffer = await fs.readFile(downloadPath)
  const exportedBackup = JSON.parse(exportedBackupBuffer.toString("utf8")) as {
    accounts?: AccountStorageConfig
    preferences?: Record<string, unknown>
    channelConfigs?: ChannelConfigMap
    apiCredentialProfiles?: ApiCredentialProfilesConfig
  }

  expect(exportedBackup.accounts?.accounts).toEqual([
    expect.objectContaining({
      id: "round-trip-account",
      site_name: "Round Trip Account",
    }),
  ])
  expect(exportedBackup.accounts?.bookmarks).toEqual([
    expect.objectContaining({
      id: "round-trip-bookmark",
      name: "Round Trip Bookmark",
    }),
  ])
  expect(exportedBackup.preferences).toMatchObject({
    currencyType: "CNY",
    actionClickBehavior: "sidepanel",
    themeMode: "dark",
  })
  expect(exportedBackup.channelConfigs).toMatchObject({
    42: {
      channelId: 42,
      modelFilterSettings: {
        rules: [
          expect.objectContaining({
            id: "round-trip-filter",
            name: "Round Trip Filter",
            action: "include",
            pattern: "gpt-4o",
          }),
        ],
      },
    },
  })
  expect(exportedBackup.apiCredentialProfiles?.profiles).toEqual([
    expect.objectContaining({
      id: "round-trip-profile",
      name: "Round Trip Profile",
    }),
  ])

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "round-trip-old-account",
      site_name: "Round Trip Old Account",
      site_url: "https://round-trip-old.example.com",
      account_info: {
        id: "702",
        username: "round-trip-old-user",
        access_token: "round-trip-old-token",
      },
    }),
  ])
  await seedUserPreferences(serviceWorker, {
    currencyType: "USD",
    actionClickBehavior: "popup",
    themeMode: "system",
  })
  await setPlasmoStorageValue(serviceWorker, CHANNEL_CONFIGS_STORAGE_KEY, {
    43: {
      channelId: 43,
      modelFilterSettings: {
        rules: [],
        updatedAt: now + 1,
      },
      createdAt: now + 1,
      updatedAt: now + 1,
    },
  } satisfies ChannelConfigMap)
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "round-trip-old-profile",
      name: "Round Trip Old Profile",
      baseUrl: "https://round-trip-old-api.example.com",
      apiKey: "sk-round-trip-old-profile",
    }),
  ])

  await page.locator("#import-backup-file").setInputFiles({
    name: download.suggestedFilename(),
    mimeType: "application/json",
    buffer: exportedBackupBuffer,
  })

  await expect(page.getByText("Data format is correct")).toBeVisible()
  await expect(page.getByText("Contains account data")).toBeVisible()
  await expect(page.getByText("Contains user settings")).toBeVisible()
  await expect(page.getByText("Contains channel configuration")).toBeVisible()
  await expect(
    page.getByTestId(IMPORT_EXPORT_TEST_IDS.containsApiCredentialProfiles),
  ).toBeVisible()

  await chooseFullReplaceImport(page)
  await page.getByTestId(IMPORT_EXPORT_TEST_IDS.importBackupButton).click()

  await expect
    .poll(async () => {
      const [accountConfig, profileConfig, preferences] = await Promise.all([
        readStoredAccountConfig(serviceWorker),
        readStoredApiCredentialProfiles(serviceWorker),
        getStoredUserPreferences(serviceWorker),
      ])
      const channelConfigs = await readStoredChannelConfigs(serviceWorker)

      return {
        accountIds: accountConfig.accounts.map((account) => account.id),
        bookmarkIds: accountConfig.bookmarks.map((bookmark) => bookmark.id),
        profileIds: profileConfig.profiles.map((profile) => profile.id),
        channelConfigIds: Object.keys(channelConfigs),
        channelFilterNames:
          channelConfigs[42]?.modelFilterSettings.rules.map(
            (rule) => rule.name,
          ) ?? [],
        currencyType: preferences.currencyType,
        actionClickBehavior: preferences.actionClickBehavior,
        themeMode: preferences.themeMode,
      }
    })
    .toEqual({
      accountIds: ["round-trip-account"],
      bookmarkIds: ["round-trip-bookmark"],
      profileIds: ["round-trip-profile"],
      channelConfigIds: ["42"],
      channelFilterNames: ["Round Trip Filter"],
      currencyType: "CNY",
      actionClickBehavior: "sidepanel",
      themeMode: "dark",
    })

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await expect(page.getByTestId(getPopupViewTestId("accounts"))).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Round Trip Account" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Round Trip Old Account" }),
  ).toHaveCount(0)

  await page.getByTestId(POPUP_TEST_IDS.bookmarksTab).click()
  await expect(page.getByTestId(SITE_BOOKMARKS_TEST_IDS.listView)).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Round Trip Bookmark" }),
  ).toBeVisible()

  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Round Trip Profile" }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Round Trip Old Profile" }),
  ).toHaveCount(0)
})

test("imports account backup JSON from the preview field and appends by default", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "old-account",
      site_name: "Old Account",
      site_url: "https://old.example.com",
      account_info: {
        id: "201",
        username: "old-user",
        access_token: "old-token",
      },
    }),
  ])

  const backup = buildAccountBackup([
    createStoredAccount({
      id: "imported-account",
      site_name: "Imported Account",
      site_url: "https://imported.example.com",
      account_info: {
        id: "301",
        username: "imported-user",
        access_token: "imported-token",
      },
    }),
  ])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.IMPORT_EXPORT}`,
  )
  await waitForExtensionRoot(page)

  await page.locator("#import-data-preview").fill(JSON.stringify(backup))

  await expect(page.getByText("Data format is correct")).toBeVisible()
  await expect(page.getByText("Contains account data")).toBeVisible()

  await page.getByTestId(IMPORT_EXPORT_TEST_IDS.importBackupButton).click()

  await expect
    .poll(async () => {
      const config = await readStoredAccountConfig(serviceWorker)
      return {
        accountIds: config.accounts.map((account) => account.id).sort(),
        pinnedAccountIds: config.pinnedAccountIds,
        orderedAccountIds: config.orderedAccountIds,
      }
    })
    .toEqual({
      accountIds: ["imported-account", "old-account"],
      pinnedAccountIds: ["imported-account"],
      orderedAccountIds: ["imported-account"],
    })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`,
  )
  await waitForExtensionRoot(page)

  await expect(
    page.getByRole("button", { name: "Imported Account" }),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Old Account" })).toBeVisible()
})

test("imports account backup JSON from a selected file and restores popup accounts", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const backup = buildAccountBackup([
    createStoredAccount({
      id: "file-import-account",
      site_name: "File Import Account",
      site_url: "https://file-import.example.com",
      account_info: {
        id: "401",
        username: "file-import-user",
        access_token: "file-import-token",
      },
    }),
  ])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.IMPORT_EXPORT}`,
  )
  await waitForExtensionRoot(page)

  await page.locator("#import-backup-file").setInputFiles({
    name: "all-api-hub-file-import-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup), "utf8"),
  })

  await expect(page.locator("#import-data-preview")).toHaveValue(
    JSON.stringify(backup),
  )
  await expect(page.getByText("Data format is correct")).toBeVisible()
  await expect(page.getByText("Contains account data")).toBeVisible()

  await page.getByTestId(IMPORT_EXPORT_TEST_IDS.importBackupButton).click()

  await expect
    .poll(async () => {
      const config = await readStoredAccountConfig(serviceWorker)
      return config.accounts.map((account) => account.id)
    })
    .toEqual(["file-import-account"])

  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await waitForExtensionRoot(page)

  await expect(page.getByTestId(getPopupViewTestId("accounts"))).toBeVisible()
  await expect(
    page.getByRole("button", { name: "File Import Account" }),
  ).toBeVisible()
  await expect(page.getByText("file-import-user")).toBeVisible()
})

test("imports API credential profiles from backup JSON and restores the popup tab", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const now = Date.parse("2026-03-30T13:00:00.000Z")
  const importedProfile = createStoredApiCredentialProfile({
    id: "imported-profile",
    name: "Imported Profile",
    baseUrl: "https://imported-profile.example.com",
    apiKey: "sk-imported-profile",
    createdAt: now,
    updatedAt: now,
  })
  const backup = {
    version: "2.0",
    timestamp: now,
    apiCredentialProfiles: {
      version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
      profiles: [importedProfile],
      lastUpdated: now,
    },
  }

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.IMPORT_EXPORT}`,
  )
  await waitForExtensionRoot(page)

  await page.locator("#import-data-preview").fill(JSON.stringify(backup))

  await expect(page.getByText("Data format is correct")).toBeVisible()
  await expect(
    page.getByTestId(IMPORT_EXPORT_TEST_IDS.containsApiCredentialProfiles),
  ).toBeVisible()

  await page
    .getByTestId(
      IMPORT_EXPORT_TEST_IDS.importApiCredentialProfilesReplaceOption,
    )
    .click()
  await page.getByTestId(IMPORT_EXPORT_TEST_IDS.importBackupButton).click()

  await expect
    .poll(async () => {
      const config = await readStoredApiCredentialProfiles(serviceWorker)
      return config.profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        baseUrl: profile.baseUrl,
      }))
    })
    .toEqual([
      {
        id: "imported-profile",
        name: "Imported Profile",
        baseUrl: "https://imported-profile.example.com",
      },
    ])

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Imported Profile" }),
  ).toBeVisible()
})

test("refreshes an already-open popup API credentials tab after backup import", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const now = Date.parse("2026-03-30T13:30:00.000Z")
  const importedProfile = createStoredApiCredentialProfile({
    id: "live-refresh-profile",
    name: "Live Refresh Profile",
    baseUrl: "https://live-refresh-profile.example.com",
    apiKey: "sk-live-refresh-profile",
    createdAt: now,
    updatedAt: now,
  })
  const backup = {
    version: "2.0",
    timestamp: now,
    apiCredentialProfiles: {
      version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
      profiles: [importedProfile],
      lastUpdated: now,
    },
  }

  const popupPage = await context.newPage()
  installExtensionPageGuards(popupPage)
  await forceExtensionLanguage(popupPage, "en")
  await popupPage.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(popupPage)

  await popupPage.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    popupPage.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()
  await expect(popupPage.getByText("No API keys saved yet")).toBeVisible()
  await expect(
    popupPage.getByRole("heading", { name: "Live Refresh Profile" }),
  ).toHaveCount(0)

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.IMPORT_EXPORT}`,
  )
  await waitForExtensionRoot(page)

  await page.locator("#import-data-preview").fill(JSON.stringify(backup))

  await expect(page.getByText("Data format is correct")).toBeVisible()
  await expect(
    page.getByTestId(IMPORT_EXPORT_TEST_IDS.containsApiCredentialProfiles),
  ).toBeVisible()

  await page
    .getByTestId(
      IMPORT_EXPORT_TEST_IDS.importApiCredentialProfilesReplaceOption,
    )
    .click()
  await page.getByTestId(IMPORT_EXPORT_TEST_IDS.importBackupButton).click()

  await expect
    .poll(async () => {
      const config = await readStoredApiCredentialProfiles(serviceWorker)
      return config.profiles.map((profile) => profile.id)
    })
    .toEqual(["live-refresh-profile"])

  await expect(
    popupPage.getByRole("heading", { name: "Live Refresh Profile" }),
  ).toBeVisible()
  await expect(popupPage.getByText("No API keys saved yet")).toHaveCount(0)
})

test("restores a full backup and keeps common popup workflows available", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "pre-restore-account",
      site_name: "Pre Restore Account",
      site_url: "https://pre-restore.example.com",
      account_info: {
        id: "501",
        username: "pre-restore-user",
        access_token: "pre-restore-token",
      },
    }),
  ])
  await seedUserPreferences(serviceWorker, {
    currencyType: "USD",
    actionClickBehavior: "popup",
  })

  const now = Date.parse("2026-03-30T14:00:00.000Z")
  const restoredAccount = createStoredAccount({
    id: "full-restore-account",
    site_name: "Full Restore Account",
    site_url: "https://full-restore.example.com",
    account_info: {
      id: "601",
      username: "full-restore-user",
      access_token: "full-restore-token",
    },
  })
  const restoredBookmark = createStoredBookmark({
    id: "full-restore-bookmark",
    name: "Full Restore Bookmark",
    url: "https://full-restore.example.com/docs",
  })
  const restoredProfile = createStoredApiCredentialProfile({
    id: "full-restore-profile",
    name: "Full Restore Profile",
    baseUrl: "https://full-restore-api.example.com",
    apiKey: "sk-full-restore-profile",
    createdAt: now,
    updatedAt: now,
  })
  const backup = {
    version: "2.0",
    timestamp: now,
    accounts: normalizeAccountStorageConfigForWrite(
      {
        ...createDefaultAccountStorageConfig(now),
        accounts: [restoredAccount],
        bookmarks: [restoredBookmark],
        pinnedAccountIds: [restoredAccount.id],
        orderedAccountIds: [restoredAccount.id],
        pinnedBookmarkIds: [restoredBookmark.id],
        orderedBookmarkIds: [restoredBookmark.id],
      } as AccountStorageConfig,
      now,
    ),
    preferences: {
      ...(await getStoredUserPreferences(serviceWorker)),
      currencyType: "CNY",
      actionClickBehavior: "sidepanel",
    },
    apiCredentialProfiles: {
      version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
      profiles: [restoredProfile],
      lastUpdated: now,
    },
  }

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.IMPORT_EXPORT}`,
  )
  await waitForExtensionRoot(page)

  await page.locator("#import-data-preview").fill(JSON.stringify(backup))

  await expect(page.getByText("Data format is correct")).toBeVisible()
  await expect(page.getByText("Contains account data")).toBeVisible()
  await expect(page.getByText("Contains user settings")).toBeVisible()
  await expect(
    page.getByTestId(IMPORT_EXPORT_TEST_IDS.containsApiCredentialProfiles),
  ).toBeVisible()

  await chooseFullReplaceImport(page)
  await page.getByTestId(IMPORT_EXPORT_TEST_IDS.importBackupButton).click()

  await expect
    .poll(async () => {
      const [accountConfig, profileConfig, preferences] = await Promise.all([
        readStoredAccountConfig(serviceWorker),
        readStoredApiCredentialProfiles(serviceWorker),
        getStoredUserPreferences(serviceWorker),
      ])

      return {
        accountIds: accountConfig.accounts.map((account) => account.id),
        bookmarkIds: accountConfig.bookmarks.map((bookmark) => bookmark.id),
        profileIds: profileConfig.profiles.map((profile) => profile.id),
        currencyType: preferences.currencyType,
        actionClickBehavior: preferences.actionClickBehavior,
      }
    })
    .toEqual({
      accountIds: ["full-restore-account"],
      bookmarkIds: ["full-restore-bookmark"],
      profileIds: ["full-restore-profile"],
      currencyType: "CNY",
      actionClickBehavior: "sidepanel",
    })

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  await expect(page.getByTestId(getPopupViewTestId("accounts"))).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Full Restore Account" }),
  ).toBeVisible()
  await expect(page.getByText("full-restore-user")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Pre Restore Account" }),
  ).toHaveCount(0)

  await page.getByTestId(POPUP_TEST_IDS.bookmarksTab).click()
  await expect(page.getByTestId(SITE_BOOKMARKS_TEST_IDS.listView)).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Full Restore Bookmark" }),
  ).toBeVisible()

  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Full Restore Profile" }),
  ).toBeVisible()
})

test("restores a full backup and keeps the sidepanel model workflow available", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const now = Date.parse("2026-03-30T16:00:00.000Z")
  const restoredAccount = createStoredAccount({
    id: "sidepanel-restore-account",
    site_name: "Sidepanel Restore Account",
    site_url: "https://sidepanel-restore.example.com",
    account_info: {
      id: "901",
      username: "sidepanel-restore-user",
      access_token: "sidepanel-restore-token",
    },
  })
  const restoredBookmark = createStoredBookmark({
    id: "sidepanel-restore-bookmark",
    name: "Sidepanel Restore Bookmark",
    url: "https://sidepanel-restore.example.com/docs",
  })
  const restoredProfile = createStoredApiCredentialProfile({
    id: "sidepanel-restore-profile",
    name: "Sidepanel Restore Profile",
    baseUrl: "https://sidepanel-restore-api.example.com",
    apiKey: "sk-sidepanel-restore-profile",
    createdAt: now,
    updatedAt: now,
  })
  const backup = {
    version: "2.0",
    timestamp: now,
    accounts: normalizeAccountStorageConfigForWrite(
      {
        ...createDefaultAccountStorageConfig(now),
        accounts: [restoredAccount],
        bookmarks: [restoredBookmark],
        pinnedAccountIds: [restoredAccount.id],
        orderedAccountIds: [restoredAccount.id],
        pinnedBookmarkIds: [restoredBookmark.id],
        orderedBookmarkIds: [restoredBookmark.id],
      } as AccountStorageConfig,
      now,
    ),
    preferences: {
      ...(await getStoredUserPreferences(serviceWorker)),
      currencyType: "CNY",
      actionClickBehavior: "sidepanel",
    },
    apiCredentialProfiles: {
      version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
      profiles: [restoredProfile],
      lastUpdated: now,
    },
  }

  await context.route(
    "https://sidepanel-restore-api.example.com/v1/models",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            { id: "gpt-sidepanel-restore-mini" },
            { id: "gpt-sidepanel-restore-pro" },
          ],
        }),
      }),
  )

  const sidepanelPage = await context.newPage()
  installExtensionPageGuards(sidepanelPage)
  await forceExtensionLanguage(sidepanelPage, "en")
  await sidepanelPage.goto(
    `chrome-extension://${extensionId}/${SIDEPANEL_PAGE_PATH}`,
  )
  await waitForExtensionRoot(sidepanelPage)
  await sidepanelPage
    .getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab)
    .click()
  await expect(
    sidepanelPage.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()
  await expect(
    sidepanelPage.getByRole("heading", { name: "Sidepanel Restore Profile" }),
  ).toHaveCount(0)

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.IMPORT_EXPORT}`,
  )
  await waitForExtensionRoot(page)

  await page.locator("#import-data-preview").fill(JSON.stringify(backup))
  await expect(page.getByText("Data format is correct")).toBeVisible()
  await expect(page.getByText("Contains account data")).toBeVisible()
  await expect(page.getByText("Contains user settings")).toBeVisible()
  await expect(
    page.getByTestId(IMPORT_EXPORT_TEST_IDS.containsApiCredentialProfiles),
  ).toBeVisible()

  await chooseFullReplaceImport(page)
  await page.getByTestId(IMPORT_EXPORT_TEST_IDS.importBackupButton).click()

  await expect
    .poll(async () => {
      const [accountConfig, profileConfig, preferences] = await Promise.all([
        readStoredAccountConfig(serviceWorker),
        readStoredApiCredentialProfiles(serviceWorker),
        getStoredUserPreferences(serviceWorker),
      ])

      return {
        accountIds: accountConfig.accounts.map((account) => account.id),
        bookmarkIds: accountConfig.bookmarks.map((bookmark) => bookmark.id),
        profileIds: profileConfig.profiles.map((profile) => profile.id),
        actionClickBehavior: preferences.actionClickBehavior,
      }
    })
    .toEqual({
      accountIds: ["sidepanel-restore-account"],
      bookmarkIds: ["sidepanel-restore-bookmark"],
      profileIds: ["sidepanel-restore-profile"],
      actionClickBehavior: "sidepanel",
    })

  await expect(
    sidepanelPage.getByRole("heading", { name: "Sidepanel Restore Profile" }),
  ).toBeVisible()

  const modelsPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.MODELS}`,
    searchParams: {
      profileId: "sidepanel-restore-profile",
    },
  })

  await sidepanelPage
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.openModelManagementButton)
    .click()

  const modelsPage = await modelsPagePromise
  installExtensionPageGuards(modelsPage)
  await waitForExtensionRoot(modelsPage)

  const targetUrl = new URL(modelsPage.url())
  expect(targetUrl.hash).toBe(`#${MENU_ITEM_IDS.MODELS}`)
  expect(targetUrl.searchParams.get("profileId")).toBe(
    "sidepanel-restore-profile",
  )
  await expect(modelsPage.getByText("gpt-sidepanel-restore-mini")).toBeVisible()
  await expect(modelsPage.getByText("gpt-sidepanel-restore-pro")).toBeVisible()
})

test("imports preference backup JSON and applies settings after reload", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    currencyType: "USD",
    actionClickBehavior: "popup",
    themeMode: "system",
  })

  const backup = {
    version: "2.0",
    type: "preferences",
    timestamp: Date.parse("2026-03-30T12:30:00.000Z"),
    preferences: {
      ...(await getStoredUserPreferences(serviceWorker)),
      currencyType: "CNY",
      actionClickBehavior: "sidepanel",
      themeMode: "dark",
    },
  }

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.IMPORT_EXPORT}`,
  )
  await waitForExtensionRoot(page)

  await page.locator("#import-data-preview").fill(JSON.stringify(backup))

  await expect(page.getByText("Data format is correct")).toBeVisible()
  await expect(page.getByText("Contains user settings")).toBeVisible()

  await page
    .getByTestId(IMPORT_EXPORT_TEST_IDS.importPreferencesReplaceOption)
    .click()
  await page.getByTestId(IMPORT_EXPORT_TEST_IDS.importBackupButton).click()

  await expect
    .poll(() => getStoredUserPreferences(serviceWorker))
    .toMatchObject({
      currencyType: "CNY",
      actionClickBehavior: "sidepanel",
      themeMode: "dark",
    })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)

  await expect(page.getByRole("button", { name: "CNY (¥)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(
    page.getByRole("button", { name: /Switch to Dark theme/i }),
  ).toHaveAttribute("aria-pressed", "true")
  await expect(
    page.getByRole("button", { name: "Open side panel" }),
  ).toHaveAttribute("aria-pressed", "true")
})

test("uploads a WebDAV backup and restores it through the WebDAV download flow", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const now = Date.parse("2026-03-30T18:00:00.000Z")
  const webdavFileUrl = "https://webdav.example.com/all-api-hub-e2e.json"
  const { uploadedPayloads, tempDeleteUrls } = await installWebdavBackupRoute(
    context,
    webdavFileUrl,
  )

  const webdavAccount = createStoredAccount({
    id: "webdav-account",
    site_name: "WebDAV Account",
    site_url: "https://webdav-account.example.com",
    account_info: {
      id: "801",
      username: "webdav-user",
      access_token: "webdav-token",
    },
  })
  const webdavBookmark = createStoredBookmark({
    id: "webdav-bookmark",
    name: "WebDAV Bookmark",
    url: "https://webdav-account.example.com/docs",
  })
  const webdavProfile = createStoredApiCredentialProfile({
    id: "webdav-profile",
    name: "WebDAV Profile",
    baseUrl: "https://webdav-profile.example.com",
    apiKey: "sk-webdav-profile",
    createdAt: now,
    updatedAt: now,
  })

  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
    normalizeAccountStorageConfigForWrite(
      {
        ...createDefaultAccountStorageConfig(now),
        accounts: [webdavAccount],
        bookmarks: [webdavBookmark],
        pinnedAccountIds: [webdavAccount.id],
        orderedAccountIds: [webdavAccount.id],
        pinnedBookmarkIds: [webdavBookmark.id],
        orderedBookmarkIds: [webdavBookmark.id],
      } as AccountStorageConfig,
      now,
    ),
  )
  await seedApiCredentialProfiles(serviceWorker, [webdavProfile])
  await seedUserPreferences(serviceWorker, {
    currencyType: "CNY",
    actionClickBehavior: "sidepanel",
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.IMPORT_EXPORT}`,
  )
  await waitForExtensionRoot(page)

  await page.locator("#webdav-url").fill(webdavFileUrl)
  await page.locator("#webdav-username").fill("webdav-user")
  await page.locator("#webdav-password").fill("webdav-password")
  await page
    .getByTestId(IMPORT_EXPORT_TEST_IDS.webdavUploadBackupButton)
    .click()

  await expect.poll(() => uploadedPayloads.length).toBe(1)
  expect(tempDeleteUrls).toEqual([])
  expect(uploadedPayloads[0]).toMatchObject({
    version: "2.0",
    accounts: {
      accounts: [
        expect.objectContaining({
          id: "webdav-account",
          site_name: "WebDAV Account",
        }),
      ],
      bookmarks: [
        expect.objectContaining({
          id: "webdav-bookmark",
          name: "WebDAV Bookmark",
        }),
      ],
    },
    apiCredentialProfiles: {
      profiles: [
        expect.objectContaining({
          id: "webdav-profile",
          name: "WebDAV Profile",
        }),
      ],
    },
    preferences: expect.objectContaining({
      currencyType: "CNY",
      actionClickBehavior: "sidepanel",
    }),
  })

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "webdav-old-account",
      site_name: "WebDAV Old Account",
      site_url: "https://webdav-old.example.com",
      account_info: {
        id: "802",
        username: "webdav-old-user",
        access_token: "webdav-old-token",
      },
    }),
  ])
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "webdav-old-profile",
      name: "WebDAV Old Profile",
      baseUrl: "https://webdav-old-profile.example.com",
      apiKey: "sk-webdav-old-profile",
    }),
  ])
  await seedUserPreferences(serviceWorker, {
    currencyType: "USD",
    actionClickBehavior: "popup",
    webdav: {
      url: webdavFileUrl,
      username: "webdav-user",
      password: "webdav-password",
    },
  })

  await page.close()
  const restorePage = await context.newPage()
  installExtensionPageGuards(restorePage)
  await forceExtensionLanguage(restorePage, "en")

  await restorePage.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.IMPORT_EXPORT}`,
  )
  await waitForExtensionRoot(restorePage)

  await restorePage.locator("#webdav-url").fill(webdavFileUrl)
  await restorePage.locator("#webdav-username").fill("webdav-user")
  await restorePage.locator("#webdav-password").fill("webdav-password")
  await restorePage
    .getByTestId(IMPORT_EXPORT_TEST_IDS.webdavDownloadImportButton)
    .click()

  await expect
    .poll(async () => {
      const [accountConfig, profileConfig, preferences] = await Promise.all([
        readStoredAccountConfig(serviceWorker),
        readStoredApiCredentialProfiles(serviceWorker),
        getStoredUserPreferences(serviceWorker),
      ])

      return {
        accountIds: accountConfig.accounts.map((account) => account.id),
        bookmarkIds: accountConfig.bookmarks.map((bookmark) => bookmark.id),
        profileIds: profileConfig.profiles.map((profile) => profile.id).sort(),
        currencyType: preferences.currencyType,
        actionClickBehavior: preferences.actionClickBehavior,
      }
    })
    .toEqual({
      accountIds: ["webdav-account"],
      bookmarkIds: ["webdav-bookmark"],
      profileIds: ["webdav-old-profile", "webdav-profile"],
      currencyType: "CNY",
      actionClickBehavior: "sidepanel",
    })

  await restorePage.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(restorePage)

  await expect(
    restorePage.getByTestId(getPopupViewTestId("accounts")),
  ).toBeVisible()
  await expect(
    restorePage.getByRole("button", { name: "WebDAV Account" }),
  ).toBeVisible()
  await expect(
    restorePage.getByRole("button", { name: "WebDAV Old Account" }),
  ).toHaveCount(0)

  await restorePage.getByTestId(POPUP_TEST_IDS.bookmarksTab).click()
  await expect(
    restorePage.getByRole("button", { name: "WebDAV Bookmark" }),
  ).toBeVisible()

  await restorePage.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    restorePage.getByRole("heading", { name: "WebDAV Profile" }),
  ).toBeVisible()
})

test("runs WebDAV auto-sync from settings and uploads the local snapshot", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const now = Date.parse("2026-03-30T19:00:00.000Z")
  const webdavFileUrl =
    "https://webdav-auto-sync.example.invalid/all-api-hub-auto-sync.json"
  const { uploadedPayloads, tempDeleteUrls } = await installWebdavBackupRoute(
    context,
    webdavFileUrl,
  )

  const syncedAccount = createStoredAccount({
    id: "webdav-auto-sync-account",
    site_name: "WebDAV Auto Sync Account",
    site_url: "https://webdav-auto-sync-account.example.invalid",
    account_info: {
      id: "901",
      username: "auto-sync-user",
      access_token: "auto-sync-token",
    },
  })
  const syncedProfile = createStoredApiCredentialProfile({
    id: "webdav-auto-sync-profile",
    name: "WebDAV Auto Sync Profile",
    baseUrl: "https://webdav-auto-sync-profile.example.invalid",
    apiKey: "sk-webdav-auto-sync-profile",
    createdAt: now,
    updatedAt: now,
  })

  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
    normalizeAccountStorageConfigForWrite(
      {
        ...createDefaultAccountStorageConfig(now),
        accounts: [syncedAccount],
        pinnedAccountIds: [syncedAccount.id],
        orderedAccountIds: [syncedAccount.id],
      } as AccountStorageConfig,
      now,
    ),
  )
  await seedApiCredentialProfiles(serviceWorker, [syncedProfile])
  await seedUserPreferences(serviceWorker, {
    currencyType: "CNY",
    actionClickBehavior: "sidepanel",
    webdav: {
      url: webdavFileUrl,
      username: "webdav-user",
      password: "webdav-password",
      autoSync: false,
      syncInterval: 3600,
      syncStrategy: WEBDAV_SYNC_STRATEGIES.UPLOAD_ONLY,
    },
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=dataBackup&anchor=${WEBDAV_AUTO_SYNC_TARGET_IDS.root}#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)

  await expect(
    page.locator(`#${WEBDAV_AUTO_SYNC_TARGET_IDS.root}`),
  ).toBeVisible()
  await page.locator(`#${WEBDAV_AUTO_SYNC_TARGET_IDS.enable} button`).click()
  await page.locator(`#${WEBDAV_AUTO_SYNC_TARGET_IDS.interval}`).fill("120")
  await page.locator(`#${WEBDAV_AUTO_SYNC_TARGET_IDS.saveSettings}`).click()
  await expect(
    page.getByText("WebDAV Auto Sync Update successful"),
  ).toBeVisible()

  await page.locator(`#${WEBDAV_AUTO_SYNC_TARGET_IDS.syncNow}`).click()
  await expect(
    page.locator("#_rht_toaster").getByText("Sync successful", { exact: true }),
  ).toBeVisible()

  await expect.poll(() => uploadedPayloads.length).toBe(1)
  expect(tempDeleteUrls).toEqual([])
  expect(uploadedPayloads[0]).toMatchObject({
    version: "2.0",
    accounts: {
      accounts: [
        expect.objectContaining({
          id: "webdav-auto-sync-account",
          site_name: "WebDAV Auto Sync Account",
        }),
      ],
    },
    apiCredentialProfiles: {
      profiles: [
        expect.objectContaining({
          id: "webdav-auto-sync-profile",
          name: "WebDAV Auto Sync Profile",
        }),
      ],
    },
    preferences: expect.objectContaining({
      currencyType: "CNY",
      actionClickBehavior: "sidepanel",
    }),
  })

  await expect(
    page
      .locator(`#${WEBDAV_AUTO_SYNC_TARGET_IDS.root}`)
      .getByText("Sync successful", { exact: true }),
  ).toBeVisible()
})
