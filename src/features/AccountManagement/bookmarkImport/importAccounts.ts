import { isAccountSiteType, SITE_TYPES } from "~/constants/siteType"
import { createEmptyAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import {
  autoDetectAccount as defaultAutoDetectAccount,
  validateAndSaveAccount as defaultValidateAndSaveAccount,
} from "~/services/accounts/accountOperations"
import { AuthTypeEnum, type CheckInConfig } from "~/types"
import type {
  AccountSaveResponse,
  AccountValidationResponse,
} from "~/types/serviceResponse"

import type {
  BookmarkAccountImportCandidate,
  BookmarkAccountImportFailureCategory,
  BookmarkAccountImportProgress,
  BookmarkAccountImportRowResult,
  BookmarkAccountImportRunResult,
} from "./types"

interface RunBookmarkAccountImportInput {
  candidates: BookmarkAccountImportCandidate[]
  autoDetectAccount?: (
    url: string,
    authType: AuthTypeEnum,
  ) => Promise<AccountValidationResponse>
  validateAndSaveAccount?: typeof defaultValidateAndSaveAccount
  onProgress?: (progress: BookmarkAccountImportProgress) => void
}

/**
 * Falls back to the generic account-site bucket for unknown detection output.
 */
function resolveSiteType(value: unknown) {
  return isAccountSiteType(value) ? value : SITE_TYPES.UNKNOWN
}

/**
 * Defaults bookmark imports to access-token auth when detection omits a mode.
 */
function resolveAuthType(value: unknown) {
  return Object.values(AuthTypeEnum).includes(value as AuthTypeEnum)
    ? (value as AuthTypeEnum)
    : AuthTypeEnum.AccessToken
}

/**
 * Preserves detected check-in config or supplies the account-dialog default.
 */
function resolveCheckIn(value: unknown): CheckInConfig {
  if (value && typeof value === "object") {
    return value as CheckInConfig
  }

  return createEmptyAccountDialogDraft().checkIn
}

/**
 * Creates a result row that exposes only local, safe failure message keys.
 */
function createFailureRow(
  candidate: BookmarkAccountImportCandidate,
  failureCategory: BookmarkAccountImportFailureCategory,
): BookmarkAccountImportRowResult {
  return {
    candidateId: candidate.id,
    url: candidate.url,
    status: "failed",
    failureCategory,
    safeMessageKey: `ui:dialog.bookmarkAccountImport.failures.${failureCategory}`,
  }
}

/**
 * Imports bookmark candidates one at a time through detection and deferred save.
 */
export async function runBookmarkAccountImport({
  candidates,
  autoDetectAccount = defaultAutoDetectAccount,
  validateAndSaveAccount = defaultValidateAndSaveAccount,
  onProgress,
}: RunBookmarkAccountImportInput): Promise<BookmarkAccountImportRunResult> {
  const rows: BookmarkAccountImportRowResult[] = []
  let completedCount = 0

  for (const candidate of candidates) {
    try {
      const detection = await autoDetectAccount(
        candidate.url,
        AuthTypeEnum.AccessToken,
      )

      if (!detection.success || !detection.data) {
        rows.push(createFailureRow(candidate, "detection"))
        continue
      }

      const data = detection.data
      const siteType = resolveSiteType(data.siteType)
      const authType = resolveAuthType(data.authType)
      const saveResult: AccountSaveResponse = await validateAndSaveAccount(
        candidate.url,
        data.siteName.trim(),
        data.username.trim(),
        data.accessToken.trim(),
        data.userId.trim(),
        data.exchangeRate === null || data.exchangeRate === undefined
          ? ""
          : String(data.exchangeRate),
        "",
        [],
        resolveCheckIn(data.checkIn),
        siteType,
        authType,
        "",
        "",
        false,
        false,
        data.sub2apiAuth,
        {
          deferDataRefresh: true,
        },
      )

      if (!saveResult.success) {
        rows.push(createFailureRow(candidate, "save"))
        continue
      }

      rows.push({
        candidateId: candidate.id,
        url: candidate.url,
        status: "success",
        accountId:
          typeof saveResult.accountId === "string" &&
          saveResult.accountId.trim()
            ? saveResult.accountId.trim()
            : null,
        failureCategory: undefined,
      })
    } catch {
      rows.push(createFailureRow(candidate, "unknown"))
    } finally {
      completedCount += 1
      onProgress?.({
        completedCount,
        totalCount: candidates.length,
        currentCandidateId: candidate.id,
      })
    }
  }

  const successCount = rows.filter((row) => row.status === "success").length
  const failureCount = rows.filter((row) => row.status === "failed").length

  return {
    rows,
    successCount,
    failureCount,
    skippedCount: 0,
  }
}
