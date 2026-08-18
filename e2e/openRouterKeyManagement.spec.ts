import type { Locator, Page, Worker } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import { API_CREDENTIAL_PROFILES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { AuthTypeEnum } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
  normalizePlasmoStorageJsonValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import {
  installOpenRouterKeyManagementRoutes,
  OPENROUTER_KEY_MANAGEMENT_E2E,
} from "~~/e2e/utils/mockedSite/openRouterKeyManagementRoutes"

const CLIPBOARD_WRITES_KEY = "__aah_e2e_openrouter_key_clipboard_writes__"

async function installClipboardRecorder(page: Page) {
  await page.addInitScript((storageKey) => {
    window.sessionStorage.setItem(storageKey, JSON.stringify([]))

    const readWrites = (): string[] => {
      try {
        const raw = window.sessionStorage.getItem(storageKey)
        return raw ? (JSON.parse(raw) as string[]) : []
      } catch {
        return []
      }
    }

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          window.sessionStorage.setItem(
            storageKey,
            JSON.stringify([...readWrites(), text]),
          )
        },
      },
    })
  }, CLIPBOARD_WRITES_KEY)
}

async function readClipboardWriteCount(page: Page): Promise<number> {
  return await page.evaluate((storageKey) => {
    try {
      const raw = window.sessionStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as unknown[]).length : 0
    } catch {
      return 0
    }
  }, CLIPBOARD_WRITES_KEY)
}

async function hasSavedApiCredential(
  serviceWorker: Worker,
  expectedName: string,
): Promise<boolean> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
  )
  const parsed = normalizePlasmoStorageJsonValue<{
    profiles?: Array<{ name?: string; apiKey?: string }>
  }>(raw)
  return Boolean(
    parsed?.profiles?.some(
      (profile) =>
        profile.name?.includes(expectedName) === true &&
        typeof profile.apiKey === "string" &&
        profile.apiKey.length > 0,
    ),
  )
}

async function chooseOption(page: Page, trigger: Locator, optionText: string) {
  await trigger.click()
  const option = page.getByRole("option", { name: optionText, exact: true })
  await expect(option).toBeVisible()
  await option.click()
}

test("manages an OpenRouter key through its native one-time-secret lifecycle", async ({
  context,
  extensionId,
  page,
}) => {
  test.setTimeout(300_000)
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await installClipboardRecorder(page)
  await stubLlmMetadataIndex(context)
  const routeState = await installOpenRouterKeyManagementRoutes(context)
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: OPENROUTER_KEY_MANAGEMENT_E2E.accountId,
      site_name: "Example OpenRouter account",
      site_url: "https://openrouter.ai",
      site_type: SITE_TYPES.OPENROUTER,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        id: "user-example",
        username: "Example user",
        access_token: OPENROUTER_KEY_MANAGEMENT_E2E.managementKey,
      },
    }),
  ])

  const keysUrl =
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}` +
    `#${MENU_ITEM_IDS.KEYS}?accountId=${OPENROUTER_KEY_MANAGEMENT_E2E.accountId}` +
    `&workspace=${OPENROUTER_KEY_MANAGEMENT_E2E.teamWorkspaceSlug}`
  await page.goto(keysUrl)
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const workspaceSelect = page.getByTestId(
    KEY_MANAGEMENT_TEST_IDS.openRouterWorkspaceSelect,
  )
  await expect(workspaceSelect).toContainText("Team workspace (team)")
  await expect(
    page.getByText("Paged active key 1", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("Paged disabled key", { exact: true }),
  ).toBeVisible()
  await expect
    .poll(() =>
      routeState
        .getSafeRequests()
        .filter((request) => request.operation === "list-keys")
        .map((request) => request.offset),
    )
    .toEqual(expect.arrayContaining([0, 100]))

  await page.reload()
  await waitForExtensionRoot(page)
  await expect(page).toHaveURL((url) => {
    return (
      url.hash ===
      `#${MENU_ITEM_IDS.KEYS}?accountId=${OPENROUTER_KEY_MANAGEMENT_E2E.accountId}` +
        `&workspace=${OPENROUTER_KEY_MANAGEMENT_E2E.teamWorkspaceSlug}`
    )
  })
  await expect(workspaceSelect).toContainText("Team workspace (team)")

  await page.getByTestId(KEY_MANAGEMENT_TEST_IDS.addTokenButton).click()
  let editor = page.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeEditor)
  await expect(editor).toBeVisible()
  await editor.getByLabel("Key name").fill("Lifecycle key")
  await chooseOption(
    page,
    editor.getByLabel("Workspace"),
    "Team workspace team",
  )
  await chooseOption(
    page,
    editor.getByLabel("Creator"),
    "Unknown member member",
  )
  await chooseOption(page, editor.getByLabel("Spending limit"), "Limited")
  await editor.getByLabel("Limit", { exact: true }).fill("50")
  await chooseOption(page, editor.getByLabel("Reset cadence"), "Monthly")
  const selectedExpiry = "2026-12-31T12:30"
  await editor.getByLabel("Expires at").fill(selectedExpiry)
  await editor.getByText("Advanced", { exact: true }).click()
  const createByokSwitch = editor.getByRole("switch", {
    name: "Include BYOK usage",
  })
  await createByokSwitch.click()
  await expect(createByokSwitch).toBeChecked()
  const editorFooter = editor.getByTestId(
    KEY_MANAGEMENT_TEST_IDS.nativeEditorFooter,
  )
  await expect(editorFooter).toBeVisible()
  await expect(editorFooter).toBeInViewport()
  await editor
    .getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeEditorSubmitButton)
    .click()

  const secretInput = page.getByTestId(
    TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyInput,
  )
  await expect(secretInput).toBeVisible()
  await expect(secretInput).toHaveValue(/.+/)
  await expect
    .poll(() =>
      routeState.getSafeKeys().find((key) => key.name === "Lifecycle key"),
    )
    .toEqual({
      name: "Lifecycle key",
      disabled: false,
      limit: 50,
      limitReset: "monthly",
      includeByokInLimit: true,
      expiresAt: new Date(selectedExpiry).toISOString(),
      workspaceId: OPENROUTER_KEY_MANAGEMENT_E2E.teamWorkspaceId,
      creatorUserId: OPENROUTER_KEY_MANAGEMENT_E2E.memberUserId,
    })
  expect(routeState.getSafeRequests()).toContainEqual({
    operation: "create-key",
    authenticated: true,
    workspaceScope: OPENROUTER_KEY_MANAGEMENT_E2E.teamWorkspaceId,
  })
  await expect.poll(() => readClipboardWriteCount(page)).toBeGreaterThan(0)
  const autoCopyCount = await readClipboardWriteCount(page)
  await page
    .getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCopyButton)
    .click()
  await expect
    .poll(() => readClipboardWriteCount(page))
    .toBeGreaterThan(autoCopyCount)
  await page
    .getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton)
    .click()
  await expect
    .poll(() => hasSavedApiCredential(serviceWorker, "Lifecycle key"))
    .toBe(true)
  await page
    .getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton)
    .click()
  await expect(secretInput).toBeHidden()
  await expect.poll(routeState.getCreatedSecretIssueCount).toBe(1)

  let lifecycleRow = page
    .getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeKeyRow)
    .filter({ hasText: "Lifecycle key" })
  await expect(lifecycleRow).toBeVisible()
  const lifecycleSummary = lifecycleRow.getByTestId(
    KEY_MANAGEMENT_TEST_IDS.keyResourceSummaryFacts,
  )
  await expect(lifecycleSummary).toContainText("Team workspace")
  await expect(lifecycleSummary).toContainText("50")
  const recoveredCopyCount = await readClipboardWriteCount(page)
  await expect(
    lifecycleRow.getByRole("button", { name: "Copy Key" }),
  ).toBeVisible()
  await lifecycleRow.getByRole("button", { name: "Copy Key" }).click()
  await expect
    .poll(() => readClipboardWriteCount(page))
    .toBeGreaterThan(recoveredCopyCount)
  await lifecycleRow
    .getByRole("button", { name: "View details for Lifecycle key" })
    .click()
  await expect(lifecycleRow).toContainText("BYOK usage")
  await expect(lifecycleRow).toContainText("Include BYOK usage")
  await lifecycleRow.getByRole("button", { name: "Edit key" }).click()
  editor = page.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeEditor)
  await expect(editor).toBeVisible()
  await editor.getByLabel("Key name").fill("Lifecycle key edited")
  await editor.getByLabel("Limit", { exact: true }).fill("75")
  await chooseOption(page, editor.getByLabel("Reset cadence"), "Weekly")
  const editByokSwitch = editor.getByRole("switch", {
    name: "Include BYOK usage",
  })
  await editByokSwitch.click()
  await expect(editByokSwitch).not.toBeChecked()
  const disabledSwitch = editor.getByRole("switch", { name: "Disable key" })
  await disabledSwitch.click()
  await expect(disabledSwitch).toBeChecked()
  await editor
    .getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeEditorSubmitButton)
    .click()

  const statusFilter = page.getByTestId(
    KEY_MANAGEMENT_TEST_IDS.nativeStatusFilter,
  )
  await expect(statusFilter).toBeVisible()
  await chooseOption(page, statusFilter, "Disabled")
  lifecycleRow = page
    .getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeKeyRow)
    .filter({ hasText: "Lifecycle key edited" })
  await expect(lifecycleRow).toBeVisible()
  await expect(lifecycleRow).toContainText("Disabled")
  await expect
    .poll(() =>
      routeState
        .getSafeKeys()
        .some(
          (key) =>
            key.name === "Lifecycle key edited" &&
            key.disabled &&
            key.limit === 75 &&
            key.limitReset === "weekly" &&
            !key.includeByokInLimit,
        ),
    )
    .toBe(true)

  await lifecycleRow.getByRole("button", { name: "Delete key" }).click()
  await page
    .getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeDeleteConfirmButton)
    .click()
  await expect(lifecycleRow).toBeHidden()
  await expect
    .poll(() =>
      routeState
        .getSafeKeys()
        .some((key) => key.name === "Lifecycle key edited"),
    )
    .toBe(false)
  expect(
    routeState
      .getSafeRequests()
      .every((request) => request.authenticated === true),
  ).toBe(true)
  expect(
    routeState.getSafeRequests().map((request) => request.operation),
  ).toEqual(
    expect.arrayContaining([
      "default-workspace",
      "list-workspaces",
      "list-members",
      "list-keys",
      "create-key",
      "get-key",
      "update-key",
      "delete-key",
    ]),
  )
})
