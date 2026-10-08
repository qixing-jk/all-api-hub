import type { AccountSiteType } from "~/constants/siteType"
import type {
  AccountKeyResourceCollection,
  AccountKeyResourceFacts,
  AccountKeyResourceRef,
  AccountKeyScope,
  ResourceFailure,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  assertNativeResourceFacts,
  createNativeResourceRefBoundary,
  isNativeResourceBoundaryError,
  resolveNativeResourceMutation,
} from "~/services/apiAdapters/nativeResources/factory"

import type { AccountKeyResourceDefinition } from "./definition"
import { createAccountKeyResourceEditor } from "./editor"
import {
  mapOperation,
  unexpectedFailure,
  validationFailure,
} from "./operationErrors"
import { isAccountKeyResourceRefFor } from "./ref"
import { cloneScope } from "./scopeInventory"

/** Correlates all collection reads and mutations with one frozen account/site/scope identity. */
export function createAccountKeyResourceCollection<
  TConfig,
  TLocator,
  TListItem,
  TDetail,
  TUpdateCommand,
  TFailure,
>({
  definition,
  config,
  accountId,
  siteType,
  resolvedScope,
  mapFailure,
}: {
  definition: Pick<
    AccountKeyResourceDefinition<
      TConfig,
      TLocator,
      TListItem,
      TDetail,
      never,
      TUpdateCommand,
      TFailure
    >,
    | "encodeLocator"
    | "decodeLocator"
    | "locatorFromListItem"
    | "locatorFromDetail"
    | "list"
    | "get"
    | "toListFacts"
    | "toDetailFacts"
    | "editEditor"
    | "update"
    | "delete"
  >
  config: TConfig
  accountId: string
  siteType: AccountSiteType
  resolvedScope: AccountKeyScope
  mapFailure: (error: unknown) => ResourceFailure
}): AccountKeyResourceCollection {
  const canonicalScopeKey = resolvedScope.scopeKey
  const canonicalRouteKey = resolvedScope.routeKey
  const providerScope = cloneScope({
    ...resolvedScope,
    scopeKey: canonicalScopeKey,
    routeKey: canonicalRouteKey,
  })
  const publicScope = cloneScope({
    ...resolvedScope,
    scopeKey: canonicalScopeKey,
    routeKey: canonicalRouteKey,
  })
  const refBoundary = createNativeResourceRefBoundary<
    AccountKeyResourceRef,
    TLocator
  >({
    scopeKey: canonicalScopeKey,
    encodeLocator: definition.encodeLocator,
    decodeLocator: definition.decodeLocator,
    buildRef: (resourceId) =>
      Object.freeze({
        accountId,
        siteType,
        scopeKey: canonicalScopeKey,
        resourceId,
      }),
    matchesRef: (value): value is AccountKeyResourceRef =>
      isAccountKeyResourceRefFor(value, {
        accountId,
        siteType,
        scopeKey: canonicalScopeKey,
      }),
  })
  const createRef = (locator: TLocator) => {
    try {
      return refBoundary.createRef(locator)
    } catch (error) {
      if (isNativeResourceBoundaryError(error)) throw unexpectedFailure()
      throw error
    }
  }
  const decodeRef = (ref: unknown) => {
    try {
      return refBoundary.decodeRef(ref)
    } catch (error) {
      if (isNativeResourceBoundaryError(error)) throw validationFailure()
      throw error
    }
  }
  const projectFacts = (
    facts: AccountKeyResourceFacts,
    ref: AccountKeyResourceRef,
  ) => {
    try {
      return assertNativeResourceFacts(facts, ref, refBoundary.refsMatch)
    } catch (error) {
      if (isNativeResourceBoundaryError(error)) throw unexpectedFailure()
      throw error
    }
  }
  const readDetail = async (
    ref: unknown,
    readOptions?: ResourceOperationOptions,
  ) => {
    const decoded = decodeRef(ref)
    const detail = await definition.get(
      config,
      providerScope,
      decoded.locator,
      readOptions,
    )
    const actualRef = createRef(definition.locatorFromDetail(detail))
    if (!refBoundary.refsMatch(actualRef, decoded.ref)) {
      throw unexpectedFailure()
    }
    return { detail, ref: decoded.ref }
  }
  return {
    scope: publicScope,
    list: (query, listOptions) =>
      mapOperation(async () => {
        const page = await definition.list(
          config,
          providerScope,
          query,
          listOptions,
        )
        return {
          items: page.items.map((item) => {
            const ref = createRef(definition.locatorFromListItem(item))
            return projectFacts(definition.toListFacts(item, ref), ref)
          }),
          ...(page.total === undefined ? {} : { total: page.total }),
          ...(page.nextCursor === undefined
            ? {}
            : { nextCursor: page.nextCursor }),
        }
      }, mapFailure),
    get: (ref, getOptions) =>
      mapOperation(async () => {
        const current = await readDetail(ref, getOptions)
        return projectFacts(
          definition.toDetailFacts(current.detail, current.ref),
          current.ref,
        )
      }, mapFailure),
    openEditEditor: (ref, editorOptions) =>
      mapOperation(async () => {
        const current = await readDetail(ref, editorOptions)
        const editorDefinition = definition.editEditor(
          config,
          providerScope,
          current.detail,
        )
        return createAccountKeyResourceEditor({
          mapFailure,
          editorDefinition,
          resolveDestinationScopeKey: () => canonicalScopeKey,
          mutate: async (command, submitOptions) => {
            const latest = await readDetail(current.ref, submitOptions)
            return definition.update(
              config,
              providerScope,
              latest.detail,
              command,
              submitOptions,
            )
          },
          projectApplied: (detail) => {
            const returnedRef = createRef(definition.locatorFromDetail(detail))
            if (!refBoundary.refsMatch(returnedRef, current.ref)) {
              throw unexpectedFailure()
            }
            return {
              facts: projectFacts(
                definition.toDetailFacts(detail, returnedRef),
                returnedRef,
              ),
            }
          },
        })
      }, mapFailure),
    delete: (ref, deleteOptions) =>
      mapOperation(async () => {
        const { locator } = decodeRef(ref)
        const resolution = resolveNativeResourceMutation(
          await definition.delete(
            config,
            providerScope,
            locator,
            deleteOptions,
          ),
        )
        if (resolution.status === "not-applied") {
          throw new AccountKeyResourceError(mapFailure(resolution.failure))
        }
        if (resolution.status === "uncertain") {
          const failure = mapFailure(resolution.failure)
          throw new AccountKeyResourceError({
            code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
            ...(failure.message ? { message: failure.message } : {}),
            ...(failure.upstreamCode
              ? { upstreamCode: failure.upstreamCode }
              : {}),
          })
        }
      }, mapFailure),
  }
}
