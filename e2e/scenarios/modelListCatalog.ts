import type { Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import { expect } from "~~/e2e/fixtures/extensionTest"
import { expectPermissionOnboardingHidden } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

type ModelListCatalogSourceTarget =
  | {
      accountId: string
      profileId?: never
    }
  | {
      accountId?: never
      profileId: string
    }

export type ModelListCatalogExpectations = {
  sourceLabel?: string
  modelNames?: string[]
  totalModels?: number
  allowEmptyCatalog?: boolean
}

function createModelListCatalogUrl(params: {
  extensionId: string
  source?: ModelListCatalogSourceTarget
}) {
  const url = new URL(
    `chrome-extension://${params.extensionId}/${OPTIONS_PAGE_PATH}`,
  )

  if (params.source?.accountId) {
    url.searchParams.set("accountId", params.source.accountId)
  }

  if (params.source?.profileId) {
    url.searchParams.set("profileId", params.source.profileId)
  }

  url.hash = MENU_ITEM_IDS.MODELS
  return url.toString()
}

async function openModelListCatalogPage(params: {
  page: Page
  extensionId: string
  source?: ModelListCatalogSourceTarget
}) {
  await params.page.goto(createModelListCatalogUrl(params))
  await waitForExtensionRoot(params.page)
  await expectPermissionOnboardingHidden(params.page)
  await expect(params.page.getByTestId(MODEL_LIST_TEST_IDS.page)).toBeVisible()
  await expect(
    params.page.getByRole("heading", { name: "Model List" }),
  ).toBeVisible()

  return params.page
}

async function expectModelListCatalog(params: {
  page: Page
  expectations?: ModelListCatalogExpectations
}) {
  const { page, expectations } = params

  await expect(page.getByTestId(MODEL_LIST_TEST_IDS.controlPanel)).toBeVisible({
    timeout: 60_000,
  })
  if (!expectations?.allowEmptyCatalog) {
    await expect(
      page.getByTestId(MODEL_LIST_TEST_IDS.modelDisplay),
    ).toBeVisible()
  }

  if (expectations?.sourceLabel) {
    await expect(page.getByRole("combobox").first()).toContainText(
      expectations.sourceLabel,
    )
  }

  for (const modelName of expectations?.modelNames ?? []) {
    await expect(page.getByText(modelName)).toBeVisible()
  }

  if (typeof expectations?.totalModels === "number") {
    const modelCountPattern = new RegExp(`${expectations.totalModels} models?`)

    await expect(
      page.getByText(new RegExp(`Total ${modelCountPattern.source}`)),
    ).toBeVisible()
    await expect(
      page.getByText(new RegExp(`Showing ${modelCountPattern.source}`)),
    ).toBeVisible()
  }
}

export async function runModelListCatalogScenario(params: {
  page: Page
  extensionId: string
  source?: ModelListCatalogSourceTarget
  expectations?: ModelListCatalogExpectations
}) {
  const page = await openModelListCatalogPage(params)
  await expectModelListCatalog({
    page,
    expectations: params.expectations,
  })
  return page
}

export async function verifyAccountModelCatalog(params: {
  page: Page
  extensionId: string
  accountId: string
  expectations?: ModelListCatalogExpectations
}) {
  return runModelListCatalogScenario({
    page: params.page,
    extensionId: params.extensionId,
    source: { accountId: params.accountId },
    expectations: params.expectations,
  })
}
