import type { Locator, Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import type { AccountSiteType } from "~/constants/siteType"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  getKeyManagementTokenRowTestId,
  KEY_MANAGEMENT_TEST_IDS,
} from "~/features/KeyManagement/testIds"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  API_CREDENTIAL_PROFILES_CONFIG_VERSION,
  type ApiCredentialProfile,
} from "~/types/apiCredentialProfiles"
import { expect } from "~~/e2e/fixtures/extensionTest"
import { waitForExtensionPage } from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import {
  autoDetectAccountFromAddDialog,
  expectAccountListItemVisible,
  expectAccountListItemVisibleBySite,
  openAccountManagementPage,
  waitForSavedAccount,
  type AccountAddDialog,
} from "~~/e2e/utils/realSite/accountAdd"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

type AccountTokenIdentity = {
  id: string | number
  name: string
}

export type SavedApiCredentialProfileExpectation = Partial<
  Pick<ApiCredentialProfile, "name" | "baseUrl" | "apiKey" | "tagIds">
>

export type SavedAccountUiResult = {
  accountId?: string
  siteType: AccountSiteType
  baseUrl: string
}

async function readStoredApiCredentialProfiles(
  serviceWorker: ServiceWorker,
): Promise<ApiCredentialProfile[]> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.API_CREDENTIAL_PROFILES,
  )

  if (typeof raw !== "string") return []

  try {
    const parsed = JSON.parse(raw) as { profiles?: ApiCredentialProfile[] }
    return Array.isArray(parsed.profiles) ? parsed.profiles : []
  } catch {
    return []
  }
}

function matchesExpectedProfile(
  profile: ApiCredentialProfile,
  expectation: SavedApiCredentialProfileExpectation = {},
) {
  return (
    (expectation.name === undefined || profile.name === expectation.name) &&
    (expectation.baseUrl === undefined ||
      profile.baseUrl === expectation.baseUrl) &&
    (expectation.apiKey === undefined ||
      profile.apiKey === expectation.apiKey) &&
    (expectation.tagIds === undefined ||
      JSON.stringify(profile.tagIds) === JSON.stringify(expectation.tagIds))
  )
}

async function findSavedApiCredentialProfile(params: {
  serviceWorker: ServiceWorker
  existingProfileIds: Set<string>
  expectedProfile?: SavedApiCredentialProfileExpectation
}) {
  const profiles = await readStoredApiCredentialProfiles(params.serviceWorker)
  return (
    profiles.find(
      (profile) =>
        !params.existingProfileIds.has(profile.id) &&
        matchesExpectedProfile(profile, params.expectedProfile),
    ) ?? null
  )
}

export async function deleteApiCredentialProfileFromStorage(params: {
  serviceWorker: ServiceWorker
  profileId: string
}) {
  const profiles = await readStoredApiCredentialProfiles(params.serviceWorker)
  const filtered = profiles.filter((profile) => profile.id !== params.profileId)

  if (filtered.length === profiles.length) {
    return
  }

  await setPlasmoStorageValue(
    params.serviceWorker,
    STORAGE_KEYS.API_CREDENTIAL_PROFILES,
    {
      version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
      profiles: filtered,
      lastUpdated: Date.now(),
    },
  )
}

export async function saveAutoDetectedAccountFromApp(params: {
  page: Page
  extensionId: string
  serviceWorker?: ServiceWorker
  baseUrl: string
  siteType: AccountSiteType
  expectedSiteType?: AccountSiteType
  prepareDetectedDialog?: (dialog: AccountAddDialog) => Promise<void>
}): Promise<SavedAccountUiResult> {
  await openAccountManagementPage({
    page: params.page,
    extensionId: params.extensionId,
  })

  const dialog = await autoDetectAccountFromAddDialog(
    params.page,
    params.baseUrl,
  )

  if (params.expectedSiteType) {
    await expect(dialog.siteTypeTrigger).toHaveAttribute(
      "data-site-type",
      params.expectedSiteType,
      { timeout: 60_000 },
    )
  }

  await params.prepareDetectedDialog?.(dialog)

  await expect(dialog.confirmAddButton).toBeEnabled({ timeout: 60_000 })
  await dialog.confirmAddButton.click()
  await expect(dialog.dialog).toBeHidden({ timeout: 60_000 })

  await expectAccountListItemVisibleBySite(params.page, {
    siteType: params.siteType,
    baseUrl: params.baseUrl,
  })

  if (!params.serviceWorker) {
    return {
      siteType: params.siteType,
      baseUrl: params.baseUrl,
    }
  }

  const savedAccount = await waitForSavedAccount({
    serviceWorker: params.serviceWorker,
    siteType: params.siteType,
    baseUrl: params.baseUrl,
  })

  expect(savedAccount.site_type).toBe(params.siteType)
  expect(savedAccount.site_url).toBe(params.baseUrl)
  expect(String(savedAccount.account_info.id)).not.toBe("")
  expect(savedAccount.account_info.username.trim()).not.toBe("")

  await expectAccountListItemVisible(params.page, savedAccount.id)

  return {
    accountId: savedAccount.id,
    siteType: savedAccount.site_type,
    baseUrl: savedAccount.site_url,
  }
}

async function openKeyManagementPage(params: {
  page: Page
  extensionId: string
  accountId: string
}): Promise<Page> {
  const url = new URL(
    `chrome-extension://${params.extensionId}/${OPTIONS_PAGE_PATH}`,
  )
  url.searchParams.set("accountId", params.accountId)
  url.hash = MENU_ITEM_IDS.KEYS

  await params.page.goto(url.toString())
  await waitForExtensionRoot(params.page)
  await expectPermissionOnboardingHidden(params.page)
  return params.page
}

async function openKeyManagementPageFromAccountRow(params: {
  page: Page
  extensionId: string
  accountId?: string
  siteType?: AccountSiteType
  baseUrl?: string
}): Promise<Page> {
  const row =
    params.accountId !== undefined
      ? await expectAccountListItemVisible(params.page, params.accountId)
      : await expectAccountListItemVisibleBySite(params.page, {
          siteType: requireAccountSiteType(params.siteType),
          baseUrl: requireAccountBaseUrl(params.baseUrl),
        })

  await row.hover()
  const keyManagementPagePromise = waitForExtensionPage(params.page.context(), {
    extensionId: params.extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.KEYS}`,
  })
  await row
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
    .click()
  await params.page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowKeyManagementMenuItem)
    .click()

  const keyManagementPage = await keyManagementPagePromise
  await keyManagementPage.waitForLoadState("domcontentloaded")
  await waitForExtensionRoot(keyManagementPage)
  await expectPermissionOnboardingHidden(keyManagementPage)
  return keyManagementPage
}

async function submitCreateTokenForm(params: {
  page: Page
  tokenName: string
}) {
  await params.page.getByRole("button", { name: "Add API Key" }).click()
  await expect(params.page.locator("#tokenName")).toBeVisible({
    timeout: 30_000,
  })
  await params.page.locator("#tokenName").fill(params.tokenName)
  await params.page
    .getByTestId(TOKEN_PROVISIONING_TEST_IDS.addTokenSubmitButton)
    .click()
}

async function closeOneTimeKeyDialogIfPresent(page: Page) {
  const closeButton = page.getByTestId(
    TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton,
  )
  const isVisible = await closeButton
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false)

  if (!isVisible) {
    return false
  }

  await closeButton.click()
  await expect(closeButton).toBeHidden({ timeout: 30_000 })
  return true
}

async function closeAddTokenDialogIfPresent(page: Page) {
  const dialog = page.getByTestId(TOKEN_PROVISIONING_TEST_IDS.addTokenDialog)

  if (!(await dialog.isVisible().catch(() => false))) {
    return
  }

  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
}

async function closeTokenCreationDialogsIfPresent(page: Page) {
  const closedOneTimeKeyDialog = await closeOneTimeKeyDialogIfPresent(page)
  if (closedOneTimeKeyDialog) {
    await expect(
      page.getByTestId(TOKEN_PROVISIONING_TEST_IDS.addTokenDialog),
    ).toBeHidden({ timeout: 30_000 })
  }
  await closeAddTokenDialogIfPresent(page)
}

async function expectTokenVisibleInKeyManagementPage(params: {
  page: Page
  tokenName: string
}): Promise<Locator> {
  const heading = params.page.getByRole("heading", { name: params.tokenName })
  await expect(heading).toBeVisible({ timeout: 60_000 })
  return heading.locator("xpath=ancestor::*[@data-testid][1]")
}

export async function deleteTokenFromKeyManagementPage(params: {
  page: Page
  token: AccountTokenIdentity | string
}) {
  await closeTokenCreationDialogsIfPresent(params.page)

  const row =
    typeof params.token === "string"
      ? await expectTokenVisibleInKeyManagementPage({
          page: params.page,
          tokenName: params.token,
        })
      : params.page.getByTestId(getKeyManagementTokenRowTestId(params.token.id))
  await expect(row).toBeVisible({ timeout: 60_000 })

  await row.getByRole("button", { name: "Delete Key" }).click()
  await params.page
    .getByTestId(KEY_MANAGEMENT_TEST_IDS.deleteTokenConfirmButton)
    .click()
  await expect(row).toHaveCount(0, { timeout: 60_000 })
}

export async function openKeyManagementForAccount(params: {
  page: Page
  extensionId: string
  accountId?: string
  siteType?: AccountSiteType
  baseUrl?: string
  openFromAccountRow?: boolean
}): Promise<Page> {
  if (params.openFromAccountRow) {
    return await openKeyManagementPageFromAccountRow({
      page: params.page,
      extensionId: params.extensionId,
      accountId: params.accountId,
      siteType: params.siteType,
      baseUrl: params.baseUrl,
    })
  } else {
    if (!params.accountId) {
      throw new Error(
        "accountId is required when opening Key Management by URL.",
      )
    }

    return await openKeyManagementPage({
      page: params.page,
      extensionId: params.extensionId,
      accountId: params.accountId,
    })
  }
}

export async function submitTokenCreationFromKeyManagementPage(params: {
  page: Page
  tokenName: string
}) {
  await submitCreateTokenForm({
    page: params.page,
    tokenName: params.tokenName,
  })
}

export async function expectTokenCreatedInKeyManagementPage(params: {
  page: Page
  tokenName: string
}) {
  await closeTokenCreationDialogsIfPresent(params.page)
  const row = await expectTokenVisibleInKeyManagementPage({
    page: params.page,
    tokenName: params.tokenName,
  })

  return {
    page: params.page,
    row,
  }
}

export async function saveTokenToApiCredentialProfilesFromKeyManagementPage(params: {
  serviceWorker: ServiceWorker
  page: Page
  row: Locator
  expectedProfile?: SavedApiCredentialProfileExpectation
  openProfilesPage?: boolean
}): Promise<ApiCredentialProfile> {
  const existingProfileIds = new Set(
    (await readStoredApiCredentialProfiles(params.serviceWorker)).map(
      (profile) => profile.id,
    ),
  )

  await params.row
    .getByTestId(KEY_MANAGEMENT_TEST_IDS.saveToApiProfilesButton)
    .click()

  await expect
    .poll(async () => {
      return await findSavedApiCredentialProfile({
        serviceWorker: params.serviceWorker,
        existingProfileIds,
        expectedProfile: params.expectedProfile,
      })
    })
    .toMatchObject(params.expectedProfile ?? {})

  const savedProfile = await findSavedApiCredentialProfile({
    serviceWorker: params.serviceWorker,
    existingProfileIds,
    expectedProfile: params.expectedProfile,
  })

  if (!savedProfile) {
    throw new Error("Saving key to API profiles did not create a profile")
  }

  if (params.openProfilesPage !== false) {
    await params.page
      .getByTestId(TOKEN_PROVISIONING_TEST_IDS.openApiProfilesToastButton)
      .click()
    await expect(
      params.page.getByRole("heading", { name: savedProfile.name }),
    ).toBeVisible()
  }

  return savedProfile
}

function requireAccountSiteType(siteType: AccountSiteType | undefined) {
  if (!siteType) {
    throw new Error(
      "siteType is required when opening Key Management from row.",
    )
  }

  return siteType
}

function requireAccountBaseUrl(baseUrl: string | undefined) {
  if (!baseUrl) {
    throw new Error("baseUrl is required when opening Key Management from row.")
  }

  return baseUrl
}
