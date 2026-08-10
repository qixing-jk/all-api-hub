import type { Locator, Page } from "@playwright/test"

import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import {
  getManagedSiteChannelRowActionsButtonTestId,
  getManagedSiteChannelRowEditActionTestId,
  getManagedSiteChannelRowSelectTestId,
  MANAGED_SITE_CHANNEL_ROW_TEST_ID_PREFIX,
  MANAGED_SITE_CHANNELS_REFRESH_STATE_ATTRIBUTE,
  MANAGED_SITE_CHANNELS_REFRESH_STATES,
  MANAGED_SITE_CHANNELS_TEST_IDS,
} from "~/features/ManagedSiteChannels/testIds"
import { expect } from "~~/e2e/fixtures/extensionTest"
import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import {
  deleteTokenFromKeyManagementPage,
  expectTokenCreatedInKeyManagementPage,
  openKeyManagementForAccount,
  submitTokenCreationFromKeyManagementPage,
} from "~~/e2e/utils/accountLifecycle"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

type ManagedSiteChannelScenarioContext<TSiteType extends ManagedSiteType> = {
  page: Page
  extensionId: string
  siteType: TSiteType
  label: string
  runPrefix: string
  cleanupPrefix?: string
  sourceAccount?: AccountFixture
  sourceAccountSkipReason?: string
  tokenName?: string
  tokenCleanupPrefix?: string
  beforeDeleteConfirm?: () => void | Promise<void>
}

const CRUD_MODEL = "gpt-4o-mini"
const CRUD_UPDATED_MODEL = "gpt-4.1-mini"

export function shouldEditModelsInManagedSiteCrudScenario(
  siteType: ManagedSiteType,
): boolean {
  return siteType !== SITE_TYPES.AXON_HUB && siteType !== SITE_TYPES.SUB2API
}

const channelsUrl = (extensionId: string, params?: Record<string, string>) => {
  const url = new URL(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value)
  }

  url.hash = MENU_ITEM_IDS.MANAGED_SITE_CHANNELS
  return url.toString()
}

async function expectManagedSiteChannelsIdle(page: Page) {
  const refreshButton = page.getByTestId(
    MANAGED_SITE_CHANNELS_TEST_IDS.refreshButton,
  )
  await expect(refreshButton).toHaveAttribute(
    MANAGED_SITE_CHANNELS_REFRESH_STATE_ATTRIBUTE,
    MANAGED_SITE_CHANNELS_REFRESH_STATES.Idle,
    { timeout: 60_000 },
  )
  return refreshButton
}

async function cleanupManagedSiteChannelsByPrefix<
  TSiteType extends ManagedSiteType,
>(params: {
  page: Page
  extensionId: string
  siteType: TSiteType
  prefix: string
}) {
  await params.page.goto(
    channelsUrl(params.extensionId, { search: params.prefix }),
  )
  await waitForExtensionRoot(params.page)
  await expectManagedSiteChannelsIdle(params.page)

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const row = channelRowByText(params.page, params.prefix).first()
    if ((await row.count()) === 0) {
      return
    }

    const rowText = await getChannelRowName(row)
    await deleteVisibleChannelByName(params.page, rowText)
    await params.page.goto(
      channelsUrl(params.extensionId, { search: params.prefix }),
    )
    await waitForExtensionRoot(params.page)
    await expectManagedSiteChannelsIdle(params.page)
  }

  throw new Error(
    `Could not clean all managed-site channels with prefix: ${params.prefix}`,
  )
}

export async function runManagedSiteChannelsCrudScenario<
  TSiteType extends ManagedSiteType,
>(context: ManagedSiteChannelScenarioContext<TSiteType>) {
  await cleanupManagedSiteChannelsByPrefix({
    page: context.page,
    extensionId: context.extensionId,
    siteType: context.siteType,
    prefix: context.cleanupPrefix ?? context.runPrefix,
  })

  const channelName = `${context.runPrefix} CRUD`
  const editedChannelName = `${channelName} edited`

  try {
    await context.page.goto(channelsUrl(context.extensionId))
    await waitForExtensionRoot(context.page)
    await expect(
      context.page.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton),
    ).toBeVisible({ timeout: 30_000 })

    await createManagedSiteChannelFromUi(context.page, {
      name: channelName,
      key: `sk-${slugify(context.runPrefix)}-crud`,
      baseUrl: "https://upstream.example.invalid/v1",
      model: shouldEditModelsInManagedSiteCrudScenario(context.siteType)
        ? CRUD_MODEL
        : undefined,
    })
    await expectManagedSiteChannelVisibleAfterRefresh({
      page: context.page,
      channelName,
    })

    await context.page
      .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput)
      .fill(channelName)
    await expect(channelRowByName(context.page, channelName)).toBeVisible({
      timeout: 30_000,
    })
    await expectPaginationSummary(context.page, "1", "1", "1")

    await openSingleVisibleChannelEditDialog(context.page, channelName)
    await context.page
      .getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)
      .fill(editedChannelName)
    if (shouldEditModelsInManagedSiteCrudScenario(context.siteType)) {
      await fillModelInput(context.page, CRUD_UPDATED_MODEL)
    }
    await submitChannelDialogAndWaitForClose(context.page)

    await expect(channelRowByName(context.page, editedChannelName)).toBeVisible(
      {
        timeout: 30_000,
      },
    )

    await context.page
      .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput)
      .fill(editedChannelName)
    await expect(channelRowByName(context.page, editedChannelName)).toBeVisible(
      {
        timeout: 30_000,
      },
    )
    await expect(channelRowByName(context.page, channelName)).toHaveCount(0)
    await expectPaginationSummary(context.page, "1", "1", "1")

    await deleteVisibleChannelByName(
      context.page,
      editedChannelName,
      context.beforeDeleteConfirm,
    )
  } finally {
    await cleanupManagedSiteChannelsByPrefix({
      page: context.page,
      extensionId: context.extensionId,
      siteType: context.siteType,
      prefix: context.cleanupPrefix ?? context.runPrefix,
    })
  }
}

export async function runManagedSiteTokenChannelStatusScenario<
  TSiteType extends ManagedSiteType,
>(context: ManagedSiteChannelScenarioContext<TSiteType>) {
  if (context.siteType === SITE_TYPES.VELOERA) {
    return {
      skipped: true,
      reason: `${context.label} does not support base URL channel lookup`,
    }
  }

  if (!context.sourceAccount || !context.tokenName) {
    return {
      skipped: true,
      reason:
        context.sourceAccountSkipReason ??
        "New API source account E2E env is missing",
    }
  }

  const channelName = `${context.runPrefix} status`
  let keyManagementPage = context.page
  let createdTokenName: string | null = null
  const tokenCleanupPrefix = context.tokenCleanupPrefix ?? context.tokenName
  const sub2ApiInventoryRequests: string[] = []
  const sub2ApiKeyExportRequests: string[] = []
  const observeSub2ApiInventoryRequest = (request: {
    method(): string
    url(): string
  }) => {
    const url = new URL(request.url())
    if (
      request.method() === "GET" &&
      url.pathname.endsWith("/api/v1/admin/accounts")
    ) {
      sub2ApiInventoryRequests.push(url.toString())
    }
    if (
      request.method() === "GET" &&
      url.pathname.endsWith("/api/v1/admin/accounts/data")
    ) {
      sub2ApiKeyExportRequests.push(url.toString())
    }
  }

  await cleanupManagedSiteChannelsByPrefix({
    page: context.page,
    extensionId: context.extensionId,
    siteType: context.siteType,
    prefix: context.cleanupPrefix ?? context.runPrefix,
  })

  try {
    if (context.siteType === SITE_TYPES.SUB2API) {
      context.page.context().on("request", observeSub2ApiInventoryRequest)
    }
    keyManagementPage = await openKeyManagementForAccount({
      page: context.page,
      extensionId: context.extensionId,
      accountId: context.sourceAccount.accountId,
      openFromAccountRow: false,
    })
    await cleanupKeyManagementTokensByPrefix({
      page: keyManagementPage,
      prefix: tokenCleanupPrefix,
    })

    await submitTokenCreationFromKeyManagementPage({
      page: keyManagementPage,
      tokenName: context.tokenName,
    })
    createdTokenName = context.tokenName

    const tokenResult = await expectTokenCreatedInKeyManagementPage({
      page: keyManagementPage,
      tokenName: context.tokenName,
    })
    let row = tokenResult.row

    await expect(
      row.getByTestId(KEY_MANAGEMENT_TEST_IDS.managedSiteStatusBadge),
    ).toBeVisible({ timeout: 30_000 })
    if (context.siteType === SITE_TYPES.SUB2API) {
      await expect
        .poll(() => sub2ApiInventoryRequests.length, { timeout: 30_000 })
        .toBeGreaterThan(0)
      for (const requestUrl of sub2ApiInventoryRequests) {
        expect(new URL(requestUrl).searchParams.get("search")).toBeNull()
      }
    }
    await openManagedSiteImportDialogFromTokenRow({
      page: keyManagementPage,
      row,
    })
    await keyManagementPage
      .getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)
      .fill(channelName)
    await submitChannelDialogAndWaitForClose(keyManagementPage)

    if (context.siteType === SITE_TYPES.SUB2API) {
      sub2ApiInventoryRequests.length = 0
      sub2ApiKeyExportRequests.length = 0
      keyManagementPage = await openKeyManagementForAccount({
        page: keyManagementPage,
        extensionId: context.extensionId,
        accountId: context.sourceAccount.accountId,
        openFromAccountRow: false,
      })
      row = (
        await expectTokenCreatedInKeyManagementPage({
          page: keyManagementPage,
          tokenName: context.tokenName,
        })
      ).row
      await expectManagedSiteImportStatusAfterChannelCreate(row)
      await expect
        .poll(() => sub2ApiInventoryRequests.length, { timeout: 30_000 })
        .toBeGreaterThan(0)
      await expect
        .poll(() => sub2ApiKeyExportRequests.length, { timeout: 30_000 })
        .toBeGreaterThan(0)
      context.page.context().off("request", observeSub2ApiInventoryRequest)
      for (const requestUrl of sub2ApiInventoryRequests) {
        expect(new URL(requestUrl).searchParams.get("search")).toBeNull()
      }
    } else {
      await expectManagedSiteImportStatusAfterChannelCreate(row)
    }
    await openManagedSiteChannelsAndExpectRow({
      page: keyManagementPage,
      extensionId: context.extensionId,
      channelName,
    })
    await expectPaginationSummary(keyManagementPage, "1", "1", "1")

    return { skipped: false as const }
  } finally {
    context.page.context().off("request", observeSub2ApiInventoryRequest)
    if (createdTokenName) {
      keyManagementPage = await openKeyManagementForAccount({
        page: keyManagementPage,
        extensionId: context.extensionId,
        accountId: context.sourceAccount.accountId,
        openFromAccountRow: false,
      })
      await deleteTokenFromKeyManagementPage({
        page: keyManagementPage,
        token: createdTokenName,
      })
    }
    await cleanupKeyManagementTokensByPrefix({
      page: keyManagementPage,
      prefix: tokenCleanupPrefix,
    })
    await cleanupManagedSiteChannelsByPrefix({
      page: keyManagementPage,
      extensionId: context.extensionId,
      siteType: context.siteType,
      prefix: context.cleanupPrefix ?? context.runPrefix,
    })
  }
}

async function openManagedSiteImportDialogFromTokenRow(params: {
  page: Page
  row: Locator
}) {
  await expect(async () => {
    const importToManagedSiteButton = params.row.getByTestId(
      KEY_MANAGEMENT_TEST_IDS.importToManagedSiteButton,
    )

    await expect(importToManagedSiteButton).toBeEnabled({ timeout: 20_000 })
    await importToManagedSiteButton.click()
    await expect(
      params.page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
    ).toBeVisible({ timeout: 30_000 })
  }).toPass({
    intervals: [1_000, 3_000, 5_000],
    timeout: 60_000,
  })
}

async function openManagedSiteChannelsAndExpectRow(params: {
  page: Page
  extensionId: string
  channelName: string
}) {
  await params.page.goto(
    channelsUrl(params.extensionId, { search: params.channelName }),
  )
  await waitForExtensionRoot(params.page)
  await expectManagedSiteChannelVisibleAfterRefresh({
    page: params.page,
    channelName: params.channelName,
  })
}

async function expectManagedSiteChannelVisibleAfterRefresh(params: {
  page: Page
  channelName: string
}) {
  await expect(async () => {
    const refreshButton = await expectManagedSiteChannelsIdle(params.page)
    const row = channelRowByName(params.page, params.channelName)
    if ((await row.count()) > 0) {
      await expect(row).toBeVisible({ timeout: 10_000 })
      return
    }

    await expect(refreshButton).toBeEnabled({ timeout: 10_000 })
    await refreshButton.click()
    await expect(refreshButton)
      .toHaveAttribute(
        MANAGED_SITE_CHANNELS_REFRESH_STATE_ATTRIBUTE,
        MANAGED_SITE_CHANNELS_REFRESH_STATES.Loading,
        { timeout: 5_000 },
      )
      .catch(() => undefined)
    await expectManagedSiteChannelsIdle(params.page)
    await expect(row).toBeVisible({ timeout: 20_000 })
  }).toPass({
    intervals: [1_000, 3_000, 5_000],
    timeout: 60_000,
  })
}

async function expectManagedSiteImportStatusAfterChannelCreate(row: Locator) {
  const channelLinkButton = row.getByTestId(
    KEY_MANAGEMENT_TEST_IDS.managedSiteChannelLinkButton,
  )
  const verificationRetryButton = row.getByTestId(
    KEY_MANAGEMENT_TEST_IDS.managedSiteVerificationRetryButton,
  )

  await expect(async () => {
    if (await channelLinkButton.isVisible()) {
      return
    }

    await expect(verificationRetryButton).toBeVisible({ timeout: 10_000 })
  }).toPass({
    intervals: [1_000, 3_000, 5_000],
    timeout: 30_000,
  })
}

async function cleanupKeyManagementTokensByPrefix(params: {
  page: Page
  prefix: string
}) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const tokenHeading = params.page
      .getByRole("heading")
      .filter({ hasText: params.prefix })
      .first()

    if ((await tokenHeading.count()) === 0) {
      return
    }

    const tokenName = await tokenHeading.textContent()
    if (!tokenName) {
      throw new Error(
        `Could not read key name while cleaning keys with prefix: ${params.prefix}`,
      )
    }

    await deleteTokenFromKeyManagementPage({
      page: params.page,
      token: tokenName,
    })
  }

  throw new Error(
    `Could not clean all key-management tokens with prefix: ${params.prefix}`,
  )
}

async function deleteVisibleChannelByName(
  page: Page,
  channelName: string,
  beforeConfirm?: () => void | Promise<void>,
) {
  const refreshButton = await expectManagedSiteChannelsIdle(page)
  const row = channelRowByName(page, channelName)
  await expect(row).toBeVisible({ timeout: 30_000 })
  const rowTestToken = await getChannelRowTestToken(row)
  await row
    .getByTestId(getManagedSiteChannelRowSelectTestId(rowTestToken))
    .click()
  await expect(
    page.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.deleteSelectedButton),
  ).toBeEnabled({ timeout: 30_000 })
  await page
    .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.deleteSelectedButton)
    .click()
  const confirmButton = page.getByTestId(
    MANAGED_SITE_CHANNELS_TEST_IDS.deleteChannelConfirmButton,
  )
  await expect(confirmButton).toBeVisible({ timeout: 10_000 })
  await expect(confirmButton).toBeEnabled({ timeout: 10_000 })
  await beforeConfirm?.()
  await confirmButton.click()
  await expect(async () => {
    expect(
      await refreshButton.getAttribute(
        MANAGED_SITE_CHANNELS_REFRESH_STATE_ATTRIBUTE,
      ),
    ).toBe(MANAGED_SITE_CHANNELS_REFRESH_STATES.Idle)
    expect(await row.count()).toBe(0)
  }).toPass({
    intervals: [500, 1_000, 3_000],
    timeout: 60_000,
  })
}

async function createManagedSiteChannelFromUi(
  page: Page,
  params: {
    name: string
    key: string
    baseUrl: string
    model?: string
  },
) {
  await page
    .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton)
    .click()
  await expect(
    page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
  ).toBeVisible({
    timeout: 30_000,
  })
  await page.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput).fill(params.name)
  await page.getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput).fill(params.key)
  await page
    .getByTestId(CHANNEL_DIALOG_TEST_IDS.baseUrlInput)
    .fill(params.baseUrl)
  if (params.model) {
    await fillModelInput(page, params.model)
  }
  await submitChannelDialogAndWaitForClose(page)
}

async function submitChannelDialogAndWaitForClose(page: Page) {
  const submitButton = page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton)

  await expect(submitButton).toBeEnabled({ timeout: 30_000 })
  await submitButton.click()
  await expect(submitButton)
    .toBeDisabled({ timeout: 5_000 })
    .catch(() => undefined)
  await expect(submitButton).not.toBeVisible({ timeout: 30_000 })
}

async function fillModelInput(page: Page, model: string) {
  await page.getByTestId(CHANNEL_DIALOG_TEST_IDS.modelsInput).fill(model)
  await page.getByTestId(CHANNEL_DIALOG_TEST_IDS.modelsInput).press("Enter")
  await expect(page.getByLabel(`Copy ${model}`, { exact: true })).toBeVisible({
    timeout: 30_000,
  })
}

async function openSingleVisibleChannelEditDialog(page: Page, rowText: string) {
  await expect(async () => {
    const row = channelRowByName(page, rowText)
    await expect(row).toBeVisible({ timeout: 10_000 })
    const rowTestToken = await getChannelRowTestToken(row)
    const actionsButton = row.getByTestId(
      getManagedSiteChannelRowActionsButtonTestId(rowTestToken),
    )
    await expect(actionsButton).toBeEnabled({ timeout: 10_000 })
    await actionsButton.click({ timeout: 10_000 })

    const editAction = page.getByTestId(
      getManagedSiteChannelRowEditActionTestId(rowTestToken),
    )
    await expect(editAction).toBeVisible({ timeout: 10_000 })
    await editAction.click({ timeout: 10_000 })
    await expect(
      page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
    ).toBeVisible({
      timeout: 10_000,
    })
  }).toPass({
    intervals: [1_000, 3_000, 5_000],
    timeout: 30_000,
  })
}

export function buildManagedSiteE2ePrefix(params: {
  label: string
  runId?: string
}) {
  return ["AAH E2E", params.label, params.runId].filter(Boolean).join(" ")
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

async function expectPaginationSummary(
  page: Page,
  start: string,
  end: string,
  total: string,
) {
  await expect(
    page.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.paginationSummary),
  ).toHaveAttribute("data-start", start, { timeout: 30_000 })
  await expect(
    page.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.paginationSummary),
  ).toHaveAttribute("data-end", end, { timeout: 30_000 })
  await expect(
    page.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.paginationSummary),
  ).toHaveAttribute("data-total", total, { timeout: 30_000 })
}

export function channelRowByName(page: Page, channelName: string) {
  return page
    .locator(`[data-testid^="${MANAGED_SITE_CHANNEL_ROW_TEST_ID_PREFIX}"]`)
    .filter({ has: page.getByText(channelName, { exact: true }) })
}

export async function getChannelRowTestToken(row: Locator) {
  const testId = await row.getAttribute("data-testid")
  if (!testId?.startsWith(MANAGED_SITE_CHANNEL_ROW_TEST_ID_PREFIX)) {
    throw new Error("Managed-site channel row is missing its stable test token")
  }
  return testId.slice(MANAGED_SITE_CHANNEL_ROW_TEST_ID_PREFIX.length)
}

async function getChannelRowName(row: ReturnType<typeof channelRowByText>) {
  const name = await row.getAttribute("data-channel-name")
  if (!name) {
    throw new Error("Managed-site channel row is missing data-channel-name")
  }
  return name
}

function channelRowByText(page: Page, text: string) {
  return page
    .locator(`[data-testid^="${MANAGED_SITE_CHANNEL_ROW_TEST_ID_PREFIX}"]`)
    .filter({ hasText: text })
}
