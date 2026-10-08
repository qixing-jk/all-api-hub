import type { AccountSiteType } from "~/constants/siteType"
import type {
  AccountKeyResourceOpenInput,
  ResourceFieldIssue,
  ResourceValidationResult,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES } from "~/services/apiAdapters/contracts/accountKeyResource"

import { unexpectedFailure, validationFailure } from "./operationErrors"

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const isBoundedNonBlankString = (
  value: unknown,
  maximum: number,
): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= maximum

const FIELD_ISSUE_CODES = new Set<string>(
  Object.values(ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES),
)

export const normalizeValidationResult = (
  value: unknown,
): ResourceValidationResult => {
  if (!isRecord(value)) throw unexpectedFailure()
  if (value.valid === true) return { valid: true }
  if (value.valid !== false || !Array.isArray(value.issues)) {
    throw unexpectedFailure()
  }

  const issues = value.issues.map((issue): ResourceFieldIssue => {
    if (
      !isRecord(issue) ||
      !isBoundedNonBlankString(issue.fieldId, 512) ||
      typeof issue.code !== "string" ||
      !FIELD_ISSUE_CODES.has(issue.code)
    ) {
      throw unexpectedFailure()
    }
    return Object.freeze({
      fieldId: issue.fieldId,
      code: issue.code as ResourceFieldIssue["code"],
    })
  })
  return { valid: false, issues: Object.freeze(issues) }
}

/** Rejects malformed public input before any site adapter operation runs. */
export function assertOpenInput(
  input: unknown,
  siteType: AccountSiteType,
): asserts input is AccountKeyResourceOpenInput {
  if (
    !isRecord(input) ||
    !isRecord(input.account) ||
    !isRecord(input.request) ||
    !isBoundedNonBlankString(input.account.id, 512) ||
    input.account.siteType !== siteType ||
    (input.account.name !== undefined &&
      !isBoundedNonBlankString(input.account.name, 512)) ||
    input.request.accountId !== input.account.id ||
    !isBoundedNonBlankString(input.request.baseUrl, 8192) ||
    !isRecord(input.request.auth)
  ) {
    throw validationFailure()
  }
}
