import type { Page } from "@playwright/test"

import type { AccountSiteType } from "~/constants/siteType"
import {
  deleteTokenFromKeyManagementPage,
  expectTokenCreatedInKeyManagementPage,
  openKeyManagementForAccount,
  submitTokenCreationFromKeyManagementPage,
} from "~~/e2e/utils/accountLifecycle"

const REAL_SITE_TEST_TOKEN_NAME_PREFIX = "AAH E2E"
const MAX_TEST_TOKEN_NAME_LENGTH = 30
const MAX_TEST_TOKEN_LABEL_LENGTH = 8
const MAX_TEST_TOKEN_RUN_ID_LENGTH = 12
const REAL_SITE_TEST_RUN_ID_PATTERN = /^[a-z0-9]{10}$/u

export async function runRealSiteKeyLifecycleFromAccountRow(params: {
  page: Page
  extensionId: string
  siteType: AccountSiteType
  baseUrl: string
  label: string
}) {
  const tokenName = buildRealSiteTestTokenName({
    label: params.label,
    runId: buildRealSiteRunId(),
  })
  let createdTokenName: string | null = null
  let keyManagementPage = params.page

  try {
    keyManagementPage = await openKeyManagementForAccount({
      page: params.page,
      extensionId: params.extensionId,
      siteType: params.siteType,
      baseUrl: params.baseUrl,
      openFromAccountRow: true,
    })
    await submitTokenCreationFromKeyManagementPage({
      page: keyManagementPage,
      tokenName,
    })
    createdTokenName = tokenName

    const tokenResult = await expectTokenCreatedInKeyManagementPage({
      page: keyManagementPage,
      tokenName,
    })
    keyManagementPage = tokenResult.page
  } finally {
    if (createdTokenName) {
      await deleteTokenFromKeyManagementPage({
        page: keyManagementPage,
        token: createdTokenName,
      })
    }
  }
}

export function buildRealSiteTestTokenName(params: {
  label: string
  runId: string
}) {
  const label = truncateTokenNamePart(
    normalizeTokenNameLabel(params.label),
    MAX_TEST_TOKEN_LABEL_LENGTH,
  )
  const runId = truncateTokenNamePart(
    normalizeTokenNameRunId(params.runId),
    MAX_TEST_TOKEN_RUN_ID_LENGTH,
  )

  return [REAL_SITE_TEST_TOKEN_NAME_PREFIX, label, runId]
    .filter(Boolean)
    .join(" ")
    .slice(0, MAX_TEST_TOKEN_NAME_LENGTH)
}

export function isRealSiteTestTokenName(params: {
  tokenName: string
  label: string
}) {
  const label = truncateTokenNamePart(
    normalizeTokenNameLabel(params.label),
    MAX_TEST_TOKEN_LABEL_LENGTH,
  )
  const expectedPrefix = [REAL_SITE_TEST_TOKEN_NAME_PREFIX, label]
    .filter(Boolean)
    .join(" ")
  const runId = params.tokenName.slice(expectedPrefix.length + 1)

  return (
    params.tokenName.startsWith(`${expectedPrefix} `) &&
    REAL_SITE_TEST_RUN_ID_PATTERN.test(runId)
  )
}

export function buildRealSiteRunId() {
  return `${Date.now().toString(36).slice(-6)}${Math.random()
    .toString(36)
    .slice(2, 6)}`
}

function normalizeTokenNameLabel(value: string) {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .trim()
}

function normalizeTokenNameRunId(value: string) {
  return value
    .trim()
    .replace(/[:#]+/gu, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .trim()
}

function truncateTokenNamePart(value: string, maxLength: number) {
  return value.slice(0, maxLength).replace(/-+$/gu, "")
}
