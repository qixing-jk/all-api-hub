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

type TokenCreationOutcome =
  | { status: "created" }
  | { status: "failed"; message: string }

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
      { timeout: 30_000 },
    )
  }

  await params.prepareDetectedDialog?.(dialog)

  await expect(dialog.confirmAddButton).toBeEnabled({ timeout: 30_000 })
  await dialog.confirmAddButton.click()
  await expect(dialog.dialog).toBeHidden({ timeout: 30_000 })

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
  await row
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
    .click()
  await params.page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowKeyManagementMenuItem)
    .click()

  await expect(params.page).toHaveURL((url) => {
    return (
      url.pathname === `/${OPTIONS_PAGE_PATH}` &&
      url.hash === `#${MENU_ITEM_IDS.KEYS}` &&
      (params.accountId === undefined ||
        url.searchParams.get("accountId") === params.accountId)
    )
  })
  await waitForExtensionRoot(params.page)
  await expectPermissionOnboardingHidden(params.page)
  return params.page
}

async function submitCreateTokenForm(params: {
  page: Page
  tokenName: string
}) {
  await params.page.getByRole("status").evaluateAll((elements) => {
    for (const element of elements) {
      element.setAttribute("data-aah-e2e-preexisting-status", "true")
    }
  })
  await params.page.getByRole("button", { name: "Add API Key" }).click()
  await expect(params.page.locator("#tokenName")).toBeVisible({
    timeout: 30_000,
  })
  await params.page.locator("#tokenName").fill(params.tokenName)
  await params.page
    .getByTestId(TOKEN_PROVISIONING_TEST_IDS.addTokenSubmitButton)
    .click()

  const outcomeHandle = await params.page.waitForFunction(
    ({
      addTokenDialogTestId,
      addTokenSubmitButtonTestId,
      oneTimeCloseTestId,
    }) => {
      const addTokenDialog = document.querySelector(
        `[data-testid="${addTokenDialogTestId}"]`,
      )
      const oneTimeCloseButton = document.querySelector(
        `[data-testid="${oneTimeCloseTestId}"]`,
      )

      if (!addTokenDialog || oneTimeCloseButton) {
        return { status: "created" } satisfies TokenCreationOutcome
      }

      const submitButton = document.querySelector(
        `[data-testid="${addTokenSubmitButtonTestId}"]`,
      )
      if (
        !(submitButton instanceof HTMLButtonElement) ||
        submitButton.disabled
      ) {
        return null
      }

      const visibleStatusMessages = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="status"]:not([data-aah-e2e-preexisting-status])',
        ),
      ).filter((element) => element.getClientRects().length > 0)
      const message = visibleStatusMessages.at(-1)?.textContent?.trim()

      return message
        ? ({ status: "failed", message } satisfies TokenCreationOutcome)
        : null
    },
    {
      addTokenDialogTestId: TOKEN_PROVISIONING_TEST_IDS.addTokenDialog,
      addTokenSubmitButtonTestId:
        TOKEN_PROVISIONING_TEST_IDS.addTokenSubmitButton,
      oneTimeCloseTestId: TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton,
    },
    { timeout: 30_000 },
  )
  const outcome = (await outcomeHandle.jsonValue()) as TokenCreationOutcome

  if (outcome.status === "failed") {
    throw new Error(`API key creation failed: ${outcome.message}`)
  }
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
  const heading = params.page.getByRole("heading", {
    name: params.tokenName,
    exact: true,
  })
  await expect(heading).toBeVisible({ timeout: 30_000 })
  return heading.locator("xpath=ancestor::*[@data-testid][1]")
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export async function deleteTokensByNamePrefixFromKeyManagementPage(params: {
  page: Page
  namePrefix: string
}) {
  const namePrefix = params.namePrefix.trim()
  if (!namePrefix) {
    throw new Error("A non-empty token name prefix is required for cleanup.")
  }

  await closeTokenCreationDialogsIfPresent(params.page)
  await expect(
    params.page.getByRole("button", { name: "Refresh Key List" }),
  ).toBeEnabled({ timeout: 30_000 })

  const ownedTokenHeadings = params.page.getByRole("heading", {
    name: new RegExp(`^${escapeRegExp(namePrefix)}(?:\\s|$)`),
  })

  while ((await ownedTokenHeadings.count()) > 0) {
    const row = ownedTokenHeadings
      .first()
      .locator("xpath=ancestor::*[@data-testid][1]")
    const rowTestId = await row.getAttribute("data-testid")
    if (!rowTestId) {
      throw new Error("Unable to identify an owned test token row for cleanup.")
    }

    await deleteTokenRowFromKeyManagementPage({
      page: params.page,
      row: params.page.getByTestId(rowTestId),
    })
  }
}

async function deleteTokenRowFromKeyManagementPage(params: {
  page: Page
  row: Locator
}) {
  await expect(params.row).toBeVisible({ timeout: 30_000 })
  await params.row.getByRole("button", { name: "Delete Key" }).click()
  await params.page
    .getByTestId(KEY_MANAGEMENT_TEST_IDS.deleteTokenConfirmButton)
    .click()
  await expect(params.row).toHaveCount(0, { timeout: 30_000 })
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
  await deleteTokenRowFromKeyManagementPage({
    page: params.page,
    row,
  })
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
