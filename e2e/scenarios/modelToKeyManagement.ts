import type { Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { KEY_MANAGEMENT_TOKEN_ROW_TEST_ID_PREFIX } from "~/features/KeyManagement/testIds"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import { expect } from "~~/e2e/fixtures/extensionTest"
import {
  runModelListCatalogScenario,
  type ModelListCatalogExpectations,
} from "~~/e2e/scenarios/modelListCatalog"
import { deleteTokenFromKeyManagementPage } from "~~/e2e/utils/accountLifecycle"
import { waitForExtensionPage } from "~~/e2e/utils/commonUserFlows"
import { expectPermissionOnboardingHidden } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

type ModelToKeyManagementScenarioParams = {
  page: Page
  extensionId: string
  accountId: string
  modelId?: string
  createdKeyName?: string
  catalogExpectations?: ModelListCatalogExpectations
  expectedModelDialogLabels?: string[]
  expectedAddKeyDialogLabels?: string[]
  expectedKeyManagementLabels?: string[]
  prepareKeyManagementPage?: (page: Page) => Promise<void>
  cleanupCreatedKey?: boolean
}

type CreatedKeyManagementToken = {
  id: string
  name: string
}

const COMPATIBLE_KEY_SELECT_PLACEHOLDER = "Select a key"

async function resolveCreatedCompatibleKeyLabel(params: {
  keyDialog: ReturnType<Page["getByTestId"]>
  fallbackName: string
}) {
  const selectedKeyName = await params.keyDialog
    .getByRole("combobox", { name: "Compatible key" })
    .innerText({ timeout: 10_000 })
    .then((text) => text.trim())
    .catch(() => "")

  if (
    !selectedKeyName ||
    selectedKeyName === COMPATIBLE_KEY_SELECT_PLACEHOLDER
  ) {
    return params.fallbackName
  }

  return selectedKeyName
}

async function expectCreatedKeyManagementToken(params: {
  page: Page
  fallbackName: string
}) {
  const createdKeyManagementResult =
    await resolveCreatedKeyManagementToken(params)
  await expect(createdKeyManagementResult.row).toBeVisible()
  return createdKeyManagementResult
}

async function resolveCreatedKeyManagementToken(params: {
  page: Page
  fallbackName: string
}) {
  const tokenRows = params.page
    .locator(`[data-testid^="${KEY_MANAGEMENT_TOKEN_ROW_TEST_ID_PREFIX}"]`)
    .filter({
      has: params.page.getByRole("heading", {
        name: params.fallbackName,
        exact: true,
      }),
    })

  await expect(tokenRows).toHaveCount(1, { timeout: 60_000 })

  const row = tokenRows.first()
  const testId = await row.getAttribute("data-testid")
  const id = testId?.startsWith(KEY_MANAGEMENT_TOKEN_ROW_TEST_ID_PREFIX)
    ? testId.slice(KEY_MANAGEMENT_TOKEN_ROW_TEST_ID_PREFIX.length)
    : ""

  if (!id) {
    throw new Error("Model-to-key scenario could not resolve created key id")
  }

  const name = await row
    .locator("h1,h2,h3,h4,h5,h6")
    .first()
    .innerText({ timeout: 5_000 })
    .then((text) => text.trim())
    .catch(() => "")

  return {
    row,
    token: {
      id,
      name: name || params.fallbackName,
    },
  }
}

async function resolveCreatedKeyManagementTokenForCleanup(params: {
  page: Page
  fallbackName: string
}) {
  return resolveCreatedKeyManagementToken(params)
    .then((result) => result.token)
    .catch(() => null)
}

export async function runModelToKeyManagementScenario(
  params: ModelToKeyManagementScenarioParams,
) {
  let createdKeyManagementToken: CreatedKeyManagementToken | null = null
  let cleanupTokenResolutionError: Error | null = null
  const page = await runModelListCatalogScenario({
    page: params.page,
    extensionId: params.extensionId,
    source: { accountId: params.accountId },
    expectations: params.catalogExpectations,
  })

  await page
    .getByTestId(MODEL_LIST_TEST_IDS.modelKeyDialogButton)
    .first()
    .click()

  const keyDialog = page.getByTestId(MODEL_LIST_TEST_IDS.modelKeyDialog)
  if (params.modelId) {
    await expect(
      keyDialog.getByText(`No compatible keys for ${params.modelId}`),
    ).toBeVisible()
  }

  for (const label of params.expectedModelDialogLabels ?? []) {
    await expect(keyDialog.getByText(label)).toBeVisible()
  }

  await keyDialog.getByTestId(MODEL_LIST_TEST_IDS.createCustomKeyButton).click()

  const addKeyDialog = page.getByTestId(
    TOKEN_PROVISIONING_TEST_IDS.addTokenDialog,
  )
  const tokenNameInput = addKeyDialog.locator("#tokenName")
  const defaultCreatedKeyName = await tokenNameInput.inputValue()
  const createdKeyName = params.createdKeyName ?? defaultCreatedKeyName
  const modelId =
    params.modelId ?? defaultCreatedKeyName.replace(/^model\s+/, "")

  if (!modelId) {
    throw new Error("Model-to-key scenario could not infer a model id")
  }

  if (createdKeyName !== defaultCreatedKeyName) {
    await tokenNameInput.fill(createdKeyName)
  }

  await expect(addKeyDialog.locator("#tokenName")).toHaveValue(createdKeyName)

  for (const label of params.expectedAddKeyDialogLabels ?? []) {
    await expect(addKeyDialog.getByText(label)).toBeVisible()
  }

  await addKeyDialog
    .getByTestId(TOKEN_PROVISIONING_TEST_IDS.addTokenSubmitButton)
    .click()

  await expect(addKeyDialog).toHaveCount(0)
  const createdCompatibleKeyLabel = await resolveCreatedCompatibleKeyLabel({
    keyDialog,
    fallbackName: createdKeyName,
  })
  await expect(
    keyDialog.getByText(`No compatible keys for ${modelId}`),
  ).toHaveCount(0)
  if (createdCompatibleKeyLabel !== createdKeyName) {
    await expect(keyDialog.getByText(createdCompatibleKeyLabel)).toBeVisible()
  }

  const keysPagePromise = waitForExtensionPage(page.context(), {
    extensionId: params.extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.KEYS}`,
    searchParams: { accountId: params.accountId },
    reuseExistingPage: false,
  })

  await keyDialog
    .getByTestId(MODEL_LIST_TEST_IDS.openKeyManagementButton)
    .click()

  const keysPage = await keysPagePromise

  try {
    await params.prepareKeyManagementPage?.(keysPage)
    await waitForExtensionRoot(keysPage)
    await expectPermissionOnboardingHidden(keysPage)

    const createdKeyManagementResult = await expectCreatedKeyManagementToken({
      page: keysPage,
      fallbackName: createdKeyName,
    })
    createdKeyManagementToken = createdKeyManagementResult.token

    const targetUrl = new URL(keysPage.url())
    expect(targetUrl.hash).toBe(`#${MENU_ITEM_IDS.KEYS}`)
    expect(targetUrl.searchParams.get("accountId")).toBe(params.accountId)

    await expect(
      createdKeyManagementResult.row.getByText("Group:"),
    ).toBeVisible()

    for (const label of params.expectedKeyManagementLabels ?? []) {
      await expect(
        createdKeyManagementResult.row.getByText(label, { exact: true }),
      ).toBeVisible()
    }
  } finally {
    if (params.cleanupCreatedKey) {
      createdKeyManagementToken ??=
        await resolveCreatedKeyManagementTokenForCleanup({
          page: keysPage,
          fallbackName: createdKeyName,
        })

      if (!createdKeyManagementToken) {
        cleanupTokenResolutionError = new Error(
          "Model-to-key scenario could not resolve the created Key Management token row for cleanup",
        )
      } else {
        await deleteTokenFromKeyManagementPage({
          page: keysPage,
          token: createdKeyManagementToken,
        })
      }
    }
  }

  if (cleanupTokenResolutionError) {
    throw cleanupTokenResolutionError
  }

  return keysPage
}
