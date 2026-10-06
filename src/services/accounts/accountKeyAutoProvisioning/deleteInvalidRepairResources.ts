import { buildAccountKeyResourceLinkedCleanupInput } from "~/services/accounts/accountKeyResourceCleanup"
import { buildAccountKeyResourceRuntimeKeyId } from "~/services/accounts/accountRuntimeKeys"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  type AccountKeyResourceSession,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import { deleteWithLinkedChannelCleanup } from "~/services/managedSites/linkedChannelCleanup"
import type {
  AccountKeyRepairDeleteInvalidResourcesRequest,
  AccountKeyRepairDeleteInvalidResourcesResult,
  AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES } from "~/types/accountKeyAutoProvisioning"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

import { getControlledAccountKeyResourceFailure } from "./repairRequestValidation"

const INVALID_RESOURCE_DELETE_OPERATION_TIMEOUT_MS = 30_000

const mapInvalidDeleteFailure = (error: unknown): ResourceFailure =>
  error instanceof DOMException && error.name === "TimeoutError"
    ? {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        message: error.message,
      }
    : getControlledAccountKeyResourceFailure(error) ?? {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
        ...(error instanceof Error && error.message
          ? { message: error.message }
          : {}),
      }

/** Execute validated deletion requests against the captured invalid-resource projection. */
export async function deleteInvalidRepairResources(
  request: AccountKeyRepairDeleteInvalidResourcesRequest,
  progress: AccountKeyRepairProgress,
): Promise<AccountKeyRepairDeleteInvalidResourcesResult> {
  const currentInvalidByRef = new Map(
    progress.results.flatMap((accountResult) =>
      accountResult.invalidResources.map(
        (resource) =>
          [
            buildAccountKeyResourceRuntimeKeyId(resource.ref),
            resource,
          ] as const,
      ),
    ),
  )
  const allAccounts = await accountQueries.getAllAccounts()
  const accountById = new Map(
    allAccounts.map((account) => [account.id, account] as const),
  )
  const sessionByAccountId = new Map<string, AccountKeyResourceSession>()
  const results: AccountKeyRepairDeleteInvalidResourcesResult["results"] = []

  for (const requestedResource of request.resources) {
    const resource =
      currentInvalidByRef.get(
        buildAccountKeyResourceRuntimeKeyId(requestedResource.ref),
      ) ?? requestedResource
    const account = accountById.get(resource.accountId)
    const accountCapabilities = account
      ? getSiteTypeCapabilities(account.site_type).account
      : undefined
    if (
      !account ||
      account.site_type !== resource.siteType ||
      normalizeUrlForOriginKey(account.site_url, {
        lowerCase: true,
        stripTrailingSlashes: false,
      }) !== resource.siteUrlOrigin ||
      !currentInvalidByRef.has(
        buildAccountKeyResourceRuntimeKeyId(resource.ref),
      ) ||
      !accountCapabilities?.keyResourceManagement
    ) {
      results.push({
        resource,
        outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Rejected,
        failure: {
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
        },
        finishedAt: Date.now(),
      })
      continue
    }

    try {
      const { request: apiRequest } =
        createAccountApiRequestFromStoredAccount(account)
      let session = sessionByAccountId.get(account.id)
      if (!session) {
        session = await runAbortableTask(
          (signal) =>
            accountCapabilities.keyResourceManagement!.open(
              {
                account: {
                  id: account.id,
                  name: resource.accountName,
                  siteType: account.site_type,
                },
                request: apiRequest,
              },
              signal ? { signal } : undefined,
            ),
          { timeoutMs: INVALID_RESOURCE_DELETE_OPERATION_TIMEOUT_MS },
        )
        sessionByAccountId.set(account.id, session)
      }
      const collection = await runAbortableTask(
        (signal) =>
          session.openCollection(
            resource.ref.scopeKey,
            signal ? { signal } : undefined,
          ),
        { timeoutMs: INVALID_RESOURCE_DELETE_OPERATION_TIMEOUT_MS },
      )
      let cleanupInput: Parameters<typeof deleteWithLinkedChannelCleanup>[0] =
        null
      if (request.cleanupLinkedChannels) {
        const facts = await runAbortableTask(
          (signal) =>
            collection.get(resource.ref, signal ? { signal } : undefined),
          { timeoutMs: INVALID_RESOURCE_DELETE_OPERATION_TIMEOUT_MS },
        )
        cleanupInput = await buildAccountKeyResourceLinkedCleanupInput({
          account: {
            id: account.id,
            siteType: account.site_type,
            baseUrl: account.site_url,
          },
          ref: resource.ref,
          runtimeKeyBaseUrl: facts.runtimeKey?.baseUrl,
          resolveProvider: () =>
            runAbortableTask(
              (signal) =>
                session.runtimeKey?.resolve(resource.ref, { signal }) ??
                Promise.resolve(undefined),
              { timeoutMs: INVALID_RESOURCE_DELETE_OPERATION_TIMEOUT_MS },
            ),
        })
      }
      await deleteWithLinkedChannelCleanup(cleanupInput, async () => {
        await runAbortableTask(
          (signal) =>
            collection.delete(resource.ref, signal ? { signal } : undefined),
          { timeoutMs: INVALID_RESOURCE_DELETE_OPERATION_TIMEOUT_MS },
        )
      })
      results.push({
        resource,
        outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied,
        finishedAt: Date.now(),
      })
    } catch (error) {
      const failure = mapInvalidDeleteFailure(error)
      results.push(
        failure.code ===
          ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain
          ? {
              resource,
              outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Uncertain,
              failure,
              finishedAt: Date.now(),
            }
          : {
              resource,
              outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Rejected,
              failure,
              finishedAt: Date.now(),
            },
      )
    }
  }

  return { results }
}
