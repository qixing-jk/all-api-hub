import { isAccountSiteType } from "~/constants/siteType"
import { buildAccountKeyResourceRuntimeKeyId } from "~/services/accounts/accountRuntimeKeys"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type {
  AccountKeyRepairDeleteInvalidResourcesRequest,
  AccountKeyRepairInvalidResource,
  AccountKeyRepairRecordManagedSiteImportResultsRequest,
} from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_ERRORS,
  ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES,
} from "~/types/accountKeyAutoProvisioning"

export const ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_RECEIPT_LIMIT = 500

const ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_REQUEST_ERROR =
  "invalid_managed_site_import_results_request"

const ACCOUNT_KEY_REPAIR_INVALID_RESOURCE_DELETE_LIMIT = 500

const managedSiteImportStatuses = new Set<string>(
  Object.values(ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES),
)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
) => Object.keys(value).every((key) => allowedKeys.includes(key))

const isControlledAccountKeyResourceRef = (
  value: unknown,
): value is AccountKeyRepairInvalidResource["ref"] =>
  isRecord(value) &&
  hasOnlyKeys(value, ["accountId", "siteType", "scopeKey", "resourceId"]) &&
  typeof value.accountId === "string" &&
  value.accountId.length > 0 &&
  isAccountSiteType(value.siteType) &&
  typeof value.scopeKey === "string" &&
  value.scopeKey.length > 0 &&
  typeof value.resourceId === "string" &&
  value.resourceId.length > 0

const isControlledManagedSiteImportRequest = (
  request: unknown,
): request is AccountKeyRepairRecordManagedSiteImportResultsRequest =>
  isRecord(request) &&
  hasOnlyKeys(request, ["jobId", "targetFingerprint", "items"]) &&
  typeof request.jobId === "string" &&
  typeof request.targetFingerprint === "string" &&
  /^[a-f0-9]{64}$/.test(request.targetFingerprint) &&
  Array.isArray(request.items) &&
  request.items.length > 0 &&
  request.items.length <=
    ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_RECEIPT_LIMIT &&
  request.items.every(
    (item) =>
      isRecord(item) &&
      hasOnlyKeys(item, ["resourceRef", "status"]) &&
      isControlledAccountKeyResourceRef(item.resourceRef) &&
      typeof item.status === "string" &&
      managedSiteImportStatuses.has(item.status),
  )

const isControlledInvalidResourceDeleteRequest = (
  request: unknown,
): request is AccountKeyRepairDeleteInvalidResourcesRequest => {
  if (
    !isRecord(request) ||
    !hasOnlyKeys(request, ["resources", "cleanupLinkedChannels"]) ||
    (request.cleanupLinkedChannels !== undefined &&
      typeof request.cleanupLinkedChannels !== "boolean") ||
    !Array.isArray(request.resources) ||
    request.resources.length === 0 ||
    request.resources.length > ACCOUNT_KEY_REPAIR_INVALID_RESOURCE_DELETE_LIMIT
  ) {
    return false
  }

  const seenRefs = new Set<string>()
  return request.resources.every((resource) => {
    if (
      !isRecord(resource) ||
      !hasOnlyKeys(resource, [
        "accountId",
        "accountName",
        "siteType",
        "siteUrlOrigin",
        "ref",
        "displayLabel",
        "groupLabel",
        "reason",
      ]) ||
      typeof resource.accountId !== "string" ||
      typeof resource.accountName !== "string" ||
      !isAccountSiteType(resource.siteType) ||
      typeof resource.siteUrlOrigin !== "string" ||
      !isControlledAccountKeyResourceRef(resource.ref) ||
      resource.ref.accountId !== resource.accountId ||
      resource.ref.siteType !== resource.siteType ||
      (resource.displayLabel !== undefined &&
        typeof resource.displayLabel !== "string") ||
      (resource.groupLabel !== undefined &&
        typeof resource.groupLabel !== "string") ||
      typeof resource.reason !== "string"
    ) {
      return false
    }
    const refId = buildAccountKeyResourceRuntimeKeyId(resource.ref)
    if (seenRefs.has(refId)) return false
    seenRefs.add(refId)
    return true
  })
}

/**
 * Rejects runtime payloads that contain fields outside the receipt protocol.
 * In particular, callers cannot supply `updatedAt`; the background owns receipt
 * ordering so untrusted messages cannot displace newer bounded receipts.
 */
export function assertControlledManagedSiteImportRequest(
  request: unknown,
): asserts request is AccountKeyRepairRecordManagedSiteImportResultsRequest {
  if (!isControlledManagedSiteImportRequest(request)) {
    throw new Error(ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_REQUEST_ERROR)
  }
}

const accountKeyResourceFailureCodes = new Set<string>(
  Object.values(ACCOUNT_KEY_RESOURCE_FAILURE_CODES),
)

export const getControlledAccountKeyResourceFailure = (
  error: unknown,
): ResourceFailure | undefined =>
  error instanceof AccountKeyResourceError ||
  (isRecord(error) &&
    isRecord(error.failure) &&
    typeof error.failure.code === "string" &&
    accountKeyResourceFailureCodes.has(error.failure.code))
    ? (error.failure as ResourceFailure)
    : undefined

/** Reject invalid deletion requests before reading or mutating repair state. */
export function assertInvalidResourceDeleteRequest(
  request: unknown,
): asserts request is AccountKeyRepairDeleteInvalidResourcesRequest {
  if (!isControlledInvalidResourceDeleteRequest(request))
    throw new Error(ACCOUNT_KEY_REPAIR_ERRORS.InvalidResourceDeleteRequest)
}
